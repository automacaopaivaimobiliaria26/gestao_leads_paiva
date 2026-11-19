import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// Read .env without a dependency. Existing process environment takes precedence.
try {
  const envText = await readFile(path.join(here, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

const config = {
  base: (process.env.NOCODB_BASE_URL || '').replace(/\/$/, ''),
  basePath: (process.env.DASHBOARD_BASE_PATH || '').trim().replace(/\/$/, ''),
  token: process.env.NOCODB_API_TOKEN || '',
  tables: { leads: process.env.NOCODB_LEADS_TABLE_ID || '', eventos: process.env.NOCODB_EVENTOS_TABLE_ID || '' },
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const readBody = async req => {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Payload muito grande.'); }
  return raw ? JSON.parse(raw) : {};
};
const nocodb = async (table, method, suffix = '', body) => {
  const url = `${config.base}/api/v2/tables/${encodeURIComponent(table)}/records${suffix}`;
  const response = await fetch(url, { method, headers: { 'xc-token': config.token, 'Content-Type': 'application/json', Accept: 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text(); let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) throw Object.assign(new Error(data.msg || data.message || `NocoDB respondeu ${response.status}`), { status: response.status });
  return data;
};

const server = http.createServer(async (req, res) => {
  // Configure HTTP Basic Auth in Easypanel's Security tab for every attached domain.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');
  // Easypanel can forward a path domain with or without stripping the prefix.
  // Accept both forms so the same image works with either proxy behavior.
  const routePath = config.basePath && (url.pathname === config.basePath || url.pathname.startsWith(`${config.basePath}/`))
    ? (url.pathname.slice(config.basePath.length) || '/')
    : url.pathname;
  if (routePath.startsWith('/api/')) {
    if (!config.base || !config.token || !config.tables.leads || !config.tables.eventos) return json(res, 503, { error: 'Configure URL, token e Table IDs no arquivo .env e reinicie o servidor.' });
    const match = routePath.match(/^\/api\/(leads|eventos)(?:\/([^/]+))?$/);
    if (!match) return json(res, 404, { error: 'Endpoint não encontrado.' });
    const [, resource, recordId] = match; const table = config.tables[resource];
    try {
      if (req.method === 'GET' && !recordId) {
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 100)));
        const data = await nocodb(table, 'GET', `?page=${page}&limit=${limit}`);
        return json(res, 200, data);
      }
      if (req.method === 'POST' && !recordId) {
        const record = await readBody(req);
        return json(res, 201, await nocodb(table, 'POST', '', [record]));
      }
      if (req.method === 'PATCH' && recordId) {
        const record = await readBody(req);
        // NocoDB API v2 updates rows through PATCH /records with an Id in each row.
        return json(res, 200, await nocodb(table, 'PATCH', '', [{ Id: recordId, ...record }]));
      }
      if (req.method === 'DELETE' && recordId) {
        // NocoDB v2 bulk delete accepts record identifiers in the request body.
        return json(res, 200, await nocodb(table, 'DELETE', '', [{ Id: recordId }]));
      }
      return json(res, 405, { error: 'Método não permitido.' });
    } catch (error) { return json(res, error.status || 502, { error: error.message }); }
  }
  const filePath = routePath === '/' || routePath === config.basePath ? path.join(here, 'public', 'index.html') : path.join(here, 'public', path.basename(routePath));
  try { const content = await readFile(filePath); res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(content); }
  catch { res.writeHead(404); res.end('Não encontrado'); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Dashboard disponível em http://localhost:${port}`));

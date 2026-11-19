import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
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
  token: process.env.NOCODB_API_TOKEN || '',
  username: process.env.DASHBOARD_USERNAME || '',
  password: process.env.DASHBOARD_PASSWORD || '',
  tables: { leads: process.env.NOCODB_LEADS_TABLE_ID || '', eventos: process.env.NOCODB_EVENTOS_TABLE_ID || '' },
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const readBody = async req => {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Payload muito grande.'); }
  return raw ? JSON.parse(raw) : {};
};
const digest = value => createHash('sha256').update(value).digest();
const authorized = req => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ') || !config.username || !config.password) return false;
  let decoded; try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const splitAt = decoded.indexOf(':'); if (splitAt < 0) return false;
  const user = decoded.slice(0, splitAt), pass = decoded.slice(splitAt + 1);
  return timingSafeEqual(digest(user), digest(config.username)) && timingSafeEqual(digest(pass), digest(config.password));
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
  // Basic Auth protects both the dashboard and every data endpoint.
  if (!config.username || !config.password) return json(res, 503, { error: 'Configure DASHBOARD_USERNAME e DASHBOARD_PASSWORD nas variáveis da aplicação.' });
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Dashboard Leads e Eventos", charset="UTF-8"', 'Cache-Control': 'no-store' });
    return res.end('Autenticação necessária.');
  }
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (!config.base || !config.token || !config.tables.leads || !config.tables.eventos) return json(res, 503, { error: 'Configure URL, token e Table IDs no arquivo .env e reinicie o servidor.' });
    const match = url.pathname.match(/^\/api\/(leads|eventos)(?:\/([^/]+))?$/);
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
        return json(res, 200, await nocodb(table, 'PATCH', `/${encodeURIComponent(recordId)}`, record));
      }
      if (req.method === 'DELETE' && recordId) {
        await nocodb(table, 'DELETE', `/${encodeURIComponent(recordId)}`);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'Método não permitido.' });
    } catch (error) { return json(res, error.status || 502, { error: error.message }); }
  }
  const filePath = url.pathname === '/' ? path.join(here, 'public', 'index.html') : path.join(here, 'public', path.basename(url.pathname));
  try { const content = await readFile(filePath); res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(content); }
  catch { res.writeHead(404); res.end('Não encontrado'); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Dashboard disponível em http://localhost:${port}`));

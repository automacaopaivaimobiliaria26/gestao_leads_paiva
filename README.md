# Dashboard Leads & Eventos — NocoDB

Aplicação que consulta e edita diretamente as tabelas `Leads` e `Eventos` pela API do NocoDB. O servidor exige usuário e senha via HTTP Basic Auth antes de servir a página ou qualquer API. O token do NocoDB e as credenciais do dashboard ficam somente nas variáveis de ambiente do servidor e nunca são enviados ao navegador.

## Requisitos

- Node.js 18 ou superior
- URL da instância NocoDB
- API token com permissão para ler e editar as duas tabelas
- Table ID de `Leads` e Table ID de `Eventos`
- Usuário e senha exclusivos para o dashboard

## Configuração

1. Para executar localmente, copie `.env.example` para `.env` e preencha as variáveis. No EasyPanel, configure as variáveis diretamente nas configurações de ambiente/Environment da aplicação; não inclua valores secretos na imagem ou no repositório.
2. Configure `NOCODB_BASE_URL`, `NOCODB_API_TOKEN`, `NOCODB_LEADS_TABLE_ID` e `NOCODB_EVENTOS_TABLE_ID`.
3. Defina `DASHBOARD_USERNAME` e `DASHBOARD_PASSWORD`. Use uma senha longa e exclusiva. O acesso é protegido por HTTP Basic Auth, e o navegador solicitará usuário e senha ao abrir o domínio.
4. Para desenvolvimento local, execute `npm start` e abra `http://localhost:3000`. Para o servidor, publique pelo EasyPanel usando o Dockerfile desta pasta.

## Publicação no EasyPanel

1. Crie uma aplicação no projeto EasyPanel e conecte o repositório ou carregue esta pasta com o `Dockerfile`.
2. Defina o domínio da aplicação e habilite HTTPS/Let's Encrypt no EasyPanel. O container escuta na porta interna `3000`; não abra essa porta no firewall nem publique outra porta diretamente.
3. Na seção **Environment Variables** (ou configurações de ambiente) da aplicação, configure `NOCODB_BASE_URL`, `NOCODB_API_TOKEN`, `NOCODB_LEADS_TABLE_ID`, `NOCODB_EVENTOS_TABLE_ID`, `DASHBOARD_USERNAME` e `DASHBOARD_PASSWORD`.
4. Faça deploy/redeploy após gravar as variáveis. Acesse pelo domínio HTTPS e autentique com as credenciais definidas.

O Traefik/EasyPanel termina TLS para o domínio público. HTTP Basic Auth deve ser usado somente pelo domínio HTTPS, para que as credenciais trafeguem criptografadas.

O token e a senha devem permanecer somente nas variáveis do servidor. Não publique o arquivo `.env` nem adicione os segredos ao HTML/imagem. Ao hospedar, use HTTPS.

## Table IDs

No NocoDB, abra cada tabela e consulte os detalhes da API/URL da tabela. O identificador é o `Table ID` (frequentemente começa com `m`), não o nome exibido. O token pode ser criado em **Account Settings → Tokens**. Conceda acesso apenas à base e às tabelas necessárias.

## Uso

O dashboard lê registros paginados, oferece busca e formulário dinâmico com os campos da tabela, e envia inclusões/edições diretamente ao NocoDB. Os campos técnicos de auditoria são mantidos fora do formulário. As exclusões não são oferecidas pela interface.

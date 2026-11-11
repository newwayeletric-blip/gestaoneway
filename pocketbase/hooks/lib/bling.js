/**
 * Biblioteca do Bling (API v3, OAuth 2.0 authorization code), usada pelas
 * rotas de pocketbase/hooks/bling.js e, depois, pela emissão da NF-e.
 * Não é hook: o PocketBase só carrega pb_hooks/*.pb.js; isto entra por
 * require(`${__hooks}/lib/bling.js`).
 * - O token de acesso vale cerca de 6 h e o de renovação 30 dias; a renovação
 *   devolve um novo par. O código da autorização vale só 30 s.
 * - Credenciais vão no cabeçalho Basic (client_id:client_secret), nunca no corpo.
 * - Endereços: a tela de autorização fica em www.bling.com.br (o navegador do
 *   administrador vai até lá); a troca e a renovação dos tokens e a API, em
 *   api.bling.com.br. BLING_OAUTH_BASE (os dois do OAuth) e BLING_API_BASE
 *   trocam os padrões (testes).
 */
const OAUTH_BASE = () =>
  String($os.getenv('BLING_OAUTH_BASE') || 'https://www.bling.com.br/Api/v3/oauth').replace(
    /\/$/,
    '',
  )
const TOKEN_URL = () =>
  String($os.getenv('BLING_OAUTH_BASE') || 'https://api.bling.com.br/Api/v3/oauth').replace(
    /\/$/,
    '',
  ) + '/token'
const API_BASE = () =>
  String($os.getenv('BLING_API_BASE') || 'https://api.bling.com.br/Api/v3').replace(/\/$/, '')

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
// Base64 de texto ASCII (as chaves do Bling são ASCII).
function base64(text) {
  let out = ''
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i)
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) : NaN
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) : NaN
    const n = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += isNaN(b) ? '=' : B64[(n >> 6) & 63]
    out += isNaN(c) ? '=' : B64[n & 63]
  }
  return out
}

function form(params) {
  return Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&')
}

function find(app, orgId) {
  const rows = app.findRecordsByFilter(
    'integrations',
    "org = {:org} && provider = 'bling'",
    '',
    1,
    0,
    { org: orgId },
  )
  return rows.length > 0 ? rows[0] : null
}

// Motivo legível de uma resposta de erro do Bling ({ error: { message,
// description, fields: [{ msg }] } }), com o detalhe de cada campo.
function describe(res) {
  const j = res.json || {}
  const err = j.error || {}
  if (typeof err === 'string') return err
  const parts = []
  const main = err.description || err.message || err.type || j.error_description || ''
  if (main) parts.push(String(main))
  const fields = err.fields || []
  for (let i = 0; i < fields.length && i < 5; i++) {
    const msg = fields[i] && (fields[i].msg || fields[i].message)
    if (msg && parts.indexOf(String(msg)) === -1) parts.push(String(msg))
  }
  return parts.length ? parts.join(' — ') : 'HTTP ' + res.statusCode
}

// Pede tokens ao Bling (código da autorização ou renovação) e grava no registro.
function requestTokens(app, rec, params) {
  const res = $http.send({
    url: TOKEN_URL(),
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      Authorization:
        'Basic ' + base64(rec.getString('client_id') + ':' + rec.getString('client_secret')),
    },
    body: form(params),
    timeout: 20,
  })
  const j = res.json || {}
  if (res.statusCode !== 200 || !j.access_token) {
    throw new Error('o Bling recusou a autorização (' + describe(res) + ')')
  }
  const now = Date.now()
  rec.set('access_token', j.access_token)
  if (j.refresh_token) rec.set('refresh_token', j.refresh_token)
  rec.set('token_expires_at', now + (Number(j.expires_in) || 21600) * 1000)
  rec.set('last_refresh_at', now)
  rec.set('last_error', '')
  app.save(rec)
  return j.access_token
}

const TOKEN_FIELDS = ['access_token', 'refresh_token', 'token_expires_at', 'last_refresh_at']

function refresh(app, rec) {
  // Outra requisição pode ter renovado agora (o Bling troca o par a cada
  // renovação e o par antigo deixa de valer): usa o que já está gravado.
  const saved = app.findRecordById('integrations', rec.id)
  if (
    saved.getString('access_token') !== rec.getString('access_token') &&
    saved.getFloat('token_expires_at') - Date.now() > 5 * 60 * 1000
  ) {
    for (const f of TOKEN_FIELDS) rec.set(f, saved.get(f))
    return saved.getString('access_token')
  }
  if (!rec.getString('refresh_token')) throw new Error('o Bling não está conectado')
  return requestTokens(app, rec, {
    grant_type: 'refresh_token',
    refresh_token: rec.getString('refresh_token'),
  })
}

// Token válido por pelo menos 5 minutos; renova antes, se preciso.
function accessToken(app, rec) {
  if (!rec.getString('access_token')) throw new Error('o Bling não está conectado')
  if (rec.getFloat('token_expires_at') - Date.now() > 5 * 60 * 1000) {
    return rec.getString('access_token')
  }
  return refresh(app, rec)
}

// Chamada à API v3; se o token tiver caído (401), renova uma vez e repete.
function call(app, rec, method, path, body) {
  const send = (token) =>
    $http.send({
      url: API_BASE() + path,
      method: method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? '' : JSON.stringify(body),
      timeout: 30,
    })
  let res = send(accessToken(app, rec))
  if (res.statusCode === 401) res = send(refresh(app, rec))
  return res
}

function company(app, rec) {
  const res = call(app, rec, 'GET', '/empresas/me/dados-basicos')
  if (res.statusCode !== 200)
    throw new Error('não consegui ler os dados da empresa (' + describe(res) + ')')
  const d = (res.json && res.json.data) || {}
  return { name: String(d.nome || ''), cnpj: String(d.cnpj || '') }
}

// Desfaz a conexão (tokens e dados da empresa); as chaves do aplicativo ficam.
function clearConnection(rec) {
  for (const f of [
    'access_token',
    'refresh_token',
    'company_name',
    'company_cnpj',
    'oauth_state',
    'last_error',
  ]) {
    rec.set(f, '')
  }
  for (const f of [
    'token_expires_at',
    'oauth_state_expires_at',
    'connected_at',
    'last_refresh_at',
  ]) {
    rec.set(f, 0)
  }
  rec.set('connected_by', '')
}

// O que a tela pode ver: nada de secret nem de token. Do Client ID, só o final.
function status(app, rec) {
  const id = rec ? rec.getString('client_id') : ''
  return {
    configured: !!(id && rec.getString('client_secret')),
    clientIdEnd: id ? id.slice(-6) : '',
    connected: !!(rec && rec.getString('refresh_token')),
    companyName: rec ? rec.getString('company_name') : '',
    companyCnpj: rec ? rec.getString('company_cnpj') : '',
    connectedAt: rec ? rec.getFloat('connected_at') : 0,
    lastRefreshAt: rec ? rec.getFloat('last_refresh_at') : 0,
    tokenExpiresAt: rec ? rec.getFloat('token_expires_at') : 0,
    lastError: rec ? rec.getString('last_error') : '',
    nfeNaturezaId: rec ? rec.getFloat('nfe_natureza_id') : 0,
    nfeNaturezaName: rec ? rec.getString('nfe_natureza_name') : '',
    nfeNcmDefault: (rec && rec.getString('nfe_ncm_default')) || '8711.60.00',
  }
}

function audit(app, rec, user, ip, reason) {
  if (!user) return
  const log = new Record(app.findCollectionByNameOrId('audit_logs'))
  log.set('org', rec.getString('org'))
  log.set('entity', 'integrations')
  log.set('record_id', rec.id)
  log.set('action', 'alteracao')
  log.set('user', user.id)
  log.set('reason', reason)
  log.set('ip_address', ip)
  app.save(log)
}

module.exports = {
  OAUTH_BASE: OAUTH_BASE,
  base64: base64,
  find: find,
  describe: describe,
  requestTokens: requestTokens,
  refresh: refresh,
  accessToken: accessToken,
  call: call,
  company: company,
  clearConnection: clearConnection,
  status: status,
  audit: audit,
}

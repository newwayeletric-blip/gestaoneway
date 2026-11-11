// Conexão com o Bling (Configurações → Bling): só o administrador; as chaves
// e os tokens nunca voltam para a tela; o state amarra a volta do Bling; o
// código é trocado com o cabeçalho Basic; o token renova sozinho.
// Um servidor HTTP de mentira faz o papel do Bling (BLING_OAUTH_BASE e
// BLING_API_BASE apontam para ele).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SETUP_TOKEN, client, runPocketBase, startPocketBase } from './harness.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PASSWORD = 'SenhaForte!2026'
const CLIENT_ID = 'cid0123456789abcdef0123456789abcdef01234'
const CLIENT_SECRET = 'segredo0123456789ABCDEFGHIJabcdefghij0123456789xyz'
let pb
let api
let fake
const ctx = {}

function startFakeBling() {
  const bling = {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    expiresIn: 21600,
    tokenCalls: [],
    apiCalls: [],
    valid: new Set(),
    refreshTokens: new Set(),
    n: 0,
  }
  const send = (res, status, json) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(json))
  }
  bling.server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const url = new URL(req.url, 'http://bling')
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      const params = Object.fromEntries(new URLSearchParams(body))
      bling.tokenCalls.push({ auth: req.headers.authorization, accept: req.headers.accept, params })
      const basic = 'Basic ' + Buffer.from(bling.clientId + ':' + bling.clientSecret).toString('base64')
      const okCode = params.grant_type === 'authorization_code' && params.code === 'codigo-bom'
      const okRefresh = params.grant_type === 'refresh_token' && bling.refreshTokens.has(params.refresh_token)
      if (req.headers.authorization !== basic || !(okCode || okRefresh)) {
        return send(res, 400, { error: { type: 'invalid_grant', message: 'invalid_grant', description: 'Código inválido' } })
      }
      if (okRefresh) bling.refreshTokens.delete(params.refresh_token)
      bling.n++
      bling.valid.add('access-' + bling.n)
      bling.refreshTokens.add('refresh-' + bling.n)
      return send(res, 200, {
        access_token: 'access-' + bling.n,
        expires_in: bling.expiresIn,
        token_type: 'Bearer',
        refresh_token: 'refresh-' + bling.n,
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/empresas/me/dados-basicos') {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '')
      bling.apiCalls.push(token)
      if (!bling.valid.has(token)) return send(res, 401, { error: { type: 'invalid_token', message: 'invalid_token' } })
      return send(res, 200, { data: { nome: 'NEW WAY ELETRIC LTDA', cnpj: '65.321.600/0001-05' } })
    }
    send(res, 404, {})
  })
  return new Promise((resolve) => {
    bling.server.listen(0, '127.0.0.1', () => {
      bling.url = `http://127.0.0.1:${bling.server.address().port}`
      resolve(bling)
    })
  })
}

const login = async (email) =>
  (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: email, password: PASSWORD } }))
    .json.token

// A volta do Bling para o sistema: o navegador segue o redirecionamento.
async function callback(query) {
  const res = await fetch(pb.baseUrl + '/backend/v1/bling/callback?' + new URLSearchParams(query), {
    redirect: 'manual',
  })
  assert.equal(res.status, 302)
  return res.headers.get('location')
}

async function connect(code = 'codigo-bom') {
  const res = await api('POST', '/backend/v1/bling/connect', { token: ctx.owner })
  assert.equal(res.status, 200, res.text)
  const url = new URL(res.json.url)
  return callback({ code, state: url.searchParams.get('state') })
}

const status = async () => (await api('GET', '/backend/v1/bling/status', { token: ctx.owner })).json

before(async () => {
  fake = await startFakeBling()
  process.env.BLING_OAUTH_BASE = fake.url + '/oauth'
  process.env.BLING_API_BASE = fake.url + '/api'
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  assert.equal(setup.status, 200, setup.text)
  ctx.owner = setup.json.token
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.owner })).json.items
  for (const [email, profile] of [
    ['vendedor@newway.dev', 'vendedor'],
    ['gerente@newway.dev', 'gerente'],
  ]) {
    const res = await api('POST', '/api/collections/users/records', {
      token: ctx.owner,
      body: { email, name: profile, password: PASSWORD, passwordConfirm: PASSWORD, profile, stores: [stores[0].id] },
    })
    assert.equal(res.status, 200, res.text)
  }
  ctx.seller = await login('vendedor@newway.dev')
  ctx.manager = await login('gerente@newway.dev')
})

after(async () => {
  if (pb) await pb.stop()
  fake?.server.close()
})

test('base64 do cabeçalho Basic igual ao do Node', () => {
  const lib = { exports: {} }
  new Function('module', 'exports', readFileSync(path.join(ROOT, 'pocketbase', 'hooks', 'lib', 'bling.js'), 'utf8'))(
    lib,
    lib.exports,
  )
  for (const s of ['', 'a', 'ab', 'abc', 'abcd', CLIENT_ID + ':' + CLIENT_SECRET, 'x:y-z_9.~']) {
    assert.equal(lib.exports.base64(s), Buffer.from(s).toString('base64'), s)
  }
})

test('só o administrador mexe no Bling', async () => {
  for (const token of [ctx.seller, ctx.manager, undefined]) {
    assert.equal((await api('GET', '/backend/v1/bling/status', { token })).status, 403)
    for (const p of ['credentials', 'connect', 'test', 'disconnect']) {
      const res = await api('POST', '/backend/v1/bling/' + p, {
        token,
        body: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
      })
      assert.equal(res.status, 403, p)
    }
  }
  // A tabela das chaves não abre pela API, nem para o administrador.
  assert.equal((await api('GET', '/api/collections/integrations/records', { token: ctx.owner })).status, 403)
  assert.equal((await status()).configured, false)
})

test('chaves salvas sem voltar para a tela', async () => {
  let res = await api('POST', '/backend/v1/bling/connect', { token: ctx.owner })
  assert.equal(res.status, 400)
  res = await api('POST', '/backend/v1/bling/credentials', { token: ctx.owner, body: { client_id: CLIENT_ID } })
  assert.equal(res.status, 400)
  assert.match(res.json.message, /Client Secret/)
  res = await api('POST', '/backend/v1/bling/credentials', {
    token: ctx.owner,
    body: { client_id: 'abc', client_secret: CLIENT_SECRET },
  })
  assert.equal(res.status, 400)
  // Colado com espaço e quebra de linha.
  res = await api('POST', '/backend/v1/bling/credentials', {
    token: ctx.owner,
    body: { client_id: ' ' + CLIENT_ID + '\n', client_secret: CLIENT_SECRET + ' \r\n' },
  })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.configured, true)
  assert.equal(res.json.connected, false)
  assert.equal(res.json.clientIdEnd, CLIENT_ID.slice(-6))
  assert.ok(!res.text.includes(CLIENT_SECRET) && !res.text.includes(CLIENT_ID))
  // Mesmo Client ID sem secret: mantém o guardado.
  res = await api('POST', '/backend/v1/bling/credentials', { token: ctx.owner, body: { client_id: CLIENT_ID } })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.configured, true)
})

test('conectar: o Bling volta, o sistema troca o código e lê a empresa', async () => {
  const res = await api('POST', '/backend/v1/bling/connect', { token: ctx.owner })
  assert.equal(res.status, 200, res.text)
  const url = new URL(res.json.url)
  assert.equal(url.origin + url.pathname, fake.url + '/oauth/authorize')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID)
  const state = url.searchParams.get('state')
  assert.match(state, /^[A-Za-z0-9]{40}$/)

  assert.equal(await callback({ code: 'codigo-bom', state }), 'https://nwcrmapp.com/configuracoes?bling=conectado')
  const call = fake.tokenCalls.at(-1)
  assert.equal(call.params.grant_type, 'authorization_code')
  assert.equal(call.params.code, 'codigo-bom')
  assert.equal(call.params.client_secret, undefined, 'o secret não vai no corpo')
  assert.equal(call.accept, '1.0')

  const s = await status()
  assert.equal(s.connected, true)
  assert.equal(s.companyName, 'NEW WAY ELETRIC LTDA')
  assert.equal(s.companyCnpj, '65.321.600/0001-05')
  assert.equal(s.lastError, '')
  assert.ok(s.connectedAt > 0 && s.tokenExpiresAt > Date.now() + 5 * 3600 * 1000)
  const text = JSON.stringify(s)
  assert.ok(!/access-|refresh-/.test(text) && !text.includes(CLIENT_SECRET))

  // O state vale uma vez só.
  const calls = fake.tokenCalls.length
  assert.equal(await callback({ code: 'codigo-bom', state }), 'https://nwcrmapp.com/configuracoes?bling=erro')
  assert.equal(await callback({ code: 'codigo-bom', state: 'A'.repeat(40) }), 'https://nwcrmapp.com/configuracoes?bling=erro')
  assert.equal(await callback({ code: 'codigo-bom' }), 'https://nwcrmapp.com/configuracoes?bling=erro')
  assert.equal(fake.tokenCalls.length, calls, 'state inválido não chega ao Bling')
})

test('código recusado ou autorização cancelada: erro na tela, a conexão anterior continua', async () => {
  assert.equal(await connect('codigo-ruim'), 'https://nwcrmapp.com/configuracoes?bling=erro')
  let s = await status()
  assert.equal(s.connected, true)
  assert.match(s.lastError, /Não consegui conectar: o Bling recusou a autorização \(Código inválido\)/)

  const res = await api('POST', '/backend/v1/bling/connect', { token: ctx.owner })
  const state = new URL(res.json.url).searchParams.get('state')
  assert.equal(await callback({ error: 'access_denied', state }), 'https://nwcrmapp.com/configuracoes?bling=erro')
  s = await status()
  assert.equal(s.connected, true)
  assert.match(s.lastError, /recusada no Bling/)

  // Testar a conexão funciona e limpa o aviso.
  const check = await api('POST', '/backend/v1/bling/test', { token: ctx.owner })
  assert.equal(check.status, 200, check.text)
  assert.equal(check.json.lastError, '')
})

test('token derrubado pelo Bling: renova sozinho e repete a chamada', async () => {
  const before = fake.tokenCalls.length
  const oldRefresh = [...fake.refreshTokens].at(-1)
  fake.valid.clear()
  const res = await api('POST', '/backend/v1/bling/test', { token: ctx.owner })
  assert.equal(res.status, 200, res.text)
  const calls = fake.tokenCalls.slice(before)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.grant_type, 'refresh_token')
  assert.equal(calls[0].params.refresh_token, oldRefresh)
  assert.equal(fake.apiCalls.at(-1), 'access-' + fake.n)
})

test('token perto de vencer: renova antes de chamar', async () => {
  fake.expiresIn = 60
  assert.equal(await connect(), 'https://nwcrmapp.com/configuracoes?bling=conectado')
  const shortLived = 'access-' + fake.n
  fake.expiresIn = 21600
  const before = fake.apiCalls.length
  const res = await api('POST', '/backend/v1/bling/test', { token: ctx.owner })
  assert.equal(res.status, 200, res.text)
  assert.equal(fake.tokenCalls.at(-1).params.grant_type, 'refresh_token')
  assert.deepEqual(fake.apiCalls.slice(before), ['access-' + fake.n])
  assert.notEqual(fake.apiCalls.at(-1), shortLived)
  assert.ok(res.json.tokenExpiresAt > Date.now() + 5 * 3600 * 1000)
})

test('desconectar apaga os tokens; trocar as chaves também', async () => {
  let res = await api('POST', '/backend/v1/bling/disconnect', { token: ctx.owner })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.connected, false)
  assert.equal(res.json.configured, true)
  assert.equal(res.json.companyName, '')
  assert.equal((await api('POST', '/backend/v1/bling/test', { token: ctx.owner })).status, 400)

  assert.equal(await connect(), 'https://nwcrmapp.com/configuracoes?bling=conectado')
  assert.equal((await status()).connected, true)
  fake.clientId = 'outroapp0123456789'
  fake.clientSecret = 'outrosegredo0123456789'
  res = await api('POST', '/backend/v1/bling/credentials', {
    token: ctx.owner,
    body: { client_id: fake.clientId, client_secret: fake.clientSecret },
  })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.connected, false)
  assert.equal(res.json.clientIdEnd, '456789')
  assert.equal(await connect(), 'https://nwcrmapp.com/configuracoes?bling=conectado')
})

test('a auditoria registra sem guardar chave nem token', async () => {
  const res = await api('GET', "/api/collections/audit_logs/records?perPage=50&filter=(entity='integrations')", {
    token: ctx.owner,
  })
  assert.equal(res.status, 200, res.text)
  const reasons = res.json.items.map((i) => i.reason)
  assert.ok(reasons.includes('Chaves do aplicativo do Bling salvas'))
  assert.ok(reasons.includes('Bling conectado (NEW WAY ELETRIC LTDA)'))
  assert.ok(reasons.includes('Bling desconectado'))
  assert.ok(!/access-|refresh-|segredo/.test(res.text))
  assert.ok(!/access-|refresh-|segredo/.test(pb.log()), 'nada disso no log')
})

test('a rotina de hora em hora renova o token que vence em menos de 2 horas', async () => {
  fake.expiresIn = 3600
  assert.equal(await connect(), 'https://nwcrmapp.com/configuracoes?bling=conectado')
  fake.expiresIn = 21600
  const before = await status()
  assert.ok(before.tokenExpiresAt < Date.now() + 2 * 3600 * 1000)

  // Um superusuário dispara a rotina na hora (POST /api/crons/{id}).
  await pb.stop({ keepData: true })
  await runPocketBase(pb.dir, ['superuser', 'upsert', 'su@newway.dev', PASSWORD])
  pb = await startPocketBase({ dir: pb.dir })
  api = client(pb.baseUrl)
  const su = await api('POST', '/api/collections/_superusers/auth-with-password', {
    body: { identity: 'su@newway.dev', password: PASSWORD },
  })
  assert.equal(su.status, 200, su.text)
  const calls = fake.tokenCalls.length
  const run = await api('POST', '/api/crons/bling_refresh', { token: su.json.token })
  assert.equal(run.status, 204, run.text)
  // A rotina roda em segundo plano depois do disparo.
  for (let i = 0; i < 50 && fake.tokenCalls.length === calls; i++) await new Promise((r) => setTimeout(r, 100))
  assert.equal(fake.tokenCalls.length, calls + 1)
  assert.equal(fake.tokenCalls.at(-1).params.grant_type, 'refresh_token')
  const after = await status()
  assert.equal(after.connected, true)
  assert.ok(after.tokenExpiresAt > Date.now() + 5 * 3600 * 1000)

  // Quem não vence logo fica como está.
  assert.equal((await api('POST', '/api/crons/bling_refresh', { token: su.json.token })).status, 204)
  await new Promise((r) => setTimeout(r, 1000))
  assert.equal(fake.tokenCalls.length, calls + 1)
})

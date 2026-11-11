/**
 * Conexão com o Bling (dono, 11/11/2026), em Configurações → Bling. Só o
 * administrador da organização. O sistema é o cadastro mestre; o Bling só
 * emite a NF-e. As chaves do aplicativo (Client ID e Client Secret, criadas
 * na Central de Extensões do Bling) e os tokens ficam na coleção
 * integrations, sem acesso pela API: o secret e os tokens nunca voltam para
 * a tela nem vão para o log.
 * - GET  /backend/v1/bling/status       situação da conexão
 * - POST /backend/v1/bling/credentials  { client_id, client_secret? } (trocar o
 *   Client ID desfaz a conexão; secret vazio mantém o que está guardado)
 * - POST /backend/v1/bling/connect      devolve o endereço de autorização do Bling
 * - GET  /backend/v1/bling/callback     o Bling volta aqui (link de
 *   redirecionamento cadastrado no aplicativo); confere o state, troca o
 *   código pelos tokens e manda o navegador para /configuracoes?bling=...
 * - POST /backend/v1/bling/test         lê os dados da empresa no Bling
 * - POST /backend/v1/bling/disconnect   apaga os tokens (as chaves ficam)
 * - cron bling_refresh: renova os tokens antes de vencerem, para a conexão
 *   não cair quando ninguém usa o sistema (o token de renovação vale 30 dias).
 * Os handlers do PocketBase rodam isolados: cada um carrega a biblioteca.
 */
routerAdd('GET', '/backend/v1/bling/status', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador configura o Bling.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  return e.json(200, bling.status($app, bling.find($app, auth.getString('org'))))
})

routerAdd('POST', '/backend/v1/bling/credentials', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador configura o Bling.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const orgId = auth.getString('org')
  const body = e.requestInfo().body || {}
  // Chaves coladas da tela do Bling: espaços e quebras de linha não fazem parte.
  const clean = (v) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, '')
  const clientId = clean(body.client_id)
  const clientSecret = clean(body.client_secret)
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(clientId)) {
    throw new BadRequestError('Client ID inválido: copie de novo do aplicativo no Bling.')
  }
  if (clientSecret && !/^[A-Za-z0-9._-]{8,300}$/.test(clientSecret)) {
    throw new BadRequestError('Client Secret inválido: copie de novo do aplicativo no Bling.')
  }

  let rec = bling.find($app, orgId)
  const changedId = !rec || rec.getString('client_id') !== clientId
  if (!clientSecret && (changedId || !rec.getString('client_secret'))) {
    throw new BadRequestError('Informe o Client Secret do aplicativo no Bling.')
  }
  if (!rec) {
    rec = new Record($app.findCollectionByNameOrId('integrations'))
    rec.set('org', orgId)
    rec.set('provider', 'bling')
  }
  rec.set('client_id', clientId)
  if (clientSecret) rec.set('client_secret', clientSecret)
  // Chaves de outro aplicativo: a conexão antiga não vale mais.
  if (changedId || clientSecret) bling.clearConnection(rec)
  $app.save(rec)
  bling.audit($app, rec, auth, e.realIP(), 'Chaves do aplicativo do Bling salvas')
  return e.json(200, bling.status($app, rec))
})

routerAdd('POST', '/backend/v1/bling/connect', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador configura o Bling.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('client_id') || !rec.getString('client_secret')) {
    throw new BadRequestError('Salve primeiro o Client ID e o Client Secret.')
  }
  // O state amarra a volta do Bling a este pedido; vale 10 minutos e uma vez.
  const state = $security.randomString(40)
  rec.set('oauth_state', state)
  rec.set('oauth_state_expires_at', Date.now() + 10 * 60 * 1000)
  rec.set('connected_by', auth.id)
  $app.save(rec)
  return e.json(200, {
    url:
      bling.OAUTH_BASE() +
      '/authorize?response_type=code&client_id=' +
      encodeURIComponent(rec.getString('client_id')) +
      '&state=' +
      encodeURIComponent(state),
  })
})

// Público: quem chega aqui é o navegador do administrador, vindo do Bling.
// Qualquer falha volta para a tela com bling=erro; o motivo fica em last_error
// (quando dá para saber de qual organização é o pedido).
routerAdd('GET', '/backend/v1/bling/callback', (e) => {
  const bling = require(`${__hooks}/lib/bling.js`)
  const back = (result) =>
    e.redirect(
      302,
      String($app.settings().meta.appURL || '').replace(/\/$/, '') +
        '/configuracoes?bling=' +
        result,
    )
  const q = e.request.url.query()
  const state = String(q.get('state') || '')
  const code = String(q.get('code') || '')
  if (!/^[A-Za-z0-9]{40}$/.test(state)) return back('erro')

  const found = $app.findRecordsByFilter(
    'integrations',
    "provider = 'bling' && oauth_state = {:state}",
    '',
    1,
    0,
    { state: state },
  )
  if (found.length === 0) return back('erro')
  const rec = found[0]
  const expired = rec.getFloat('oauth_state_expires_at') < Date.now()
  rec.set('oauth_state', '')
  rec.set('oauth_state_expires_at', 0)
  if (expired || !code) {
    rec.set(
      'last_error',
      expired
        ? 'A autorização demorou demais. Clique de novo em "Conectar ao Bling".'
        : 'A autorização foi recusada no Bling.',
    )
    $app.save(rec)
    return back('erro')
  }
  $app.save(rec)

  // Se a troca falhar, uma conexão anterior continua como estava.
  try {
    bling.requestTokens($app, rec, { grant_type: 'authorization_code', code: code })
  } catch (err) {
    const fresh = $app.findRecordById('integrations', rec.id)
    fresh.set('last_error', 'Não consegui conectar: ' + String(err.message || err).slice(0, 300))
    $app.save(fresh)
    return back('erro')
  }
  rec.set('connected_at', Date.now())
  try {
    const company = bling.company($app, rec)
    rec.set('company_name', company.name)
    rec.set('company_cnpj', company.cnpj)
  } catch (err) {
    rec.set('company_name', '')
    rec.set('company_cnpj', '')
    rec.set('last_error', 'Conectado, mas ' + String(err.message || err).slice(0, 300))
  }
  $app.save(rec)
  let user = null
  try {
    user = $app.findRecordById('users', rec.getString('connected_by'))
  } catch (_) {}
  const name = rec.getString('company_name')
  bling.audit($app, rec, user, e.realIP(), 'Bling conectado' + (name ? ' (' + name + ')' : ''))
  return back('conectado')
})

routerAdd('POST', '/backend/v1/bling/test', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador configura o Bling.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('access_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    const company = bling.company($app, rec)
    rec.set('company_name', company.name)
    rec.set('company_cnpj', company.cnpj)
    rec.set('last_error', '')
    $app.save(rec)
  } catch (err) {
    const fresh = $app.findRecordById('integrations', rec.id)
    fresh.set('last_error', String(err.message || err).slice(0, 300))
    $app.save(fresh)
    throw new BadRequestError('O Bling não respondeu: ' + fresh.getString('last_error'))
  }
  return e.json(200, bling.status($app, rec))
})

routerAdd('POST', '/backend/v1/bling/disconnect', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador configura o Bling.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec) return e.json(200, bling.status($app, null))
  bling.clearConnection(rec)
  $app.save(rec)
  bling.audit($app, rec, auth, e.realIP(), 'Bling desconectado')
  return e.json(200, bling.status($app, rec))
})

// A cada hora: renova quem vence nas próximas 2 horas (o token dura ~6 h).
cronAdd('bling_refresh', '23 * * * *', () => {
  const bling = require(`${__hooks}/lib/bling.js`)
  const rows = $app.findRecordsByFilter(
    'integrations',
    "provider = 'bling' && refresh_token != '' && token_expires_at < {:limit}",
    '',
    0,
    0,
    { limit: Date.now() + 2 * 60 * 60 * 1000 },
  )
  for (const rec of rows) {
    try {
      bling.refresh($app, rec)
    } catch (err) {
      const fresh = $app.findRecordById('integrations', rec.id)
      fresh.set(
        'last_error',
        'Renovação automática falhou: ' + String(err.message || err).slice(0, 300),
      )
      $app.save(fresh)
    }
  }
})

/**
 * USR-01: cria o primeiro administrador.
 * - Só funciona com a tabela de usuários vazia: depois disso a rota responde
 *   404 para sempre (autodesativação).
 * - Exige o token de instalação SETUP_TOKEN, guardado como segredo do
 *   servidor (Skip Cloud → Secrets), nunca no .env do frontend.
 */
routerAdd('POST', '/backend/v1/setup', (e) => {
  const closedMsg = 'Configuração inicial já concluída. Esta rota está desativada.'
  if ($app.findRecordsByFilter('users', "id != ''", '', 1, 0).length > 0) {
    throw new NotFoundError(closedMsg)
  }

  let expected = ''
  try {
    expected = $secrets.get('SETUP_TOKEN') || ''
  } catch (_) {}
  if (!expected) {
    // Fora do Skip Cloud (ex.: testes locais) o token vem do ambiente.
    expected = $os.getenv('SETUP_TOKEN') || ''
  }
  if (expected.length < 24) {
    throw new ForbiddenError(
      'Instalação bloqueada: o segredo SETUP_TOKEN não está configurado no servidor (mínimo de 24 caracteres).',
    )
  }

  const body = e.requestInfo().body || {}
  // O token chega colado do terminal: às vezes com a linha quebrada no meio
  // pela janela, com espaços ou com o "SETUP_TOKEN=" junto.
  const clean = (v) =>
    String(v || '')
      .replace(/\s+/g, '')
      .replace(/^SETUP_TOKEN=/i, '')
  const token = clean(body.token)
  if ($security.sha256(token) !== $security.sha256(clean(expected))) {
    throw new ForbiddenError('Token de instalação inválido.')
  }

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  if (!name) throw new BadRequestError('Informe o nome completo.')
  if (!email || email.indexOf('@') < 1) throw new BadRequestError('Informe um e-mail válido.')
  if (password.length < 10) throw new BadRequestError('A senha deve ter no mínimo 10 caracteres.')
  if (password !== String(body.passwordConfirm || '')) {
    throw new BadRequestError('A confirmação de senha não coincide.')
  }

  let admin = null
  $app.runInTransaction((txApp) => {
    // Revalida dentro da transação: duas chamadas simultâneas não criam dois admins.
    if (txApp.findRecordsByFilter('users', "id != ''", '', 1, 0).length > 0) {
      throw new NotFoundError(closedMsg)
    }
    // O primeiro admin é o dono: admin das lojas próprias e da rede (PER-01).
    const own = txApp.findRecordsByFilter('organizations', "type = 'propria'", 'created', 1, 0)
    if (own.length === 0) {
      throw new BadRequestError('Organização própria não encontrada. Rode as migrations antes do setup.')
    }
    const rec = new Record(txApp.findCollectionByNameOrId('users'))
    rec.set('name', name)
    rec.setEmail(email)
    rec.setPassword(password)
    rec.setVerified(true)
    rec.set('emailVisibility', true)
    rec.set('profile', 'admin')
    rec.set('status', 'ativo')
    rec.set('org', own[0].id)
    rec.set('network_role', 'admin_rede')
    txApp.save(rec)

    const audit = new Record(txApp.findCollectionByNameOrId('audit_logs'))
    audit.set('entity', 'users')
    audit.set('record_id', rec.id)
    audit.set('action', 'criacao')
    audit.set('user', rec.id)
    audit.set('reason', 'Configuração inicial: primeiro administrador criado pela rota de setup')
    audit.set('new_values', { profile: 'admin', status: 'ativo', email: email })
    audit.set('ip_address', e.realIP())
    txApp.save(audit)

    admin = rec
  })

  return $apis.recordAuthResponse(e, admin, 'password', null)
})

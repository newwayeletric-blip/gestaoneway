/**
 * E-mail de envio do sistema (recuperação de senha), em Configurações → E-mail.
 * Só o admin da rede vê e troca. A senha do SMTP vai direto para as
 * configurações do PocketBase e nunca volta para a tela. Antes de salvar, o
 * servidor manda um e-mail de teste para quem está configurando: se o envio
 * falhar, nada muda.
 * Padrão: Gmail com senha de app (smtp.gmail.com, porta 465, TLS).
 */
routerAdd('GET', '/backend/v1/mail-settings', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('network_role') !== 'admin_rede'
  ) {
    throw new ForbiddenError('Apenas o admin da rede configura o e-mail do sistema.')
  }
  const s = $app.settings()
  return e.json(200, {
    enabled: s.smtp.enabled,
    host: s.smtp.host,
    port: s.smtp.port,
    username: s.smtp.username,
    hasPassword: !!s.smtp.password,
    senderName: s.meta.senderName,
  })
})

routerAdd('POST', '/backend/v1/mail-settings', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('network_role') !== 'admin_rede'
  ) {
    throw new ForbiddenError('Apenas o admin da rede configura o e-mail do sistema.')
  }

  const body = e.requestInfo().body || {}
  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  const s = $app.settings()

  const email = text(body.email).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new BadRequestError('Informe o e-mail que vai enviar as mensagens.')
  }
  const host = text(body.host) || 'smtp.gmail.com'
  const port = parseInt(text(body.port) || '465', 10)
  if (!(port > 0 && port < 65536))
    throw new BadRequestError('Porta do servidor de e-mail inválida.')
  // A senha de app do Gmail aparece em grupos ("abcd efgh ijkl mnop"): os espaços não fazem parte.
  const password = text(body.password).replace(/\s+/g, '')
  const keepsPassword = !!s.smtp.password && s.smtp.username === email && s.smtp.host === host
  if (!password && !keepsPassword) throw new BadRequestError('Informe a senha de app do e-mail.')
  const senderName = text(body.senderName) || 'New Way Eletric'

  const before = {
    enabled: s.smtp.enabled,
    host: s.smtp.host,
    port: s.smtp.port,
    username: s.smtp.username,
    password: s.smtp.password,
    tls: s.smtp.tls,
    authMethod: s.smtp.authMethod,
    senderAddress: s.meta.senderAddress,
    senderName: s.meta.senderName,
  }
  const apply = (v) => {
    s.smtp.enabled = v.enabled
    s.smtp.host = v.host
    s.smtp.port = v.port
    s.smtp.username = v.username
    s.smtp.password = v.password
    s.smtp.tls = v.tls
    s.smtp.authMethod = v.authMethod
    s.meta.senderAddress = v.senderAddress
    s.meta.senderName = v.senderName
  }
  apply({
    enabled: true,
    host: host,
    port: port,
    username: email,
    password: password || s.smtp.password,
    tls: port === 465,
    authMethod: 'PLAIN',
    senderAddress: email,
    senderName: senderName,
  })

  try {
    $app.newMailClient().send(
      new MailerMessage({
        from: { address: email, name: senderName },
        to: [{ address: auth.email() }],
        subject: 'Teste do e-mail do sistema ' + senderName,
        html:
          '<p>Olá!</p><p>Este é um teste do e-mail de envio do sistema de gestão. ' +
          'Se você recebeu esta mensagem, a recuperação de senha está funcionando.</p>',
      }),
    )
  } catch (err) {
    apply(before)
    throw new BadRequestError(
      'Não consegui enviar o e-mail de teste. Confira o e-mail e a senha de app. (' +
        String(err).slice(0, 200) +
        ')',
    )
  }
  $app.save(s)

  return e.json(200, {
    enabled: true,
    host: host,
    port: port,
    username: email,
    hasPassword: true,
    senderName: senderName,
  })
})

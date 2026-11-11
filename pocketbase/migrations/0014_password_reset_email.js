// Recuperação de senha por e-mail ("Esqueci minha senha"): o link do e-mail
// abre a tela "Nova senha" do sistema (/reset-password?token=...), não o
// painel do PocketBase, e o texto vai em português. O endereço do sistema fica
// em meta.appURL; com domínio próprio, troque-o aqui numa migration nova. O
// e-mail de envio (SMTP) é configurado pelo admin da rede em Configurações →
// E-mail (hooks/mail_settings.js).
migrate(
  (app) => {
    const settings = app.settings()
    settings.meta.appName = 'New Way Eletric'
    settings.meta.appURL = 'https://gestaoneway.vercel.app'
    settings.meta.senderName = 'New Way Eletric'
    app.save(settings)

    const users = app.findCollectionByNameOrId('users')
    users.resetPasswordTemplate = {
      subject: 'Redefinir sua senha - {APP_NAME}',
      body:
        '<p>Olá, {RECORD:name}!</p>' +
        '<p>Recebemos um pedido para redefinir a senha do seu acesso ao sistema de gestão da {APP_NAME}.</p>' +
        '<p><a href="{APP_URL}/reset-password?token={TOKEN}" target="_blank" rel="noopener">Criar uma nova senha</a></p>' +
        '<p>O link vale por 30 minutos. Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>' +
        '<p>{APP_NAME}</p>',
    }
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.resetPasswordTemplate = {
      subject: 'Reset your {APP_NAME} password',
      body:
        '<p>Hello,</p>' +
        '<p>Click on the button below to reset your password.</p>' +
        '<p><a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a></p>' +
        "<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>" +
        '<p>Thanks,<br/>{APP_NAME} team</p>',
    }
    app.save(users)
  },
)

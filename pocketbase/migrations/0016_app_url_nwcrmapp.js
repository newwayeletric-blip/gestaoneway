// O sistema ganhou o domínio próprio nwcrmapp.com (11/11/2026): o link do
// e-mail "Esqueci minha senha" passa a abrir https://nwcrmapp.com/reset-password.
// O endereço gestaoneway.vercel.app continua funcionando.
migrate(
  (app) => {
    const settings = app.settings()
    settings.meta.appURL = 'https://nwcrmapp.com'
    app.save(settings)
  },
  (app) => {
    const settings = app.settings()
    settings.meta.appURL = 'https://gestaoneway.vercel.app'
    app.save(settings)
  },
)

// O admin troca a senha (e o e-mail) dos usuários da própria organização na
// tela Usuários (campo "Nova Senha"). Sem manageRule, o PocketBase exige a
// senha antiga de quem não é o dono do registro, e a troca era recusada (400
// oldPassword). Com o e-mail de "esqueci a senha" ainda sem SMTP no VPS, essa
// é a saída para um vendedor que esqueceu a senha.
// A conta do admin da rede (o dono) só é gerida por outro admin da rede: um
// admin comum não troca a senha dela.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    col.manageRule =
      "@request.auth.id != '' && @request.auth.status = 'ativo' && @request.auth.profile = 'admin'" +
      ' && org = @request.auth.org' +
      " && (network_role != 'admin_rede' || @request.auth.network_role = 'admin_rede')"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    col.manageRule = null
    app.save(col)
  },
)

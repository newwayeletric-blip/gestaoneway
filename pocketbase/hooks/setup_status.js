/**
 * USR-01: diz à tela /setup se a instalação inicial ainda está disponível.
 * Disponível só enquanto não existe nenhum usuário. Não revela o token.
 */
routerAdd('GET', '/backend/v1/setup/status', (e) => {
  const anyUser = $app.findRecordsByFilter('users', "id != ''", '', 1, 0)
  return e.json(200, { available: anyUser.length === 0 })
})

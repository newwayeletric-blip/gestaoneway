/**
 * Erros de tela vindos do navegador (src/components/ErrorBoundary.tsx). Vão
 * para o log do servidor (console.error), onde dá para ver o que derrubou a
 * tela com os dados reais. Só usuário logado; os textos são cortados.
 */
routerAdd('POST', '/backend/v1/client-errors', (e) => {
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users') {
    throw new UnauthorizedError('Faça login para continuar.')
  }
  const body = e.requestInfo().body || {}
  const cut = (v, max) => String(v === undefined || v === null ? '' : v).slice(0, max)
  console.error(
    '[erro-de-tela]',
    JSON.stringify({
      user: auth.id,
      org: auth.getString('org'),
      profile: auth.getString('profile'),
      path: cut(body.path, 200),
      message: cut(body.message, 500),
      stack: cut(body.stack, 2000),
      componentStack: cut(body.componentStack, 2000),
      userAgent: cut(body.userAgent, 300),
    }),
  )
  return e.noContent(204)
})

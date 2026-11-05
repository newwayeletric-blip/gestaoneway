/**
 * PRD-02: esconder o campo não basta, porque um filtro como
 * "cost_price > 4000" (ou "product.cost_price > 4000") deixaria o vendedor
 * descobrir o custo por tentativa. Para não-admins, qualquer listagem que
 * filtre ou ordene por custo é recusada, em todas as coleções.
 */
onRecordsListRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  const auth = e.auth
  const isAdmin =
    !!auth && auth.getString('profile') === 'admin' && auth.getString('status') === 'ativo'
  if (isAdmin) return e.next()

  const query = e.requestInfo().query || {}
  const probe = (String(query.filter || '') + ' ' + String(query.sort || '')).toLowerCase()
  if (probe.indexOf('cost') !== -1) {
    throw new ForbiddenError('Filtro ou ordenação por custo é restrito ao administrador.')
  }
  return e.next()
})

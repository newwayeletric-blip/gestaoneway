/**
 * PER-01: papel na rede (admin, financeiro, consultor, catálogo) só muda
 * pelas mãos do admin da rede. O admin de uma franquia não consegue se
 * promover nem promover a equipe dele.
 */
onRecordUpdateRequest((e) => {
  const before = e.record.original().getString('network_role')
  if (e.record.getString('network_role') !== before && !e.hasSuperuserAuth()) {
    const auth = e.auth
    const isNetworkAdmin =
      !!auth &&
      auth.getString('network_role') === 'admin_rede' &&
      auth.getString('status') === 'ativo'
    if (!isNetworkAdmin) {
      throw new ForbiddenError('Apenas o admin da rede define papéis da franqueadora.')
    }
  }
  return e.next()
}, 'users')

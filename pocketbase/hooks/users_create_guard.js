/**
 * USR-03: todo usuário novo nasce com status definido. As regras da API
 * exigem @request.auth.status = 'ativo', então status vazio = sem acesso.
 * PER-01: papel na rede (admin, financeiro, consultor, catálogo) só é dado
 * pelo admin da rede. A organização e as lojas são conferidas em
 * org_stamp_on_create.js (lojas sempre da organização do usuário, USR-06).
 */
onRecordCreateRequest((e) => {
  if (!e.record.getString('status')) {
    e.record.set('status', 'ativo')
  }
  if (e.record.getString('network_role') && !e.hasSuperuserAuth()) {
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

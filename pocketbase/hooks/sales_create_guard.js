/**
 * Vendedor não autoriza a própria venda: autorização de saldo pendente é
 * do admin (VEN-06). Loja autorizada e status 'rascunho' ficam na regra da API.
 */
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth || auth.getString('profile') !== 'admin') {
    e.record.set('authorized_by', '')
    e.record.set('authorization_note', '')
  }
  return e.next()
}, 'sales')

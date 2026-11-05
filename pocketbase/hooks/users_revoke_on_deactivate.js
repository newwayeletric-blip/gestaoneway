/**
 * USR-03: desativar um usuário revoga as sessões dele. Trocar o tokenKey
 * invalida todos os tokens já emitidos (o token antigo passa a dar 401).
 * Hook de modelo: vale para a API, para o painel e para outros hooks.
 */
onRecordUpdate((e) => {
  const wasActive = e.record.original().getString('status') !== 'inativo'
  if (wasActive && e.record.getString('status') === 'inativo') {
    e.record.refreshTokenKey()
  }
  return e.next()
}, 'users')

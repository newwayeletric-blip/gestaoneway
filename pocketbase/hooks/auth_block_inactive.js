/**
 * USR-03: usuário desativado não recebe token, nem por senha nem por
 * renovação (auth-refresh). Só se aplica à coleção users; o superusuário
 * da plataforma não passa por aqui.
 */
onRecordAuthRequest((e) => {
  if (e.record && e.record.getString('status') !== 'ativo') {
    throw new UnauthorizedError('Usuário desativado. Procure o administrador.')
  }
  return e.next()
}, 'users')

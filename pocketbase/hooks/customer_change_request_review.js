/**
 * CLI-04: o admin aprova ou rejeita a solicitação. Aprovar aplica as
 * alterações no cliente na mesma operação e grava a auditoria.
 * Uma solicitação já decidida não muda mais.
 */
onRecordUpdateRequest((e) => {
  // Checado aqui (e não só na updateRule) porque este hook altera o
  // cliente antes de a regra da coleção ser avaliada.
  const isAdmin =
    e.hasSuperuserAuth() ||
    (!!e.auth &&
      e.auth.getString('profile') === 'admin' &&
      e.auth.getString('status') === 'ativo')
  if (!isAdmin) {
    throw new ForbiddenError('Apenas administradores decidem solicitações de alteração.')
  }

  const before = e.record.original().getString('status')
  const after = e.record.getString('status')
  if (before !== 'pendente') {
    throw new BadRequestError('Esta solicitação já foi decidida e não pode ser alterada.')
  }
  if (after === 'pendente') return e.next()

  const reviewerId = e.auth ? e.auth.id : ''
  e.record.set('reviewed_by', e.auth && e.auth.collection().name === 'users' ? reviewerId : '')
  e.record.set('reviewed_at', new Date().toISOString())

  if (after === 'aprovada') {
    const changes = JSON.parse(e.record.original().getString('changes')) || {}
    const customer = e.app.findRecordById('customers', e.record.getString('customer'))
    for (const k of ['name', 'phone', 'document', 'email']) {
      if (Object.prototype.hasOwnProperty.call(changes, k)) customer.set(k, String(changes[k]))
    }
    e.app.save(customer)
  }

  if (e.auth && e.auth.collection().name === 'users') {
    const audit = new Record(e.app.findCollectionByNameOrId('audit_logs'))
    audit.set('entity', 'customers')
    audit.set('record_id', e.record.getString('customer'))
    audit.set('action', 'alteracao')
    audit.set('user', reviewerId)
    audit.set(
      'reason',
      'Solicitação de alteração ' + after + (e.record.getString('review_note') ? ': ' + e.record.getString('review_note') : ''),
    )
    audit.set('previous_values', JSON.parse(e.record.original().getString('previous_values')))
    audit.set('new_values', JSON.parse(e.record.original().getString('changes')))
    e.app.save(audit)
  }
  return e.next()
}, 'customer_change_requests')

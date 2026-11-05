/**
 * CLI-04: pedido de alteração de nome, telefone, documento ou e-mail de um
 * cliente existente. O servidor guarda os valores atuais para o admin
 * comparar antigo × novo.
 */
onRecordCreateRequest((e) => {
  const allowed = ['name', 'phone', 'document', 'email']

  let changes = null
  try {
    changes = JSON.parse(e.record.getString('changes'))
  } catch (_) {}
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new BadRequestError('Informe as alterações como um objeto, ex.: { "document": "..." }.')
  }
  const keys = Object.keys(changes)
  if (keys.length === 0) throw new BadRequestError('Nenhuma alteração informada.')
  for (const k of keys) {
    if (allowed.indexOf(k) === -1) {
      throw new BadRequestError('Campo não permitido na solicitação: ' + k)
    }
  }

  let customer = null
  try {
    customer = $app.findRecordById('customers', e.record.getString('customer'))
  } catch (_) {
    throw new BadRequestError('Cliente não encontrado.')
  }
  const previous = {}
  for (const k of keys) previous[k] = customer.getString(k)

  e.record.set('previous_values', previous)
  e.record.set('status', 'pendente')
  e.record.set('reviewed_by', '')
  e.record.set('reviewed_at', '')
  e.record.set('review_note', '')
  return e.next()
}, 'customer_change_requests')

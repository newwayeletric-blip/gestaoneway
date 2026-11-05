/**
 * D.5 (Auditoria): a trilha de cancelamento e entrega de venda é gravada
 * pelo servidor, já que audit_logs não aceita escrita pela API.
 * A auditoria só é gravada depois que a atualização foi aceita (e.next()).
 */
onRecordUpdateRequest((e) => {
  const original = e.record.original()
  const oldStatus = original.getString('status')
  const oldDelivery = original.getString('delivery_status')

  e.next()

  const newStatus = e.record.getString('status')
  const newDelivery = e.record.getString('delivery_status')
  if (oldStatus === newStatus && oldDelivery === newDelivery) return
  if (!e.auth || e.auth.collection().name !== 'users') return

  try {
    const audit = new Record($app.findCollectionByNameOrId('audit_logs'))
    audit.set('entity', 'sales')
    audit.set('record_id', e.record.id)
    audit.set('action', newStatus === 'cancelada' && oldStatus !== 'cancelada' ? 'cancelamento' : 'alteracao')
    audit.set('user', e.auth.id)
    audit.set(
      'reason',
      newStatus === 'cancelada'
        ? e.record.getString('cancellation_reason')
        : 'Alteração de status da venda / registro de entrega',
    )
    audit.set('previous_values', { status: oldStatus, delivery_status: oldDelivery })
    audit.set('new_values', { status: newStatus, delivery_status: newDelivery })
    audit.set('ip_address', e.realIP())
    $app.save(audit)
  } catch (err) {
    $app.logger().error('Falha ao gravar auditoria de venda', 'sale', e.record.id, 'error', String(err))
  }
}, 'sales')

/**
 * RED-01: registros criados pelo próprio servidor (auditoria, rotas,
 * outros hooks) também recebem org e legal_entity. Quem cria pela API já
 * passou por org_stamp_on_create.js; aqui só se completa o que faltar.
 * Melhor esforço: nunca impede a gravação.
 */
onRecordCreate((e) => {
  const collection = e.record.collection()
  const fields = collection.fields
  if (!fields.getByName('org')) return e.next()

  const parents = [
    ['sale', 'sales'],
    ['transfer', 'transfers'],
    ['transaction', 'financial_transactions'],
    ['store', 'stores'],
    ['origin_store', 'stores'],
    ['product', 'products'],
    ['customer', 'customers'],
  ]
  const lookup = (collectionName, id) => {
    try {
      return e.app.findRecordById(collectionName, id)
    } catch (_) {
      return null
    }
  }

  if (!e.record.getString('org')) {
    let org = ''
    for (const p of parents) {
      const id = fields.getByName(p[0]) ? e.record.getString(p[0]) : ''
      if (!id) continue
      const parent = lookup(p[1], id)
      if (parent) org = parent.getString('org')
      break
    }
    if (!org && collection.name === 'audit_logs') {
      // A auditoria fica com a organização do registro auditado; se ele não
      // tiver organização, com a de quem fez a ação.
      const entity = lookup(e.record.getString('entity'), e.record.getString('record_id'))
      if (entity && entity.collection().fields.getByName('org')) org = entity.getString('org')
      if (!org) {
        const user = lookup('users', e.record.getString('user'))
        if (user) org = user.getString('org')
      }
    }
    if (org) e.record.set('org', org)
  }

  if (fields.getByName('legal_entity') && collection.name !== 'stores' && !e.record.getString('legal_entity')) {
    let le = ''
    const sale = e.record.getString('sale') ? lookup('sales', e.record.getString('sale')) : null
    const store = e.record.getString('store') ? lookup('stores', e.record.getString('store')) : null
    if (sale) le = sale.getString('legal_entity')
    else if (store) le = store.getString('legal_entity')
    if (le) e.record.set('legal_entity', le)
  }
  return e.next()
})

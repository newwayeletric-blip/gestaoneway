/**
 * Números de série (dono, 11/11/2026): a série é informada na venda e vai
 * para a observação da NF (pocketbase/hooks/sales_submit.js).
 * - GET /backend/v1/serials?q=...: histórico de uma série na organização
 *   (aba "Números de série"): produto, venda, situação, data, loja,
 *   vendedor, cliente e se a NF já foi anexada. Só o administrador.
 * - POST /backend/v1/sales/{id}/serials: o administrador corrige a série dos
 *   itens antes da NF (venda aguardando aprovação ou confirmada, sem NF
 *   anexada), com as regras do envio e registro na auditoria.
 *   Corpo: { items: [{ id, serial_number }] }
 */
routerAdd('GET', '/backend/v1/serials', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador consulta o histórico de chassis.')
  }
  const q = String(e.request.url.query().get('q') || '')
    .toUpperCase()
    .replace(/\s+/g, '')
  if (q.length < 3) throw new BadRequestError('Digite ao menos 3 caracteres do chassi.')

  const orgId = auth.getString('org')
  const name = (collection, id) => {
    if (!id) return ''
    try {
      return $app.findRecordById(collection, id).getString('name')
    } catch (_) {
      return ''
    }
  }
  const out = []
  const rows = $app.findRecordsByFilter(
    'sale_items',
    "org = {:org} && serial_number != '' && serial_number ~ {:q}",
    '-created',
    50,
    0,
    { org: orgId, q: q },
  )
  for (const it of rows) {
    let sale = null
    try {
      sale = $app.findRecordById('sales', it.getString('sale'))
    } catch (_) {
      continue
    }
    let customer = null
    try {
      customer = $app.findRecordById('customers', sale.getString('customer'))
    } catch (_) {}
    const nf = $app.findRecordsByFilter(
      'sale_documents',
      "sale = {:sale} && doc_type = 'nota_fiscal'",
      '',
      1,
      0,
      { sale: sale.id },
    )
    out.push({
      serial_number: it.getString('serial_number'),
      product_name: it.getString('product_name'),
      sku: it.getString('sku'),
      returned: it.getFloat('returned_quantity') >= it.getFloat('quantity'),
      sale_id: sale.id,
      sale_number: sale.getString('number'),
      sale_status: sale.getString('status'),
      date:
        sale.getString('confirmed_at') ||
        sale.getString('submitted_at') ||
        sale.getString('created'),
      store: name('stores', sale.getString('store')),
      seller: name('users', sale.getString('seller')),
      customer_name: customer ? customer.getString('name') : '',
      customer_phone: customer ? customer.getString('phone') : '',
      customer_document: customer ? customer.getString('document') : '',
      has_nf: nf.length > 0,
    })
  }
  return e.json(200, { items: out })
})

routerAdd('POST', '/backend/v1/sales/{id}/serials', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador corrige o chassi.')
  }
  let sale = null
  try {
    sale = $app.findRecordById('sales', e.request.pathValue('id'))
  } catch (_) {
    throw new NotFoundError('Venda não encontrada.')
  }
  const orgId = auth.getString('org')
  if (sale.getString('org') !== orgId) throw new NotFoundError('Venda não encontrada.')
  if (['aguardando_aprovacao', 'confirmada'].indexOf(sale.getString('status')) === -1) {
    throw new BadRequestError('Só dá para corrigir o chassi de venda aguardando ou confirmada.')
  }
  const nf = $app.findRecordsByFilter(
    'sale_documents',
    "sale = {:sale} && doc_type = 'nota_fiscal'",
    '',
    1,
    0,
    { sale: sale.id },
  )
  if (nf.length > 0) {
    throw new BadRequestError('A NF desta venda já foi anexada: o chassi não muda mais por aqui.')
  }

  const body = e.requestInfo().body || {}
  const changes = {}
  const raw = body.items && body.items.length ? body.items : []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] || {}
    changes[String(r.id || '')] = String(r.serial_number === undefined ? '' : r.serial_number)
      .toUpperCase()
      .replace(/\s+/g, '')
  }

  const items = $app.findRecordsByFilter('sale_items', 'sale = {:sale}', '', 0, 0, {
    sale: sale.id,
  })
  const previous = {}
  const next = {}
  const seen = {}
  for (const it of items) {
    if (!(it.id in changes)) {
      const kept = it.getString('serial_number')
      if (kept) seen[kept] = true
      continue
    }
    const serial = changes[it.id]
    let tracks = false
    try {
      tracks = $app.findRecordById('products', it.getString('product')).getBool('track_serial')
    } catch (_) {}
    if (!tracks && it.getString('variant')) {
      try {
        tracks = $app
          .findRecordById('product_variants', it.getString('variant'))
          .getBool('track_serial')
      } catch (_) {}
    }
    if (tracks && !serial) {
      throw new BadRequestError('Informe o chassi de "' + it.getString('product_name') + '".')
    }
    previous[it.id] = it.getString('serial_number')
    next[it.id] = serial
    it.set('serial_number', serial)
  }
  for (const id in next) {
    const serial = next[id]
    if (!serial) continue
    if (seen[serial]) throw new BadRequestError('O chassi ' + serial + ' aparece duas vezes.')
    seen[serial] = true
  }
  for (const id in changes) {
    if (!(id in next)) throw new BadRequestError('Item não encontrado nesta venda.')
  }

  $app.runInTransaction((tx) => {
    for (const id in next) {
      const serial = next[id]
      if (!serial || serial === previous[id]) continue
      const sold = tx.findRecordsByFilter(
        'sale_items',
        "org = {:org} && sale != {:sale} && serial_number = {:serial} && returned_quantity < quantity && sale.status != 'cancelada' && sale.status != 'recusada'",
        '',
        1,
        0,
        { org: orgId, sale: sale.id, serial: serial },
      )
      if (sold.length > 0) {
        const other = tx.findRecordById('sales', sold[0].getString('sale'))
        throw new BadRequestError(
          'O chassi ' + serial + ' já está na venda ' + other.getString('number') + '.',
        )
      }
    }
    for (const it of items) {
      if (it.id in next) tx.save(it)
    }
    const audit = new Record(tx.findCollectionByNameOrId('audit_logs'))
    audit.set('org', orgId)
    audit.set('entity', 'sales')
    audit.set('record_id', sale.id)
    audit.set('action', 'alteracao')
    audit.set('user', auth.id)
    audit.set('reason', 'Correção do chassi na venda ' + sale.getString('number'))
    audit.set('previous_values', previous)
    audit.set('new_values', next)
    audit.set('ip_address', e.realIP())
    tx.save(audit)
  })

  return e.json(200, { items: next })
})

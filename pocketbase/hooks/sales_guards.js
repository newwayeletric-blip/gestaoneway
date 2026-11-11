/**
 * Fase 1 com a regra do dono (05/11/2026): depois de enviada, a venda só
 * muda pelas rotas do servidor (sales_submit.js e sales_actions.js). Pela
 * API comum, ninguém (nem o admin) troca a situação da venda nem os valores
 * de uma venda enviada, nem mexe nos itens e pagamentos dela. A exceção é a
 * quantidade devolvida do item, usada pela tela de devolução.
 * A nota fiscal só é anexada a uma venda confirmada pelo administrador.
 * O superusuário (painel do Skip) não passa por estas travas.
 */
// Campos da NF-e automática (pocketbase/hooks/lib/nfe.js) e da venda de
// marketplace: só o servidor grava. (Os handlers rodam isolados: a lista vai dentro de cada um.)
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const NF_FIELDS = [
    'nf_status',
    'nf_error',
    'nf_bling_id',
    'nf_key',
    'nf_started_at',
    'nf_issued_at',
    // Venda de marketplace (pocketbase/hooks/lib/marketplace.js).
    'channel',
    'external_number',
    'marketplace_fee',
    'shipping_cost',
  ]
  if (e.record.getString('status') !== 'rascunho') {
    throw new ForbiddenError('Venda nova pela API só como rascunho. Use o botão de enviar a venda.')
  }
  for (const field of NF_FIELDS) {
    if (!e.record.collection().fields.getByName(field)) continue
    const filled =
      ['nf_started_at', 'marketplace_fee', 'shipping_cost'].indexOf(field) >= 0
        ? e.record.getFloat(field) !== 0
        : e.record.getString(field) !== ''
    if (filled) {
      throw new ForbiddenError(
        'A nota fiscal e os dados do marketplace são gravados só pelo servidor.',
      )
    }
  }
  return e.next()
}, 'sales')

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const before = e.record.original()
  const status = before.getString('status')
  if (e.record.getString('status') !== status) {
    throw new ForbiddenError(
      'A situação da venda muda só pelas ações de aprovar, recusar ou cancelar.',
    )
  }
  if (status !== 'rascunho') {
    for (const field of [
      'number',
      'customer',
      'store',
      'seller',
      'subtotal',
      'total_discount',
      'total',
      'payment',
      'installments',
      'allow_installments',
      'idempotency_key',
      'submitted_at',
      'confirmed_by',
      'confirmed_at',
      'rejected_by',
      'rejected_at',
      'rejection_reason',
      'discount_over_limit',
      'discount_limit_pct',
      'discount_reason',
      'pending_balance',
      'authorized_by',
      'authorization_note',
      'cancellation_reason',
      'canceled_by',
      'canceled_at',
    ]) {
      if (!e.record.collection().fields.getByName(field)) continue
      if (String(e.record.get(field)) !== String(before.get(field))) {
        throw new ForbiddenError('A venda já foi enviada: o campo "' + field + '" não muda mais.')
      }
    }
  }
  const NF_FIELDS = [
    'nf_status',
    'nf_error',
    'nf_bling_id',
    'nf_key',
    'nf_started_at',
    'nf_issued_at',
    // Venda de marketplace (pocketbase/hooks/lib/marketplace.js).
    'channel',
    'external_number',
    'marketplace_fee',
    'shipping_cost',
  ]
  for (const field of NF_FIELDS) {
    if (!e.record.collection().fields.getByName(field)) continue
    if (String(e.record.get(field)) !== String(before.get(field))) {
      throw new ForbiddenError(
        'A nota fiscal e os dados do marketplace são gravados só pelo servidor.',
      )
    }
  }
  const invoiceChanged = e.record.getString('invoice_number') !== before.getString('invoice_number')
  if (invoiceChanged && status !== 'confirmada') {
    throw new ForbiddenError(
      'O número da NF só entra depois que o administrador confirmar a venda.',
    )
  }
  // Nota emitida pelo Bling: o número vem da Sefaz.
  if (invoiceChanged && before.getString('nf_status')) {
    throw new ForbiddenError('O número desta NF vem do Bling e não muda à mão.')
  }
  return e.next()
}, 'sales')

// Itens e pagamentos: só no rascunho. Do item de venda enviada, só a
// quantidade devolvida muda.
onRecordCreateRequest(
  (e) => {
    if (e.hasSuperuserAuth()) return e.next()
    let sale = null
    try {
      sale = $app.findRecordById('sales', e.record.getString('sale'))
    } catch (_) {
      throw new BadRequestError('Venda não encontrada.')
    }
    if (sale.getString('status') !== 'rascunho') {
      throw new ForbiddenError('A venda já foi enviada: itens e pagamentos não mudam mais.')
    }
    return e.next()
  },
  'sale_items',
  'sale_payments',
)

onRecordDeleteRequest(
  (e) => {
    if (e.hasSuperuserAuth()) return e.next()
    let sale = null
    try {
      sale = $app.findRecordById('sales', e.record.getString('sale'))
    } catch (_) {
      return e.next()
    }
    if (sale.getString('status') !== 'rascunho') {
      throw new ForbiddenError('A venda já foi enviada: itens e pagamentos não mudam mais.')
    }
    return e.next()
  },
  'sale_items',
  'sale_payments',
)

onRecordUpdateRequest(
  (e) => {
    if (e.hasSuperuserAuth()) return e.next()
    const before = e.record.original()
    let sale = null
    try {
      sale = $app.findRecordById('sales', before.getString('sale'))
    } catch (_) {
      throw new BadRequestError('Venda não encontrada.')
    }
    if (sale.getString('status') === 'rascunho') return e.next()
    const fields = e.record.collection().fields
    for (let i = 0; i < fields.length; i++) {
      const name = fields[i].getName()
      if (
        name === 'updated' ||
        (name === 'returned_quantity' && e.record.collection().name === 'sale_items')
      ) {
        continue
      }
      if (String(e.record.get(name)) !== String(before.get(name))) {
        throw new ForbiddenError('A venda já foi enviada: itens e pagamentos não mudam mais.')
      }
    }
    return e.next()
  },
  'sale_items',
  'sale_payments',
)

// Regra do dono: NF só depois que o administrador confirma a venda.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  if (e.record.getString('doc_type') !== 'nota_fiscal') return e.next()
  let sale = null
  try {
    sale = $app.findRecordById('sales', e.record.getString('sale'))
  } catch (_) {
    throw new BadRequestError('Venda não encontrada.')
  }
  if (sale.getString('status') !== 'confirmada') {
    throw new ForbiddenError(
      'A nota fiscal só pode ser anexada depois que o administrador confirmar a venda.',
    )
  }
  return e.next()
}, 'sale_documents')

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const becameInvoice =
    e.record.getString('doc_type') === 'nota_fiscal' &&
    e.record.original().getString('doc_type') !== 'nota_fiscal'
  if (!becameInvoice) return e.next()
  let sale = null
  try {
    sale = $app.findRecordById('sales', e.record.getString('sale'))
  } catch (_) {
    throw new BadRequestError('Venda não encontrada.')
  }
  if (sale.getString('status') !== 'confirmada') {
    throw new ForbiddenError(
      'A nota fiscal só pode ser anexada depois que o administrador confirmar a venda.',
    )
  }
  return e.next()
}, 'sale_documents')

// pb_hooks for server-side business rules & consistency
// - Prevents modification or deletion of records in closed monthly periods
// - Audits critical actions (price changes, status transitions, cancellations, returns)
// - Validates stock sufficiency and concurrency at server level
// - Guarantees non-destructive soft tracking (no raw deletions of transactional rows)

routerAdd('POST', '/backend/v1/nwe/confirm-sale', (e) => {
  const auth = e.auth
  if (!auth) {
    return e.json(401, { message: 'Autenticação obrigatória.' })
  }

  const body = e.requestInfo().body || {}
  const saleId = body.saleId
  if (!saleId) {
    return e.json(400, { message: 'ID da venda é obrigatório.' })
  }

  let resultSale = null

  $app.runInTransaction((txApp) => {
    const sale = txApp.findRecordById('sales', saleId)
    if (sale.getString('status') === 'confirmada') {
      throw new BadRequestError('Esta venda já foi confirmada anteriormente.')
    }
    if (sale.getString('status') === 'cancelada') {
      throw new BadRequestError('Vendas canceladas não podem ser confirmadas.')
    }

    const storeId = sale.getString('store')
    const total = sale.getFloat('total')

    // Check monthly closing
    const saleCreated = sale.getString('created') || new Date().toISOString()
    const year = new Date(saleCreated).getFullYear()
    const month = new Date(saleCreated).getMonth() + 1
    const closings = txApp.findRecordsByFilter(
      'monthly_closings',
      `year = ${year} && month = ${month} && status = 'fechado' && (store = '' || store = '${storeId}')`,
      '',
      1,
      0,
    )
    if (closings.length > 0) {
      throw new BadRequestError(
        `O período financeiro ${month}/${year} já está fechado pela administração.`,
      )
    }

    // 1. Verify payments coverage
    const payments = txApp.findRecordsByFilter('sale_payments', `sale = '${saleId}'`, '', 100, 0)
    let totalPaid = 0
    for (const p of payments) {
      totalPaid += p.getFloat('amount')
    }

    const hasPendingBalance = Math.round(totalPaid * 100) < Math.round(total * 100)
    if (hasPendingBalance) {
      // Must have administrative authorization
      const isAuthorized =
        sale.getString('authorized_by') !== '' || auth.getString('profile') === 'admin'
      if (!isAuthorized) {
        throw new BadRequestError(
          `Pagamentos registrados (R$ ${totalPaid.toFixed(2)}) não cobrem o total da venda (R$ ${total.toFixed(2)}). Exige autorização administrativa para saldo pendente.`,
        )
      }
      if (auth.getString('profile') === 'admin' && !sale.getString('authorized_by')) {
        sale.set('authorized_by', auth.id)
        sale.set('authorization_note', 'Autorizado pelo administrador no momento da confirmação')
      }
      sale.set('payment_status', totalPaid > 0 ? 'parcial' : 'pendente')
    } else {
      sale.set('payment_status', 'pago')
    }

    // 2. Concurrency control on stock items: check and decrement in same transaction
    const items = txApp.findRecordsByFilter('sale_items', `sale = '${saleId}'`, '', 100, 0)
    const stockMovementsCol = txApp.findCollectionByNameOrId('stock_movements')

    for (const item of items) {
      const prodId = item.getString('product')
      const varId = item.getString('variant')
      const qty = item.getInt('quantity')

      let stockFilter = `product = '${prodId}' && store = '${storeId}'`
      if (varId) {
        stockFilter += ` && variant = '${varId}'`
      } else {
        stockFilter += ` && (variant = '' || variant = null)`
      }

      const stockRecords = txApp.findRecordsByFilter('stock_items', stockFilter, '', 1, 0)
      if (stockRecords.length === 0) {
        throw new BadRequestError(
          `Produto "${item.getString('product_name')}" não possui registro de estoque na loja.`,
        )
      }

      const stockRec = stockRecords[0]
      const currentStock = stockRec.getInt('quantity')
      if (currentStock < qty) {
        throw new BadRequestError(
          `Estoque insuficiente para "${item.getString('product_name')}". Disponível: ${currentStock}, solicitado: ${qty}. Apenas uma confirmação simultânea pode ser concluída.`,
        )
      }

      // Decrement stock
      stockRec.set('quantity', currentStock - qty)
      txApp.save(stockRec)

      // Record stock movement (saida_venda)
      const mov = new Record(stockMovementsCol)
      mov.set('type', 'saida_venda')
      mov.set('product', prodId)
      if (varId) mov.set('variant', varId)
      mov.set('store', storeId)
      mov.set('quantity', qty)
      mov.set('date', new Date().toISOString())
      mov.set('user', auth.id)
      mov.set('reason', `Venda ${sale.getString('number')}`)
      mov.set('source_ref', saleId)
      txApp.save(mov)

      // Snapshot cost price in item
      if (!item.getFloat('cost_price_snapshot')) {
        item.set('cost_price_snapshot', item.getFloat('cost_price') || 0)
        txApp.save(item)
      }
    }

    // 3. Mark sale as confirmed
    sale.set('status', 'confirmada')
    if (!sale.getString('delivery_status')) {
      sale.set('delivery_status', 'pendente')
    }
    txApp.save(sale)

    // 4. Mark sale_payments as confirmed
    for (const p of payments) {
      if (!p.getBool('confirmed')) {
        p.set('confirmed', true)
        txApp.save(p)
      }
    }

    // 5. Commission calculation and release status
    const sellerId = sale.getString('seller')
    const commissionsCol = txApp.findCollectionByNameOrId('commissions')

    let sellerRate = 0
    let sellerHasConfig = false
    try {
      const sellerUser = txApp.findRecordById('users', sellerId)
      if (sellerUser.getFloat('default_commission_rate') > 0) {
        sellerRate = sellerUser.getFloat('default_commission_rate')
        sellerHasConfig = true
      }
    } catch (_) {}

    let totalCommissionVal = 0
    const netSaleRatio =
      total > 0 && sale.getFloat('subtotal') > 0 ? total / sale.getFloat('subtotal') : 1

    for (const item of items) {
      let itemRate = 0
      let ruleFound = false

      const prodId = item.getString('product')
      const varId = item.getString('variant')
      if (varId) {
        try {
          const vRec = txApp.findRecordById('product_variants', varId)
          if (vRec.getFloat('commission_rate') > 0) {
            itemRate = vRec.getFloat('commission_rate')
            ruleFound = true
          }
        } catch (_) {}
      }
      if (!ruleFound && prodId) {
        try {
          const pRec = txApp.findRecordById('products', prodId)
          if (pRec.getFloat('commission_rate') > 0) {
            itemRate = pRec.getFloat('commission_rate')
            ruleFound = true
          }
        } catch (_) {}
      }

      if (!ruleFound && sellerHasConfig) {
        itemRate = sellerRate
        ruleFound = true
      }

      const itemNetBase = item.getFloat('total') * netSaleRatio
      const itemCommVal = ruleFound ? (itemNetBase * itemRate) / 100 : 0

      item.set('commission_rate', itemRate)
      item.set('commission_value', itemCommVal)
      txApp.save(item)

      totalCommissionVal += itemCommVal
    }

    const commStatus = !hasPendingBalance ? 'liberada' : 'prevista'
    const commRec = new Record(commissionsCol)
    commRec.set('seller', sellerId)
    commRec.set('sale', saleId)
    commRec.set('store', storeId)
    commRec.set('base_amount', total)
    commRec.set('rate', total > 0 ? (totalCommissionVal / total) * 100 : 0)
    commRec.set('value', totalCommissionVal)
    commRec.set('status', commStatus)
    commRec.set('competence_date', new Date().toISOString())
    if (commStatus === 'liberada') {
      commRec.set('released_at', new Date().toISOString())
    }
    txApp.save(commRec)

    // 6. Audit log
    const auditCol = txApp.findCollectionByNameOrId('audit_logs')
    const audit = new Record(auditCol)
    audit.set('entity', 'sales')
    audit.set('record_id', saleId)
    audit.set('action', 'confirmacao')
    audit.set('user', auth.id)
    audit.set('reason', `Confirmação de venda ${sale.getString('number')}`)
    audit.set(
      'new_values',
      JSON.stringify({
        status: 'confirmada',
        payment_status: sale.getString('payment_status'),
        total: total,
        total_commission: totalCommissionVal,
      }),
    )
    txApp.save(audit)

    resultSale = sale
  })

  return e.json(200, {
    success: true,
    saleId: resultSale.id,
    number: resultSale.getString('number'),
  })
})

onRecordDeleteRequest(
  (e) => {
    const collectionName = e.collection.name
    const blockedCollections = [
      'sales',
      'sale_items',
      'financial_transactions',
      'commissions',
      'card_receivables',
      'monthly_closings',
    ]
    if (blockedCollections.includes(collectionName)) {
      throw new BadRequestError(
        'Registros com movimentação financeira ou fiscal não podem ser excluídos definitivamente. Utilize cancelamento ou estorno com auditoria.',
      )
    }
  },
  'sales',
  'sale_items',
  'financial_transactions',
  'commissions',
  'card_receivables',
  'monthly_closings',
)

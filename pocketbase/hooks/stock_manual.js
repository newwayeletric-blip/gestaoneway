/**
 * Lançamento manual de estoque pelo administrador (tela Estoque → Entrada /
 * Ajuste). A movimentação e o saldo da loja mudam juntos numa transação:
 * antes a tela gravava só a movimentação, e o saldo (stock_items) não mudava.
 * - entrada: soma a quantidade ao saldo.
 * - avaria / perda: retira a quantidade; não deixa o saldo ficar negativo.
 * - ajuste: a quantidade é o saldo contado na loja (contagem física); a
 *   movimentação guarda a diferença, positiva ou negativa.
 * Avaria, perda e ajuste exigem motivo. Mês encerrado no Fechamento Mensal
 * bloqueia o lançamento, como em system_rules.js.
 *
 * Custo da compra (dono, 24/11/2026): o mesmo modelo pode ser comprado por
 * valores diferentes. Na entrada, unit_cost é o custo unitário daquela compra
 * (sem ele, vale o custo atual do produto) e fica gravado na movimentação. O
 * custo do produto vira a média ponderada entre o que a empresa já tinha (todas
 * as lojas, mais o que está em trânsito) e o que chegou. As vendas já gravam o
 * custo do dia em sale_items, então o passado não muda. sale_price, se vier,
 * troca o preço de venda do produto.
 */
routerAdd('POST', '/backend/v1/stock/manual', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador lança entradas e ajustes de estoque.')
  }
  const org = auth.getString('org')

  const body = e.requestInfo().body || {}
  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  const fail = (field, message) => {
    const data = {}
    data[field] = new ValidationError('validation_stock_' + field, message)
    throw new BadRequestError(message, data)
  }

  const type = text(body.type)
  if (['entrada', 'ajuste', 'avaria', 'perda'].indexOf(type) === -1) {
    fail('type', 'Tipo de movimentação inválido.')
  }
  const quantity = Number(body.quantity)
  if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'ajuste' && quantity === 0)) {
    fail('quantity', 'Informe uma quantidade inteira maior que zero.')
  }
  const reason = text(body.reason)
  if (type !== 'entrada' && reason.length === 0) {
    fail('reason', 'O motivo é obrigatório para perdas, avarias e ajustes.')
  }
  // Valor opcional em reais: vazio vira null.
  const money = (v, field, message, min) => {
    if (text(v) === '') return null
    const n = Number(v)
    if (!isFinite(n) || n < min) fail(field, message)
    return Math.round(n * 100) / 100
  }
  const unitCost =
    type === 'entrada'
      ? money(body.unit_cost, 'unit_cost', 'Informe o custo da compra (R$ 0,00 ou mais).', 0)
      : null
  const salePrice =
    type === 'entrada'
      ? money(body.sale_price, 'sale_price', 'Informe um preço de venda maior que zero.', 0.01)
      : null

  let store = null
  try {
    store = $app.findRecordById('stores', text(body.store))
  } catch (_) {}
  if (!store || store.getString('org') !== org) fail('store', 'Loja não encontrada.')
  let product = null
  try {
    product = $app.findRecordById('products', text(body.product))
  } catch (_) {}
  if (!product || product.getString('org') !== org) fail('product', 'Produto não encontrado.')

  const now = new Date()
  const closings = $app.findRecordsByFilter(
    'monthly_closings',
    "year = {:year} && month = {:month} && status = 'fechado' && org = {:org} && (store = {:store} || store = '')",
    '',
    1,
    0,
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, org: org, store: store.id },
  )
  if (closings.length > 0) {
    throw new BadRequestError(
      'Operação bloqueada: não é permitido lançar movimentações de estoque em mês encerrado pelo Fechamento Mensal.',
    )
  }

  let result = null
  $app.runInTransaction((tx) => {
    const rows = tx.findRecordsByFilter(
      'stock_items',
      "store = {:store} && product = {:product} && variant = ''",
      '',
      1,
      0,
      { store: store.id, product: product.id },
    )
    let row = rows.length > 0 ? rows[0] : null
    if (!row) {
      row = new Record(tx.findCollectionByNameOrId('stock_items'))
      row.set('org', org)
      row.set('store', store.id)
      row.set('product', product.id)
      row.set('variant', '')
      row.set('quantity', 0)
    }
    const current = row.getFloat('quantity')

    // Antes de somar a entrada: o que a empresa já tinha deste produto.
    let owned = 0
    if (type === 'entrada') {
      for (const r of tx.findRecordsByFilter(
        'stock_items',
        "org = {:org} && product = {:product} && variant = ''",
        '',
        0,
        0,
        { org: org, product: product.id },
      )) {
        owned += r.getFloat('quantity')
      }
      for (const r of tx.findRecordsByFilter(
        'transfer_items',
        "product = {:product} && variant = '' && transfer.org = {:org} && transfer.status = 'em_transito'",
        '',
        0,
        0,
        { org: org, product: product.id },
      )) {
        owned += r.getFloat('quantity')
      }
    }

    let next = current
    if (type === 'entrada') next = current + quantity
    else if (type === 'ajuste') next = quantity
    else next = current - quantity
    if (next < 0) {
      fail(
        'quantity',
        'A loja tem só ' + current + ' un deste produto. Não dá para retirar ' + quantity + '.',
      )
    }
    const delta = next - current
    if (type === 'ajuste' && delta === 0) {
      fail('quantity', 'O saldo da loja já é ' + current + ' un. Nada a ajustar.')
    }
    row.set('quantity', next)
    tx.save(row)

    const mv = new Record(tx.findCollectionByNameOrId('stock_movements'))
    mv.set('org', org)
    mv.set('type', type)
    mv.set('product', product.id)
    mv.set('store', store.id)
    // Ajuste guarda a diferença com sinal; os demais, a quantidade lançada.
    mv.set('quantity', type === 'ajuste' ? delta : quantity)
    mv.set('date', new DateTime())
    mv.set('user', auth.id)
    mv.set('reason', reason || 'Entrada manual pelo administrador')
    mv.set('source_ref', 'MANUAL-ADMIN')

    let cost = null
    if (type === 'entrada') {
      const previousCost = product.getFloat('cost_price')
      const previousPrice = product.getFloat('sale_price')
      const unit = unitCost !== null ? unitCost : previousCost
      // Sem saldo anterior ou sem custo conhecido, não há o que ponderar.
      const average =
        owned > 0 && previousCost > 0
          ? Math.round(((owned * previousCost + quantity * unit) / (owned + quantity)) * 100) / 100
          : unit
      mv.set('unit_cost', unit)
      const price = salePrice !== null ? salePrice : previousPrice
      if (average !== previousCost || price !== previousPrice) {
        product.set('cost_price', average)
        product.set('sale_price', price)
        tx.save(product)
        const log = new Record(tx.findCollectionByNameOrId('audit_logs'))
        log.set('org', org)
        log.set('entity', 'products')
        log.set('record_id', product.id)
        log.set('action', 'alteracao')
        log.set('user', auth.id)
        log.set(
          'reason',
          'Entrada de estoque: ' + quantity + ' un a R$ ' + unit.toFixed(2) + ' (custo médio)',
        )
        log.set('previous_values', { sale_price: previousPrice, cost_price: previousCost })
        log.set('new_values', { sale_price: price, cost_price: average })
        log.set('ip_address', e.realIP())
        tx.save(log)
      }
      cost = { unit: unit, previous: previousCost, average: average, sale_price: price }
    }
    tx.save(mv)

    const audit = new Record(tx.findCollectionByNameOrId('audit_logs'))
    audit.set('org', org)
    audit.set('entity', 'stock_movements')
    audit.set('record_id', mv.id)
    audit.set('action', 'ajuste')
    audit.set('user', auth.id)
    audit.set('reason', reason || 'Entrada manual de estoque')
    audit.set('previous_values', { quantity: current })
    audit.set('new_values', { product: product.id, store: store.id, type: type, quantity: next })
    audit.set('ip_address', e.realIP())
    tx.save(audit)

    result = { movement: mv.id, previous: current, quantity: next, cost: cost }
  })

  return e.json(200, result)
})

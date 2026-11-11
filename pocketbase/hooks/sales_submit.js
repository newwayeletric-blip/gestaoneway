/**
 * VEN-01/02/03/04/06, com a regra do dono (05/11/2026): a venda entra pelo
 * servidor numa transação só e fica "aguardando_aprovacao" até o
 * administrador da organização aprovar ou recusar
 * (pocketbase/hooks/sales_actions.js). Só a venda confirmada libera a NF.
 * - Preço, nome e SKU saem do catálogo; o navegador manda só produto,
 *   variação, quantidade e desconto.
 * - O estoque da loja é reservado na hora (a baixa só acontece se houver
 *   saldo) e volta se a venda for recusada.
 * - A venda ganha o número da loja (JP-000123).
 * - Desconto acima do limite da forma de pagamento principal e saldo
 *   pendente ficam marcados para o administrador decidir; o vendedor
 *   explica o desconto.
 * - A mesma chave de idempotência devolve a venda já criada (duplo clique).
 * - Número de série (dono, 11/11/2026): informado na venda e levado à
 *   observação da NF. Em produto com controle de série, cada unidade vem
 *   numa linha (quantidade 1) com a série obrigatória; a série não se repete
 *   na venda nem pode estar numa venda ativa da organização (cancelada,
 *   recusada ou devolvida libera a série).
 *
 * Corpo:
 * { store, customer, idempotency_key, observation?, discount_reason?,
 *   items: [{ product, variant?, quantity, discount, serial_number? }],
 *   payments: [{ method, amount, installments?, received_amount? }] }
 */
routerAdd('POST', '/backend/v1/sales', (e) => {
  const auth = e.auth
  if (!auth || auth.collection().name !== 'users' || auth.getString('status') !== 'ativo') {
    throw new ForbiddenError('Faça login para continuar.')
  }
  const isAdmin = auth.getString('profile') === 'admin'
  const orgId = auth.getString('org')
  const body = e.requestInfo().body || {}
  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  const num = (v) => {
    const n = Number(v)
    return isFinite(n) ? n : NaN
  }
  const round2 = (v) => Math.round(v * 100) / 100
  const list = (v) => {
    const out = []
    if (v && typeof v === 'object' && v.length) {
      for (let i = 0; i < v.length; i++) out.push(v[i] || {})
    }
    return out
  }
  const fail = (field, message) => {
    const data = {}
    data[field] = new ValidationError('validation_sale_' + field, message)
    throw new BadRequestError(message, data)
  }
  const setting = (key) => {
    const rows = $app.findRecordsByFilter('settings', 'org = {:org} && key = {:key}', '', 1, 0, {
      org: orgId,
      key: key,
    })
    return rows.length > 0 ? rows[0].getString('value') : ''
  }

  const key = text(body.idempotency_key)
  if (key.length < 8) fail('idempotency_key', 'Envio sem chave de idempotência. Recarregue a tela.')
  const findByKey = (app) =>
    app.findRecordsByFilter('sales', 'org = {:org} && idempotency_key = {:key}', '', 1, 0, {
      org: orgId,
      key: key,
    })
  const answerExisting = (sale) =>
    e.json(200, {
      id: sale.id,
      number: sale.getString('number'),
      status: sale.getString('status'),
      duplicate: true,
    })
  const already = findByKey($app)
  if (already.length > 0) return answerExisting(already[0])

  let store = null
  try {
    store = $app.findRecordById('stores', text(body.store))
  } catch (_) {
    fail('store', 'Escolha a loja da venda.')
  }
  if (store.getString('org') !== orgId)
    throw new ForbiddenError('Esta loja é de outra organização.')
  if (store.getString('status') === 'inativa') fail('store', 'Esta loja está inativa.')
  if (!isAdmin) {
    const allowed = auth.getStringSlice('stores')
    let authorized = false
    for (let i = 0; i < allowed.length; i++) if (allowed[i] === store.id) authorized = true
    if (!authorized) throw new ForbiddenError('Você não está autorizado a vender nesta loja.')
  }

  let customer = null
  try {
    customer = $app.findRecordById('customers', text(body.customer))
  } catch (_) {
    fail('customer', 'Escolha o cliente da venda.')
  }
  if (customer.getString('org') !== orgId)
    throw new ForbiddenError('Este cliente é de outra organização.')

  // Mês fechado no Financeiro (horário de Brasília).
  const brt = new Date(Date.now() - 3 * 3600 * 1000)
  const closed = $app.findRecordsByFilter(
    'monthly_closings',
    "org = {:org} && year = {:year} && month = {:month} && status = 'fechado' && (store = '' || store = {:store})",
    '',
    1,
    0,
    { org: orgId, year: brt.getUTCFullYear(), month: brt.getUTCMonth() + 1, store: store.id },
  )
  if (closed.length > 0) {
    fail('store', 'O mês atual está fechado no Financeiro. Reabra o mês para lançar vendas.')
  }

  // Itens pelo catálogo.
  const rawItems = list(body.items)
  if (rawItems.length === 0) fail('items', 'Adicione ao menos um produto.')
  if (rawItems.length > 50) fail('items', 'Venda com itens demais.')
  const items = []
  const needed = {}
  const serials = {}
  // Limite de desconto (dono, 11/11/2026): o próprio do produto, se ele tiver
  // um, ou o geral da organização (padrão 5%). Passou em algum item, a venda
  // vai para o administrador aprovar; guarda-se o menor limite ultrapassado.
  let generalLimit = parseFloat(setting('max_discount_general'))
  if (isNaN(generalLimit) || generalLimit < 0) generalLimit = 5
  let overLimit = false
  let violatedLimit = null
  let subtotal = 0
  let totalDiscount = 0
  for (const raw of rawItems) {
    let product = null
    let variant = null
    const variantId = text(raw.variant)
    if (variantId) {
      try {
        variant = $app.findRecordById('product_variants', variantId)
      } catch (_) {
        fail('items', 'Variação de produto não encontrada.')
      }
    }
    try {
      product = $app.findRecordById(
        'products',
        variant ? variant.getString('product') : text(raw.product),
      )
    } catch (_) {
      fail('items', 'Produto não encontrado.')
    }
    if (variant && text(raw.product) && text(raw.product) !== product.id) {
      fail('items', 'A variação informada não pertence ao produto.')
    }
    if (product.getString('org') !== orgId)
      throw new ForbiddenError('Produto de outra organização.')
    const name = variant
      ? product.getString('name') + ' - ' + variant.getString('name')
      : product.getString('name')
    if (product.getString('status') === 'inativo')
      fail('items', 'O produto "' + name + '" está inativo.')
    const variantPrice = variant ? variant.getFloat('sale_price') : 0
    const price = variantPrice > 0 ? variantPrice : product.getFloat('sale_price')
    if (!(price > 0))
      fail('items', 'O produto "' + name + '" está sem preço de venda. Peça ao administrador.')
    const qty = num(raw.quantity)
    if (!(qty > 0) || Math.floor(qty) !== qty)
      fail('items', 'Quantidade inválida em "' + name + '".')
    const gross = round2(price * qty)
    const discount = round2(num(raw.discount || 0))
    if (!(discount >= 0) || discount > gross) fail('items', 'Desconto inválido em "' + name + '".')
    const itemLimit = product.getBool('discount_limit_custom')
      ? product.getFloat('discount_limit_pct')
      : generalLimit
    if (discount > 0 && discount > round2((gross * itemLimit) / 100)) {
      overLimit = true
      if (violatedLimit === null || itemLimit < violatedLimit) violatedLimit = itemLimit
    }
    const serial = text(raw.serial_number).toUpperCase().replace(/\s+/g, '')
    const tracksSerial =
      product.getBool('track_serial') || (!!variant && variant.getBool('track_serial'))
    if (tracksSerial) {
      if (qty !== 1) fail('items', '"' + name + '" pede o chassi: lance uma unidade por linha.')
      if (!serial) fail('items', 'Informe o chassi de "' + name + '".')
    }
    if (serial) {
      if (serials[serial]) fail('items', 'O chassi ' + serial + ' aparece duas vezes.')
      serials[serial] = name
    }
    const variantCost = variant ? variant.getFloat('cost_price') : 0
    items.push({
      product: product.id,
      variant: variant ? variant.id : '',
      name: name,
      sku: variant ? variant.getString('sku') : product.getString('sku'),
      price: price,
      cost: variantCost > 0 ? variantCost : product.getFloat('cost_price'),
      qty: qty,
      discount: discount,
      total: round2(gross - discount),
      serial: serial,
    })
    const k = product.id + '|' + (variant ? variant.id : '')
    if (!needed[k])
      needed[k] = { product: product.id, variant: variant ? variant.id : '', name: name, qty: 0 }
    needed[k].qty += qty
    subtotal += gross
    totalDiscount += discount
  }
  subtotal = round2(subtotal)
  totalDiscount = round2(totalDiscount)
  const total = round2(subtotal - totalDiscount)
  if (!(total > 0)) fail('items', 'O total da venda precisa ser maior que zero.')

  // Pagamentos.
  let maxInstallments = parseInt(setting('max_installments_cartao_credito'), 10)
  if (!(maxInstallments > 0)) maxInstallments = 12
  const payments = []
  let paid = 0
  for (const raw of list(body.payments)) {
    const method = text(raw.method)
    if (['pix', 'dinheiro', 'cartao_debito', 'cartao_credito'].indexOf(method) === -1) {
      fail('payments', 'Forma de pagamento inválida.')
    }
    const amount = round2(num(raw.amount))
    if (!(amount > 0)) fail('payments', 'Valor de pagamento inválido.')
    let installments = 1
    if (method === 'cartao_credito') {
      installments = num(raw.installments || 1)
      if (
        !(installments >= 1) ||
        Math.floor(installments) !== installments ||
        installments > maxInstallments
      ) {
        fail('payments', 'Parcelamento permitido: até ' + maxInstallments + 'x.')
      }
    }
    let received = 0
    let change = 0
    if (method === 'dinheiro') {
      received = round2(num(raw.received_amount || amount))
      if (!(received >= amount))
        fail('payments', 'O valor recebido em dinheiro é menor que o valor pago.')
      change = round2(received - amount)
    }
    payments.push({
      method: method,
      amount: amount,
      installments: installments,
      received: received,
      change: change,
    })
    paid += amount
  }
  paid = round2(paid)
  if (paid > total) fail('payments', 'Os pagamentos somam mais que o total da venda.')
  const pending = round2(total - paid)
  let main = { method: 'pix', amount: -1, installments: 1 }
  for (const p of payments) if (p.amount > main.amount) main = p

  const limitPct = overLimit ? violatedLimit : generalLimit
  const discountReason = text(body.discount_reason)
  if (overLimit && !isAdmin && discountReason.length < 5) {
    fail('discount_reason', 'Explique ao administrador o motivo do desconto acima do limite.')
  }

  let created = null
  let existing = null
  $app.runInTransaction((tx) => {
    // Dois envios quase juntos: o segundo encontra o primeiro aqui.
    const again = findByKey(tx)
    if (again.length > 0) {
      existing = again[0]
      return
    }

    // Série já vendida (dentro da transação: duas vendas juntas não levam
    // a mesma unidade).
    for (const serial in serials) {
      const sold = tx.findRecordsByFilter(
        'sale_items',
        "org = {:org} && serial_number = {:serial} && returned_quantity < quantity && sale.status != 'cancelada' && sale.status != 'recusada'",
        '',
        1,
        0,
        { org: orgId, serial: serial },
      )
      if (sold.length > 0) {
        const other = tx.findRecordById('sales', sold[0].getString('sale'))
        fail(
          'items',
          'O chassi ' +
            serial +
            ' já está na venda ' +
            other.getString('number') +
            '. Confira o chassi ou peça ao administrador para corrigir aquela venda.',
        )
      }
    }

    // Reserva do estoque (VEN-03): só baixa se houver saldo. O "sem
    // variação" vai escrito no filtro: parâmetro vazio não casa com campo vazio.
    for (const k in needed) {
      const n = needed[k]
      const rows = tx.findRecordsByFilter(
        'stock_items',
        'store = {:store} && product = {:product} && ' +
          (n.variant ? 'variant = {:variant}' : "variant = ''"),
        '',
        1,
        0,
        { store: store.id, product: n.product, variant: n.variant },
      )
      const available = rows.length > 0 ? rows[0].getFloat('quantity') : 0
      if (available < n.qty) {
        throw new BadRequestError(
          'Sem estoque suficiente de "' + n.name + '" nesta loja. Saldo atual: ' + available + '.',
          { items: new ValidationError('validation_sale_stock', 'Estoque insuficiente.') },
        )
      }
      rows[0].set('quantity', available - n.qty)
      tx.save(rows[0])
    }

    // Número da venda por loja (JP-000123).
    const st = tx.findRecordById('stores', store.id)
    const seq = st.getInt('sale_seq') + 1
    st.set('sale_seq', seq)
    tx.save(st)
    const number = (st.getString('code') || 'LJ') + '-' + ('000000' + seq).slice(-6)

    const sale = new Record(tx.findCollectionByNameOrId('sales'))
    sale.set('org', orgId)
    sale.set('legal_entity', st.getString('legal_entity'))
    sale.set('number', number)
    sale.set('customer', customer.id)
    sale.set('store', st.id)
    sale.set('seller', auth.id)
    sale.set('status', 'aguardando_aprovacao')
    sale.set('submitted_at', new DateTime())
    sale.set('subtotal', subtotal)
    sale.set('total_discount', totalDiscount)
    sale.set('total', total)
    sale.set('payment', main.method)
    sale.set('installments', main.installments)
    sale.set('allow_installments', main.method === 'cartao_credito' && main.installments > 1)
    sale.set('payment_status', 'pendente')
    sale.set('delivery_status', 'pendente')
    sale.set('observation', text(body.observation))
    sale.set('idempotency_key', key)
    sale.set('discount_over_limit', overLimit)
    sale.set('discount_limit_pct', limitPct)
    sale.set('discount_reason', overLimit ? discountReason : '')
    sale.set('pending_balance', pending)
    tx.save(sale)

    const itemsCol = tx.findCollectionByNameOrId('sale_items')
    for (const it of items) {
      const rec = new Record(itemsCol)
      rec.set('org', orgId)
      rec.set('sale', sale.id)
      rec.set('product', it.product)
      rec.set('variant', it.variant)
      rec.set('product_name', it.name)
      rec.set('sku', it.sku)
      rec.set('sale_price', it.price)
      rec.set('cost_price', it.cost)
      rec.set('quantity', it.qty)
      rec.set('discount', it.discount)
      rec.set('total', it.total)
      rec.set('serial_number', it.serial)
      rec.set('returned_quantity', 0)
      tx.save(rec)
    }

    const paymentsCol = tx.findCollectionByNameOrId('sale_payments')
    for (const p of payments) {
      const rec = new Record(paymentsCol)
      rec.set('org', orgId)
      rec.set('legal_entity', st.getString('legal_entity'))
      rec.set('sale', sale.id)
      rec.set('method', p.method)
      rec.set('amount', p.amount)
      rec.set('confirmed', false)
      rec.set('installments', p.installments)
      rec.set('installment_value', round2(p.amount / p.installments))
      rec.set('received_amount', p.received)
      rec.set('change_amount', p.change)
      // Taxa da maquininha: só com a tabela cadastrada (MAQ, Fase 2).
      rec.set('card_tax_rate', 0)
      rec.set('card_tax_amount', 0)
      rec.set('net_amount', 0)
      tx.save(rec)
    }

    const movementsCol = tx.findCollectionByNameOrId('stock_movements')
    for (const k in needed) {
      const n = needed[k]
      const mv = new Record(movementsCol)
      mv.set('org', orgId)
      mv.set('type', 'saida_venda')
      mv.set('product', n.product)
      mv.set('variant', n.variant)
      mv.set('store', st.id)
      mv.set('quantity', -n.qty)
      mv.set('date', new DateTime())
      mv.set('user', auth.id)
      mv.set('reason', 'Venda ' + number + ' (reservada até a aprovação)')
      mv.set('source_ref', sale.id)
      tx.save(mv)
    }

    const notes = []
    if (overLimit)
      notes.push('desconto acima do limite: ' + (discountReason || 'lançado pelo administrador'))
    if (pending > 0) notes.push('saldo pendente de R$ ' + pending.toFixed(2))
    const audit = new Record(tx.findCollectionByNameOrId('audit_logs'))
    audit.set('org', orgId)
    audit.set('entity', 'sales')
    audit.set('record_id', sale.id)
    audit.set('action', 'criacao')
    audit.set('user', auth.id)
    audit.set(
      'reason',
      'Venda ' +
        number +
        ' enviada para aprovação' +
        (notes.length ? ' (' + notes.join('; ') + ')' : ''),
    )
    audit.set('new_values', {
      status: 'aguardando_aprovacao',
      total: total,
      total_discount: totalDiscount,
      pending_balance: pending,
    })
    audit.set('ip_address', e.realIP())
    tx.save(audit)

    created = sale
  })

  if (existing) return answerExisting(existing)
  return e.json(201, {
    id: created.id,
    number: created.getString('number'),
    status: created.getString('status'),
  })
})

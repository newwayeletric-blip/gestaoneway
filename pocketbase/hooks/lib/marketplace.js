/**
 * Marketplaces pelo Bling (dono, 11/11/2026). Usada pelas rotas e pela rotina
 * de pocketbase/hooks/marketplaces.js. Não é hook (entra por require).
 * - Pedidos: cada pedido de um canal (loja do Bling) vira uma venda já
 *   confirmada e paga, na loja do estoque do canal (a Loja de rua), sem
 *   aprovação, sem comissão e sem NF do sistema (o Bling emite a do
 *   marketplace). O estoque baixa na hora; faltando, fica em zero e o pedido
 *   anota. Pedido cancelado no Bling cancela a venda e devolve o estoque.
 * - Produtos: o item do pedido aponta para um produto do Bling. O vínculo com
 *   o produto do sistema sai sozinho quando o código do Bling é o SKU; senão o
 *   pedido espera o administrador vincular (status aguardando_vinculo).
 * - Estoque: com sync_stock ligado, o saldo da loja do canal vai para o
 *   depósito do Bling como balanço (valor absoluto), e o Bling atualiza os
 *   anúncios. Só manda o que mudou.
 * Situações de pedido do Bling: 6 em aberto, 9 atendido, 12 cancelado,
 * 15 em andamento, 18 venda agenciada, 21 em digitação, 24 verificado.
 */
const bling = require(`${__hooks}/lib/bling.js`)

const CANCELED = 12
const text = (v) => String(v === undefined || v === null ? '' : v).trim()
const digits = (v) => text(v).replace(/\D/g, '')
const round2 = (v) => Math.round(v * 100) / 100
// O Bling aceita 3 chamadas por segundo por conta: uma pausa entre as leituras.
const pace = () => {
  if (typeof sleep === 'function') sleep(350)
}

function get(app, rec, path) {
  const res = bling.call(app, rec, 'GET', path)
  if (res.statusCode === 403) {
    throw new Error(
      'o aplicativo do Bling não tem permissão para isso (' +
        bling.describe(res) +
        '). Acrescente o escopo no aplicativo e clique em "Conectar de novo".',
    )
  }
  if (res.statusCode !== 200) throw new Error('o Bling não respondeu (' + bling.describe(res) + ')')
  return (res.json && res.json.data) || []
}

function audit(app, orgId, entity, recordId, userId, reason) {
  if (!userId) return
  const log = new Record(app.findCollectionByNameOrId('audit_logs'))
  log.set('org', orgId)
  log.set('entity', entity)
  log.set('record_id', recordId)
  log.set('action', 'alteracao')
  log.set('user', userId)
  log.set('reason', reason)
  app.save(log)
}

// Produto do sistema para o produto do Bling: vínculo salvo ou o mesmo código.
function productFor(app, orgId, item) {
  const blingId = text(item.produto && item.produto.id)
  if (blingId && blingId !== '0') {
    const links = app.findRecordsByFilter(
      'bling_product_links',
      'org = {:org} && bling_product_id = {:id}',
      '',
      1,
      0,
      { org: orgId, id: blingId },
    )
    if (links.length > 0) return app.findRecordById('products', links[0].getString('product'))
  }
  const code = text(item.codigo).toUpperCase()
  if (!code) return null
  const found = app.findRecordsByFilter('products', 'org = {:org} && sku = {:sku}', '', 1, 0, {
    org: orgId,
    sku: code,
  })
  if (found.length === 0) return null
  if (blingId && blingId !== '0') link(app, orgId, found[0].id, item)
  return found[0]
}

function link(app, orgId, productId, item) {
  const blingId = text(item.produto && item.produto.id)
  const existing = app.findRecordsByFilter(
    'bling_product_links',
    'org = {:org} && bling_product_id = {:id}',
    '',
    1,
    0,
    { org: orgId, id: blingId },
  )
  const rec =
    existing.length > 0
      ? existing[0]
      : new Record(app.findCollectionByNameOrId('bling_product_links'))
  rec.set('org', orgId)
  rec.set('product', productId)
  rec.set('bling_product_id', blingId)
  rec.set('bling_code', text(item.codigo))
  rec.set('bling_name', text(item.descricao || item.nome))
  if (existing.length === 0) rec.set('last_pushed_stock', -1)
  app.save(rec)
  return rec
}

// Cliente do pedido: pelo CPF/CNPJ, ou um cadastro novo com o endereço de entrega.
function customerFor(tx, orgId, order) {
  const c = order.contato || {}
  const doc = digits(c.numeroDocumento)
  if (doc) {
    const found = tx.findRecordsByFilter(
      'customers',
      'org = {:org} && document = {:doc}',
      '',
      1,
      0,
      {
        org: orgId,
        doc: doc,
      },
    )
    if (found.length > 0) return found[0]
  }
  const e = (order.transporte && order.transporte.etiqueta) || {}
  const rec = new Record(tx.findCollectionByNameOrId('customers'))
  rec.set('org', orgId)
  rec.set('name', text(c.nome) || 'Cliente do marketplace')
  rec.set('phone', digits(c.telefone) || 'sem telefone (marketplace)')
  rec.set('document', doc.length === 11 || doc.length === 14 ? doc : '')
  rec.set('email', text(c.email))
  if (digits(e.cep).length === 8) rec.set('cep', digits(e.cep))
  rec.set('street', text(e.endereco))
  rec.set('street_number', text(e.numero))
  rec.set('complement', text(e.complemento))
  rec.set('district', text(e.bairro))
  rec.set('city', text(e.municipio))
  if (/^[A-Za-z]{2}$/.test(text(e.uf))) rec.set('uf', text(e.uf).toUpperCase())
  rec.set('notes', 'Cadastrado pela venda do marketplace.')
  tx.save(rec)
  return rec
}

function orderRecord(app, orgId, order) {
  const found = app.findRecordsByFilter(
    'marketplace_orders',
    'org = {:org} && bling_order_id = {:id}',
    '',
    1,
    0,
    { org: orgId, id: text(order.id) },
  )
  return found.length > 0 ? found[0] : null
}

function saveOrder(app, orgId, channel, order, fields) {
  const rec =
    orderRecord(app, orgId, order) || new Record(app.findCollectionByNameOrId('marketplace_orders'))
  rec.set('org', orgId)
  rec.set('channel', channel.id)
  rec.set('bling_order_id', text(order.id))
  rec.set('external_number', text(order.numeroLoja))
  rec.set('order_date', text(order.data))
  rec.set('total', Number(order.total) || 0)
  rec.set('customer_name', text(order.contato && order.contato.nome))
  rec.set('bling_status', text(order.situacao && order.situacao.id))
  for (const k in fields) rec.set(k, fields[k])
  app.save(rec)
  return rec
}

// Cria a venda do pedido (transação única). Devolve a venda.
function createSale(app, channel, order, lines) {
  const orgId = channel.getString('org')
  let sale = null
  const shortages = []
  app.runInTransaction((tx) => {
    const st = tx.findRecordById('stores', channel.getString('stock_store'))
    const customer = customerFor(tx, orgId, order)
    const seq = st.getInt('sale_seq') + 1
    st.set('sale_seq', seq)
    tx.save(st)
    const number = (st.getString('code') || 'LJ') + '-' + ('000000' + seq).slice(-6)
    const taxes = order.taxas || {}
    let subtotal = 0
    let discount = 0
    for (const l of lines) {
      subtotal += round2(l.price * l.qty)
      discount += l.discount
    }
    const total = round2(subtotal - discount)

    sale = new Record(tx.findCollectionByNameOrId('sales'))
    sale.set('org', orgId)
    sale.set('legal_entity', st.getString('legal_entity'))
    sale.set('number', number)
    sale.set('customer', customer.id)
    sale.set('store', st.id)
    sale.set('seller', channel.getString('seller'))
    sale.set('status', 'confirmada')
    sale.set('submitted_at', new DateTime())
    sale.set('confirmed_at', new DateTime())
    sale.set('subtotal', round2(subtotal))
    sale.set('total_discount', round2(discount))
    sale.set('total', total)
    sale.set('payment', 'marketplace')
    sale.set('installments', 1)
    sale.set('payment_status', 'pago')
    sale.set('delivery_status', 'pendente')
    sale.set('pending_balance', 0)
    sale.set('idempotency_key', 'bling-pedido-' + text(order.id))
    sale.set('channel', channel.id)
    sale.set('external_number', text(order.numeroLoja))
    sale.set('marketplace_fee', Number(taxes.taxaComissao) || 0)
    sale.set('shipping_cost', Number(taxes.custoFrete) || 0)
    sale.set(
      'observation',
      channel.getString('name') +
        ' — pedido ' +
        text(order.numeroLoja) +
        ' (Bling nº ' +
        text(order.numero) +
        '). A nota fiscal sai pelo Bling.',
    )
    tx.save(sale)

    const movementsCol = tx.findCollectionByNameOrId('stock_movements')
    for (const l of lines) {
      const item = new Record(tx.findCollectionByNameOrId('sale_items'))
      item.set('org', orgId)
      item.set('sale', sale.id)
      item.set('product', l.product.id)
      item.set('product_name', l.product.getString('name'))
      item.set('sku', l.product.getString('sku'))
      item.set('sale_price', l.price)
      item.set('cost_price', l.product.getFloat('cost_price'))
      item.set('cost_price_snapshot', l.product.getFloat('cost_price'))
      item.set('quantity', l.qty)
      item.set('discount', l.discount)
      item.set('total', round2(l.price * l.qty - l.discount))
      item.set('returned_quantity', 0)
      tx.save(item)

      const rows = tx.findRecordsByFilter(
        'stock_items',
        "store = {:store} && product = {:product} && variant = ''",
        '',
        1,
        0,
        { store: st.id, product: l.product.id },
      )
      const row = rows.length > 0 ? rows[0] : new Record(tx.findCollectionByNameOrId('stock_items'))
      const available = rows.length > 0 ? row.getFloat('quantity') : 0
      if (rows.length === 0) {
        row.set('org', orgId)
        row.set('store', st.id)
        row.set('product', l.product.id)
      }
      if (available < l.qty)
        shortages.push(l.product.getString('name') + ' (havia ' + available + ')')
      row.set('quantity', Math.max(0, available - l.qty))
      tx.save(row)
      const mv = new Record(movementsCol)
      mv.set('org', orgId)
      mv.set('type', 'saida_venda')
      mv.set('product', l.product.id)
      mv.set('store', st.id)
      mv.set('quantity', -l.qty)
      mv.set('date', new DateTime())
      mv.set('user', channel.getString('seller'))
      mv.set(
        'reason',
        'Venda ' + number + ' — ' + channel.getString('name') + ' ' + text(order.numeroLoja),
      )
      mv.set('source_ref', sale.id)
      tx.save(mv)
    }

    const pay = new Record(tx.findCollectionByNameOrId('sale_payments'))
    pay.set('org', orgId)
    pay.set('legal_entity', st.getString('legal_entity'))
    pay.set('sale', sale.id)
    pay.set('method', 'marketplace')
    pay.set('amount', total)
    pay.set('confirmed', true)
    pay.set('installments', 1)
    pay.set('installment_value', total)
    pay.set('card_tax_rate', 0)
    pay.set('card_tax_amount', Number(taxes.taxaComissao) || 0)
    pay.set('net_amount', round2(total - (Number(taxes.taxaComissao) || 0)))
    tx.save(pay)

    const log = new Record(tx.findCollectionByNameOrId('audit_logs'))
    log.set('org', orgId)
    log.set('entity', 'sales')
    log.set('record_id', sale.id)
    log.set('action', 'criacao')
    log.set('user', channel.getString('seller'))
    log.set(
      'reason',
      'Venda ' +
        number +
        ' importada do ' +
        channel.getString('name') +
        ' (pedido ' +
        text(order.numeroLoja) +
        ')' +
        (shortages.length ? '; faltou estoque: ' + shortages.join(', ') : ''),
    )
    tx.save(log)
  })
  return { sale: sale, shortages: shortages }
}

// Cancela a venda importada cujo pedido foi cancelado no Bling.
function cancelSale(app, channel, saleId, externalNumber) {
  app.runInTransaction((tx) => {
    const s = tx.findRecordById('sales', saleId)
    if (s.getString('status') === 'cancelada') return
    for (const it of tx.findRecordsByFilter('sale_items', 'sale = {:sale}', '', 0, 0, {
      sale: saleId,
    })) {
      const qty = it.getFloat('quantity') - it.getFloat('returned_quantity')
      if (!(qty > 0) || !it.getString('product')) continue
      const rows = tx.findRecordsByFilter(
        'stock_items',
        "store = {:store} && product = {:product} && variant = ''",
        '',
        1,
        0,
        { store: s.getString('store'), product: it.getString('product') },
      )
      if (rows.length > 0) {
        rows[0].set('quantity', rows[0].getFloat('quantity') + qty)
        tx.save(rows[0])
      }
      const mv = new Record(tx.findCollectionByNameOrId('stock_movements'))
      mv.set('org', s.getString('org'))
      mv.set('type', 'cancelamento_venda')
      mv.set('product', it.getString('product'))
      mv.set('store', s.getString('store'))
      mv.set('quantity', qty)
      mv.set('date', new DateTime())
      mv.set('user', channel.getString('seller'))
      mv.set('reason', 'Pedido ' + externalNumber + ' cancelado no ' + channel.getString('name'))
      mv.set('source_ref', saleId)
      tx.save(mv)
    }
    s.set('status', 'cancelada')
    s.set('cancellation_reason', 'Pedido cancelado no ' + channel.getString('name') + '.')
    s.set('canceled_by', channel.getString('seller'))
    s.set('canceled_at', new DateTime())
    tx.save(s)
    const log = new Record(tx.findCollectionByNameOrId('audit_logs'))
    log.set('org', s.getString('org'))
    log.set('entity', 'sales')
    log.set('record_id', saleId)
    log.set('action', 'cancelamento')
    log.set('user', channel.getString('seller'))
    log.set(
      'reason',
      'Venda ' +
        s.getString('number') +
        ' cancelada: pedido ' +
        externalNumber +
        ' cancelado no ' +
        channel.getString('name'),
    )
    tx.save(log)
  })
}

// Importa (ou atualiza) um pedido do Bling. Devolve o status final.
function processOrder(app, rec, channel, summary, order) {
  const orgId = channel.getString('org')
  const situation = Number(order.situacao && order.situacao.id)
  const mo = orderRecord(app, orgId, order)
  const status = mo ? mo.getString('status') : ''

  if (status === 'importado') {
    if (situation === CANCELED) {
      cancelSale(app, channel, mo.getString('sale'), text(order.numeroLoja))
      saveOrder(app, orgId, channel, order, { status: 'cancelado' })
      summary.canceled++
    } else if (text(order.situacao && order.situacao.id) !== mo.getString('bling_status')) {
      saveOrder(app, orgId, channel, order, {})
    }
    return
  }
  if (status === 'ignorado' || status === 'cancelado') return
  if (situation === CANCELED) {
    if (!mo) summary.ignored++
    saveOrder(app, orgId, channel, order, {
      status: 'ignorado',
      note: 'Cancelado no marketplace antes de entrar no sistema.',
    })
    return
  }

  // Novo, ou esperando vínculo/erro: lê o pedido completo e tenta de novo.
  pace()
  const full = get(app, rec, '/pedidos/vendas/' + text(order.id))
  const lines = []
  const missing = []
  for (const it of full.itens || []) {
    const product = productFor(app, orgId, it)
    const qty = Number(it.quantidade) || 0
    const price = Number(it.valor) || 0
    if (!product) {
      missing.push({
        bling_product_id: text(it.produto && it.produto.id),
        code: text(it.codigo),
        name: text(it.descricao),
      })
      continue
    }
    lines.push({
      product: product,
      qty: qty,
      price: price,
      // Desconto do item no Bling vem em porcentagem.
      discount: round2((price * qty * (Number(it.desconto) || 0)) / 100),
    })
  }
  if (missing.length > 0 || lines.length === 0) {
    saveOrder(app, orgId, channel, full, {
      status: 'aguardando_vinculo',
      missing: missing,
      note: 'Vincule o produto do Bling a um produto do sistema.',
    })
    summary.waiting++
    return
  }
  try {
    const created = createSale(app, channel, full, lines)
    saveOrder(app, orgId, channel, full, {
      status: 'importado',
      sale: created.sale.id,
      missing: [],
      note: created.shortages.length
        ? 'Faltou estoque na loja: ' + created.shortages.join(', ') + '. O saldo ficou em zero.'
        : '',
    })
    summary.imported++
  } catch (err) {
    saveOrder(app, orgId, channel, full, {
      status: 'erro',
      note: String(err.message || err).slice(0, 400),
    })
    summary.errors++
  }
}

// Lê os pedidos do canal alterados desde a última leitura (com folga de 2 dias).
function importChannel(app, rec, channel) {
  const summary = { imported: 0, waiting: 0, canceled: 0, ignored: 0, errors: 0 }
  if (!channel.getString('stock_store') || !channel.getString('seller')) {
    throw new Error('escolha a loja do estoque e o responsável pelas vendas do canal')
  }
  const from = text(channel.getString('import_from'))
  const last = channel.getFloat('last_import_at')
  let since = from
  if (last > 0) {
    const d = new Date(last - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!since || d > since) since = d
  }
  if (!since) since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  // O Bling recusa filtro de data com mais de 1 ano.
  const oldest = new Date(Date.now() - 360 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (since < oldest) since = oldest
  for (let page = 1; page <= 20; page++) {
    const orders = get(
      app,
      rec,
      '/pedidos/vendas?idLoja=' +
        encodeURIComponent(channel.getString('bling_store_id')) +
        '&dataAlteracaoInicial=' +
        encodeURIComponent(since + ' 00:00:00') +
        '&pagina=' +
        page +
        '&limite=100',
    )
    for (const order of orders) {
      if (from && text(order.data) < from) continue
      processOrder(app, rec, channel, summary, order)
    }
    if (orders.length < 100) break
  }
  channel.set('last_import_at', Date.now())
  channel.set('last_error', '')
  app.save(channel)
  return summary
}

// Saldo da loja do canal por produto do sistema.
function storeStock(app, storeId, productId) {
  let qty = 0
  for (const row of app.findRecordsByFilter(
    'stock_items',
    'store = {:store} && product = {:product}',
    '',
    0,
    0,
    { store: storeId, product: productId },
  )) {
    qty += row.getFloat('quantity')
  }
  return Math.max(0, Math.floor(qty))
}

// Comparação do estoque: sistema (loja do canal) × Bling, por vínculo.
function compareStock(app, rec, channel) {
  const orgId = channel.getString('org')
  const links = app.findRecordsByFilter(
    'bling_product_links',
    'org = {:org}',
    'bling_code',
    500,
    0,
    {
      org: orgId,
    },
  )
  const rows = []
  const ids = []
  for (const l of links) ids.push(l.getString('bling_product_id'))
  const blingQty = {}
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const data = get(
      app,
      rec,
      '/estoques/saldos?' + chunk.map((id) => 'idsProdutos[]=' + encodeURIComponent(id)).join('&'),
    )
    for (const s of data) {
      const id = text(s.produto && s.produto.id)
      const deposit = channel.getString('bling_deposit_id')
      let qty = Number(s.saldoVirtualTotal) || 0
      for (const d of s.depositos || []) {
        if (deposit && text(d.id) === deposit) qty = Number(d.saldoVirtual) || 0
      }
      blingQty[id] = qty
    }
  }
  for (const l of links) {
    let product = null
    try {
      product = app.findRecordById('products', l.getString('product'))
    } catch (_) {
      continue
    }
    rows.push({
      bling_product_id: l.getString('bling_product_id'),
      bling_code: l.getString('bling_code'),
      bling_name: l.getString('bling_name'),
      product: product.id,
      product_name: product.getString('name'),
      sku: product.getString('sku'),
      system_qty: storeStock(app, channel.getString('stock_store'), product.id),
      // O saldo do Bling só lista quem tem estoque positivo: ausente é zero.
      bling_qty: blingQty[l.getString('bling_product_id')] || 0,
      last_pushed: l.getFloat('last_pushed_stock'),
    })
  }
  return rows
}

// Manda ao Bling o saldo que mudou (balanço). Devolve quantos foram.
function pushStock(app, rec, channel, force) {
  const deposit = channel.getString('bling_deposit_id')
  if (!deposit) throw new Error('escolha o depósito do Bling que alimenta os anúncios')
  let sent = 0
  const failures = []
  for (const l of app.findRecordsByFilter('bling_product_links', 'org = {:org}', '', 500, 0, {
    org: channel.getString('org'),
  })) {
    const qty = storeStock(app, channel.getString('stock_store'), l.getString('product'))
    if (!force && qty === l.getFloat('last_pushed_stock')) continue
    pace()
    const res = bling.call(app, rec, 'POST', '/estoques', {
      produto: { id: Number(l.getString('bling_product_id')) },
      deposito: { id: Number(deposit) },
      operacao: 'B',
      quantidade: qty,
      observacoes: 'Saldo da loja no sistema de gestão New Way',
    })
    if (res.statusCode >= 300) {
      failures.push(l.getString('bling_code') + ': ' + bling.describe(res))
      continue
    }
    l.set('last_pushed_stock', qty)
    l.set('last_pushed_at', Date.now())
    app.save(l)
    sent++
  }
  channel.set('last_stock_sync_at', Date.now())
  if (failures.length)
    channel.set('last_error', 'Estoque não foi para o Bling: ' + failures.slice(0, 3).join('; '))
  app.save(channel)
  return { sent: sent, failures: failures }
}

// Canais (lojas) e depósitos do Bling para a tela de configuração. Sem a
// lista de canais, deduz pelos pedidos dos últimos 120 dias.
function discover(app, rec) {
  const channels = []
  const seen = {}
  let source = 'canais'
  try {
    for (const c of get(app, rec, '/canais-venda')) {
      const id = text(c.id)
      if (!id || seen[id]) continue
      seen[id] = true
      channels.push({ bling_store_id: id, name: text(c.descricao), type: text(c.tipo) })
    }
  } catch (_) {
    source = 'pedidos'
  }
  if (source === 'pedidos') {
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    for (let page = 1; page <= 5; page++) {
      const orders = get(
        app,
        rec,
        '/pedidos/vendas?dataInicial=' + since + '&pagina=' + page + '&limite=100',
      )
      for (const o of orders) {
        const id = text(o.loja && o.loja.id)
        if (!id || id === '0') continue
        if (!seen[id]) {
          seen[id] = {
            bling_store_id: id,
            name: '',
            type: '',
            orders: 0,
            sample: text(o.numeroLoja),
          }
          channels.push(seen[id])
        }
        seen[id].orders++
      }
      if (orders.length < 100) break
    }
  }
  const deposits = []
  try {
    for (const d of get(app, rec, '/depositos')) {
      deposits.push({
        id: text(d.id),
        name: text(d.descricao),
        standard: !!d.padrao,
        active: Number(d.situacao) !== 0,
      })
    }
  } catch (_) {}
  return { source: source, channels: channels, deposits: deposits }
}

// Anúncios (GET/POST /anuncios): o Bling só os gerencia pela API no Mercado Livre.
const LISTING_STATUS = { 1: 'publicado', 2: 'rascunho', 3: 'problema', 4: 'pausado' }
function integrationOf(channel) {
  if (channel.getString('kind') !== 'mercado_livre') {
    throw new Error(
      'o Bling só deixa ver e mexer nos anúncios do Mercado Livre pelo sistema; os da Amazon ficam nas telas do Bling',
    )
  }
  return (
    '?tipoIntegracao=MercadoLivre&idLoja=' + encodeURIComponent(channel.getString('bling_store_id'))
  )
}

function productForBlingId(app, orgId, blingId) {
  if (!blingId || blingId === '0') return ''
  const links = app.findRecordsByFilter(
    'bling_product_links',
    'org = {:org} && bling_product_id = {:id}',
    '',
    1,
    0,
    { org: orgId, id: blingId },
  )
  return links.length > 0 ? links[0].getString('product') : ''
}

// Relê os anúncios do canal nas 4 situações; o que sumiu do Bling sai daqui.
function refreshListings(app, rec, channel) {
  const orgId = channel.getString('org')
  const query = integrationOf(channel)
  const now = Date.now()
  let count = 0
  for (const situation of [1, 2, 3, 4]) {
    for (let page = 1; page <= 20; page++) {
      pace()
      const items = get(
        app,
        rec,
        '/anuncios' + query + '&situacao=' + situation + '&pagina=' + page + '&limite=100',
      )
      for (const a of items) {
        const id = text(a.id)
        if (!id) continue
        const found = app.findRecordsByFilter(
          'marketplace_listings',
          'org = {:org} && channel = {:ch} && bling_listing_id = {:id}',
          '',
          1,
          0,
          { org: orgId, ch: channel.id, id: id },
        )
        const l =
          found.length > 0
            ? found[0]
            : new Record(app.findCollectionByNameOrId('marketplace_listings'))
        l.set('org', orgId)
        l.set('channel', channel.id)
        l.set('bling_listing_id', id)
        l.set('listing_code', text(a.anuncioLoja && a.anuncioLoja.id))
        l.set('title', text(a.titulo))
        l.set('status', LISTING_STATUS[situation])
        const price = a.preco
        if (price !== undefined && price !== null) {
          l.set('price', typeof price === 'object' ? Number(price.valor) || 0 : Number(price) || 0)
          if (typeof price === 'object') l.set('promo_price', Number(price.promocional) || 0)
        }
        // O produto do Bling só vem no detalhe do anúncio: lê uma vez.
        if (!l.getString('bling_product_id')) {
          try {
            pace()
            const d = get(app, rec, '/anuncios/' + id + query)
            l.set('bling_product_id', text(d.produto && d.produto.id))
            if (d.preco && typeof d.preco === 'object') {
              l.set('price', Number(d.preco.valor) || l.getFloat('price'))
              l.set('promo_price', Number(d.preco.promocional) || 0)
            }
          } catch (_) {}
        }
        l.set('product', productForBlingId(app, orgId, l.getString('bling_product_id')))
        l.set('refreshed_at', now)
        app.save(l)
        count++
      }
      if (items.length < 100) break
    }
  }
  for (const old of app.findRecordsByFilter(
    'marketplace_listings',
    'org = {:org} && channel = {:ch} && refreshed_at < {:now}',
    '',
    0,
    0,
    { org: orgId, ch: channel.id, now: now },
  )) {
    app.delete(old)
  }
  return { count: count }
}

// Pausa ou publica o anúncio no marketplace pelo Bling.
function listingAction(app, rec, channel, listing, action) {
  const path = action === 'pausar' ? 'pausar' : 'publicar'
  const res = bling.call(
    app,
    rec,
    'POST',
    '/anuncios/' + listing.getString('bling_listing_id') + '/' + path + integrationOf(channel),
  )
  if (res.statusCode >= 300) {
    throw new Error(
      'o Bling não ' +
        (path === 'pausar' ? 'pausou' : 'publicou') +
        ' o anúncio (' +
        bling.describe(res) +
        ')',
    )
  }
  listing.set('status', path === 'pausar' ? 'pausado' : 'publicado')
  app.save(listing)
}

// Confere, uma a uma, as permissões que os marketplaces usam no Bling.
function checkPermissions(app, rec, channel) {
  const checks = [
    [
      'Pedidos de venda',
      '/pedidos/vendas?limite=1&idLoja=' + encodeURIComponent(channel.getString('bling_store_id')),
    ],
    ['Canais de venda', '/canais-venda'],
    ['Depósitos', '/depositos'],
    ['Estoques', '/estoques/saldos?idsProdutos[]=1'],
  ]
  if (channel.getString('kind') === 'mercado_livre') {
    checks.push(['Anúncios', '/anuncios' + integrationOf(channel) + '&limite=1'])
  }
  const out = []
  for (const [name, path] of checks) {
    pace()
    const res = bling.call(app, rec, 'GET', path)
    out.push({
      name: name,
      ok: res.statusCode === 200,
      detail:
        res.statusCode === 200
          ? ''
          : res.statusCode === 403
            ? 'sem permissão'
            : bling.describe(res),
    })
  }
  return out
}

module.exports = {
  CANCELED: CANCELED,
  discover: discover,
  refreshListings: refreshListings,
  listingAction: listingAction,
  checkPermissions: checkPermissions,
  get: get,
  audit: audit,
  link: link,
  importChannel: importChannel,
  compareStock: compareStock,
  pushStock: pushStock,
}

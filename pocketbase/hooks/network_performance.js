/**
 * PNR-01/02/03 (painel da rede, dono em 23/11/2026: "eu como adm tenho que
 * ter acesso" às vendas e ao desempenho das franquias). O admin da rede vê,
 * por mês, cada organização (lojas próprias e franquias) e cada loja:
 * faturamento, vendas, ticket, itens, descontos, cancelamentos, a
 * comparação com o mês anterior, os últimos 6 meses, os produtos mais
 * vendidos, o estoque, as vendas esperando aprovação e as últimas vendas.
 *
 * As regras da API isolam cada organização, então a leitura passa por esta
 * rota (ARQ-01) e devolve só o nível "básico" do R.2: nada de dados pessoais
 * de clientes (ESC-07), custo, margem, despesas ou comissões.
 *
 * GET /backend/v1/network/performance?month=AAAA-MM (padrão: mês corrente)
 * O mês segue o horário de Brasília (UTC-3). Faturamento = vendas
 * confirmadas, pela data de criação (como o Dashboard). O mês corrente
 * compara com os mesmos dias do mês anterior; um mês já fechado, com o mês
 * anterior inteiro.
 */
routerAdd('GET', '/backend/v1/network/performance', (e) => {
  const auth = e.auth
  const isNetworkAdmin =
    e.hasSuperuserAuth() ||
    (!!auth &&
      auth.collection().name === 'users' &&
      auth.getString('status') === 'ativo' &&
      auth.getString('network_role') === 'admin_rede')
  if (!isNetworkAdmin) {
    throw new ForbiddenError('Apenas o admin da rede vê o desempenho das franquias.')
  }

  const HOUR = 3600000
  const pad = (n) => (n < 10 ? '0' : '') + n
  // Início de um dia de Brasília, em UTC, no formato gravado no banco.
  // Date.UTC aceita dia além do fim do mês (vira o mês seguinte).
  const dayStart = (y, m, d) =>
    new Date(Date.UTC(y, m - 1, d) + 3 * HOUR).toISOString().replace('T', ' ')
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
  const shift = (y, m, delta) => {
    const t = (y * 12 + (m - 1) + delta) | 0
    return { y: Math.floor(t / 12), m: (t % 12) + 1 }
  }

  const now = new Date(Date.now() - 3 * HOUR)
  const today = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() }
  let y = today.y
  let m = today.m
  const raw = String(e.request.url.query().get('month') || '').trim()
  if (raw) {
    const match = /^(\d{4})-(\d{2})$/.exec(raw)
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
      throw new BadRequestError('Mês inválido. Use AAAA-MM, ex.: 2026-11.')
    }
    y = Number(match[1])
    m = Number(match[2])
    if (y * 12 + m > today.y * 12 + today.m) {
      throw new BadRequestError('Esse mês ainda não começou.')
    }
  }
  const isCurrent = y === today.y && m === today.m
  const prev = shift(y, m, -1)
  const next = shift(y, m, 1)
  const from = dayStart(y, m, 1)
  const to = dayStart(next.y, next.m, 1)
  const prevFrom = dayStart(prev.y, prev.m, 1)
  const prevTo = isCurrent
    ? dayStart(prev.y, prev.m, Math.min(today.d, daysIn(prev.y, prev.m)) + 1)
    : from
  const first = shift(y, m, -5)
  const historyFrom = dayStart(first.y, first.m, 1)

  const query = (sql, shape, params) => {
    const rows = arrayOf(new DynamicModel(shape))
    $app
      .db()
      .newQuery(sql)
      .bind(params || {})
      .all(rows)
    return rows
  }
  // Valores em centavos inteiros na consulta: nada de soma de float no JS.
  const cents = (expr) => 'CAST(ROUND(COALESCE(' + expr + ', 0) * 100) AS INTEGER)'
  const reais = (c) => Math.round(c) / 100

  // 1. Organizações e lojas ---------------------------------------------------
  const orgs = []
  const orgById = {}
  const storeById = {}
  const blankTotals = () => ({
    revenue: 0,
    sales: 0,
    ticket: 0,
    items: 0,
    discounts: 0,
    canceled: 0,
    canceled_value: 0,
    returned: 0,
    rejected: 0,
    pending: 0,
    prev_revenue: 0,
    prev_sales: 0,
  })
  for (const o of $app.findRecordsByFilter(
    'organizations',
    "type = 'propria' || type = 'franquia'",
    // Lojas próprias primeiro ("propria" > "franquia"), depois por nome.
    '-type,name',
    0,
    0,
  )) {
    const org = {
      id: o.id,
      name: o.getString('name'),
      type: o.getString('type'),
      status: o.getString('status'),
      region: o.getString('region'),
      created: o.getString('created'),
      active_products: 0,
      users: 0,
      last_sale_at: '',
      totals: blankTotals(),
      stock: { units: 0, products: 0, value: 0 },
      stores: [],
      history: [],
      top_products: [],
      recent_sales: [],
    }
    for (let i = 5; i >= 0; i--) {
      const h = shift(y, m, -i)
      org.history.push({ month: h.y + '-' + pad(h.m), revenue: 0, sales: 0 })
    }
    orgs.push(org)
    orgById[org.id] = org
  }
  for (const st of $app.findRecordsByFilter('stores', "id != ''", 'name', 0, 0)) {
    const org = orgById[st.getString('org')]
    if (!org) continue
    const store = {
      id: st.id,
      name: st.getString('name'),
      code: st.getString('code'),
      status: st.getString('status'),
      last_sale_at: '',
      totals: blankTotals(),
      stock: { units: 0, products: 0, value: 0 },
    }
    org.stores.push(store)
    storeById[store.id] = { store: store, org: org }
  }

  // Soma uma linha nas totais da loja e da organização.
  const addTo = (storeId, fn) => {
    const hit = storeById[storeId]
    if (!hit) return
    fn(hit.store.totals)
    fn(hit.org.totals)
  }

  // 2. Vendas do mês, por loja ------------------------------------------------
  const period = { from: from, to: to }
  for (const r of query(
    'SELECT store,' +
      " SUM(CASE WHEN status = 'confirmada' THEN 1 ELSE 0 END) AS sales," +
      ' ' +
      cents("SUM(CASE WHEN status = 'confirmada' THEN total END)") +
      ' AS revenue,' +
      ' ' +
      cents("SUM(CASE WHEN status = 'confirmada' THEN total_discount END)") +
      ' AS discounts,' +
      " SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END) AS canceled," +
      ' ' +
      cents("SUM(CASE WHEN status = 'cancelada' THEN total END)") +
      ' AS canceled_value,' +
      " SUM(CASE WHEN status = 'devolvida' THEN 1 ELSE 0 END) AS returned," +
      " SUM(CASE WHEN status = 'recusada' THEN 1 ELSE 0 END) AS rejected" +
      ' FROM sales WHERE created >= {:from} AND created < {:to} GROUP BY store',
    {
      store: '',
      sales: 0,
      revenue: 0,
      discounts: 0,
      canceled: 0,
      canceled_value: 0,
      returned: 0,
      rejected: 0,
    },
    period,
  )) {
    addTo(r.store, (t) => {
      t.sales += r.sales
      t.revenue += reais(r.revenue)
      t.discounts += reais(r.discounts)
      t.canceled += r.canceled
      t.canceled_value += reais(r.canceled_value)
      t.returned += r.returned
      t.rejected += r.rejected
    })
  }
  for (const r of query(
    'SELECT s.store AS store, CAST(COALESCE(SUM(i.quantity), 0) AS INTEGER) AS items' +
      ' FROM sale_items i JOIN sales s ON s.id = i.sale' +
      " WHERE s.status = 'confirmada' AND s.created >= {:from} AND s.created < {:to}" +
      ' GROUP BY s.store',
    { store: '', items: 0 },
    period,
  )) {
    addTo(r.store, (t) => (t.items += r.items))
  }
  for (const r of query(
    'SELECT store, COUNT(*) AS sales, ' +
      cents('SUM(total)') +
      ' AS revenue' +
      " FROM sales WHERE status = 'confirmada' AND created >= {:from} AND created < {:to}" +
      ' GROUP BY store',
    { store: '', sales: 0, revenue: 0 },
    { from: prevFrom, to: prevTo },
  )) {
    addTo(r.store, (t) => {
      t.prev_sales += r.sales
      t.prev_revenue += reais(r.revenue)
    })
  }

  // 3. Situação atual: aguardando aprovação e a última venda de cada loja ----
  for (const r of query(
    "SELECT store, COUNT(*) AS pending FROM sales WHERE status = 'aguardando_aprovacao' GROUP BY store",
    { store: '', pending: 0 },
  )) {
    addTo(r.store, (t) => (t.pending += r.pending))
  }
  for (const r of query(
    "SELECT store, COALESCE(MAX(created), '') AS last" +
      " FROM sales WHERE status IN ('confirmada', 'devolvida', 'aguardando_aprovacao')" +
      ' GROUP BY store',
    { store: '', last: '' },
  )) {
    const hit = storeById[r.store]
    if (!hit) continue
    hit.store.last_sale_at = r.last
    if (r.last > hit.org.last_sale_at) hit.org.last_sale_at = r.last
  }

  // 4. Estoque (unidades, produtos com saldo e valor pelo preço de venda) ---
  for (const r of query(
    'SELECT si.store AS store,' +
      ' CAST(COALESCE(SUM(si.quantity), 0) AS INTEGER) AS units,' +
      ' COUNT(DISTINCT si.product) AS products,' +
      ' ' +
      cents('SUM(si.quantity * COALESCE(NULLIF(v.sale_price, 0), p.sale_price, 0))') +
      ' AS value' +
      ' FROM stock_items si' +
      ' LEFT JOIN products p ON p.id = si.product' +
      ' LEFT JOIN product_variants v ON v.id = si.variant' +
      ' WHERE si.quantity > 0 GROUP BY si.store',
    { store: '', units: 0, products: 0, value: 0 },
  )) {
    const hit = storeById[r.store]
    if (!hit) continue
    hit.store.stock = { units: r.units, products: r.products, value: reais(r.value) }
    hit.org.stock.units += r.units
    hit.org.stock.value += reais(r.value)
  }
  // Produtos distintos por organização (o mesmo produto em duas lojas conta 1).
  for (const r of query(
    'SELECT st.org AS org, COUNT(DISTINCT si.product) AS products' +
      ' FROM stock_items si JOIN stores st ON st.id = si.store' +
      ' WHERE si.quantity > 0 GROUP BY st.org',
    { org: '', products: 0 },
  )) {
    if (orgById[r.org]) orgById[r.org].stock.products = r.products
  }

  // 5. Cadastro: produtos ativos e usuários ativos --------------------------
  for (const r of query(
    "SELECT org, COUNT(*) AS n FROM products WHERE status = 'ativo' GROUP BY org",
    { org: '', n: 0 },
  )) {
    if (orgById[r.org]) orgById[r.org].active_products = r.n
  }
  for (const r of query(
    "SELECT org, COUNT(*) AS n FROM users WHERE status = 'ativo' GROUP BY org",
    { org: '', n: 0 },
  )) {
    if (orgById[r.org]) orgById[r.org].users = r.n
  }

  // 6. Últimos 6 meses (faturamento e vendas confirmadas por mês) ----------
  for (const r of query(
    "SELECT org, strftime('%Y-%m', datetime(substr(created, 1, 19), '-3 hours')) AS month," +
      ' COUNT(*) AS sales, ' +
      cents('SUM(total)') +
      ' AS revenue' +
      " FROM sales WHERE status = 'confirmada' AND created >= {:from} AND created < {:to}" +
      ' GROUP BY org, month',
    { org: '', month: '', sales: 0, revenue: 0 },
    { from: historyFrom, to: to },
  )) {
    const org = orgById[r.org]
    if (!org) continue
    for (const h of org.history) {
      if (h.month === r.month) {
        h.sales = r.sales
        h.revenue = reais(r.revenue)
      }
    }
  }

  // 7. Produtos mais vendidos no mês (5 por organização) -------------------
  for (const r of query(
    'SELECT org, product, name, sku, quantity, revenue FROM (' +
      " SELECT s.org AS org, COALESCE(i.product, '') AS product," +
      " COALESCE(MAX(i.product_name), '') AS name, COALESCE(MAX(i.sku), '') AS sku," +
      ' CAST(COALESCE(SUM(i.quantity), 0) AS INTEGER) AS quantity, ' +
      cents('SUM(i.total)') +
      ' AS revenue,' +
      ' ROW_NUMBER() OVER (PARTITION BY s.org ORDER BY SUM(i.total) DESC) AS rank' +
      ' FROM sale_items i JOIN sales s ON s.id = i.sale' +
      " WHERE s.status = 'confirmada' AND s.created >= {:from} AND s.created < {:to}" +
      ' GROUP BY s.org, i.product' +
      ') WHERE rank <= 5 ORDER BY org, rank',
    { org: '', product: '', name: '', sku: '', quantity: 0, revenue: 0 },
    period,
  )) {
    const org = orgById[r.org]
    if (!org) continue
    org.top_products.push({
      name: r.name,
      sku: r.sku,
      quantity: r.quantity,
      revenue: reais(r.revenue),
    })
  }

  // 8. Últimas vendas do mês (20 por organização), sem o cliente (ESC-07) ---
  for (const r of query(
    'SELECT * FROM (' +
      " SELECT s.id AS id, s.org AS org, COALESCE(s.number, '') AS number, s.created AS created," +
      " COALESCE(s.store, '') AS store, COALESCE(u.name, '') AS seller," +
      ' ' +
      cents('s.total') +
      " AS total, COALESCE(s.payment, '') AS payment, COALESCE(s.status, '') AS status," +
      " COALESCE(s.channel, '') AS channel," +
      ' CAST(COALESCE((SELECT SUM(quantity) FROM sale_items WHERE sale = s.id), 0) AS INTEGER) AS items,' +
      ' ROW_NUMBER() OVER (PARTITION BY s.org ORDER BY s.created DESC) AS rank' +
      ' FROM sales s LEFT JOIN users u ON u.id = s.seller' +
      " WHERE s.status != 'rascunho' AND s.created >= {:from} AND s.created < {:to}" +
      ') WHERE rank <= 20 ORDER BY org, created DESC',
    {
      id: '',
      org: '',
      number: '',
      created: '',
      store: '',
      seller: '',
      total: 0,
      payment: '',
      status: '',
      channel: '',
      items: 0,
    },
    period,
  )) {
    const org = orgById[r.org]
    if (!org) continue
    const hit = storeById[r.store]
    org.recent_sales.push({
      id: r.id,
      number: r.number,
      created: r.created,
      store: hit ? hit.store.name : '',
      seller: r.seller,
      items: r.items,
      total: reais(r.total),
      payment: r.payment,
      status: r.status,
      marketplace: !!r.channel,
    })
  }

  // Ticket médio e arredondamento final.
  const finish = (t) => {
    t.revenue = Math.round(t.revenue * 100) / 100
    t.discounts = Math.round(t.discounts * 100) / 100
    t.canceled_value = Math.round(t.canceled_value * 100) / 100
    t.prev_revenue = Math.round(t.prev_revenue * 100) / 100
    t.ticket = t.sales > 0 ? Math.round((t.revenue / t.sales) * 100) / 100 : 0
  }
  for (const org of orgs) {
    finish(org.totals)
    org.stock.value = Math.round(org.stock.value * 100) / 100
    for (const s of org.stores) finish(s.totals)
  }

  return e.json(200, {
    month: y + '-' + pad(m),
    current: isCurrent,
    // Até que dia do mês anterior a comparação vai (mês corrente).
    compare_until_day: isCurrent ? Math.min(today.d, daysIn(prev.y, prev.m)) : 0,
    organizations: orgs,
  })
})

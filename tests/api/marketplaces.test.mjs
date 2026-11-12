// Marketplaces pelo Bling (dono, 11/11/2026): os pedidos do Mercado Livre
// entram como venda confirmada na Loja de rua (sem aprovação, sem comissão e
// sem NF do sistema), baixam o estoque, esperam vínculo quando o produto não
// é conhecido, e o cancelamento no Bling cancela a venda. O estoque volta ao
// Bling como balanço só quando o administrador liga. Bling de mentira.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

const PASSWORD = 'SenhaForte!2026'
const ML = 206201560
const DEPOSIT = 14888887077
let pb
let api
let fake
const ctx = {}

const order = (id, numeroLoja, items, extra = {}) => ({
  id,
  numero: id % 1000,
  numeroLoja,
  data: extra.data || '2026-11-10',
  loja: { id: extra.loja || ML },
  situacao: { id: extra.situacao || 6, valor: 0 },
  contato: { id: 1, nome: extra.nome || 'Fabio Comprador (fabiocompra)', numeroDocumento: extra.doc || '529.982.247-25', tipoPessoa: 'F' },
  itens: items.map(([produtoId, codigo, valor, quantidade, desconto]) => ({
    produto: { id: produtoId },
    codigo,
    descricao: 'Produto ' + codigo,
    valor,
    quantidade,
    desconto: desconto || 0,
  })),
  total: items.reduce((t, [, , v, q, d]) => t + v * q * (1 - (d || 0) / 100), 0),
  taxas: { custoFrete: 106.85, taxaComissao: 1395.57, valorBase: 8458 },
  transporte: {
    etiqueta: { endereco: 'Rua São Pedro', numero: '555', complemento: 'Casa', bairro: 'São Pedro', cep: '25956280', municipio: 'Teresópolis', uf: 'RJ' },
  },
})

function startFakeBling() {
  const b = {
    orders: new Map(),
    stock: new Map(),
    pushes: [],
    valid: new Set(),
    listCalls: [],
    // Anúncios do Mercado Livre: id → { titulo, situacao (1 publicado..4 pausado), mlb, produto, preco }
    listings: new Map([
      [501, { titulo: 'Bicicleta Elétrica Navee WDB04 1000W', situacao: 1, mlb: 'MLB5011', produto: 16666906267, preco: 8458 }],
      [502, { titulo: 'Capacete Urbano', situacao: 4, mlb: 'MLB5022', produto: 555, preco: 129.9 }],
      [503, { titulo: 'Patinete sem vínculo', situacao: 2, mlb: 'MLB5033', produto: 999, preco: 1999 }],
    ]),
    listingCalls: [],
  }
  const send = (res, status, json) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(json))
  }
  b.server = http.createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    const url = new URL(req.url, 'http://bling')
    const p = url.pathname
    if (p === '/oauth/token') {
      b.valid.add('tok')
      return send(res, 200, { access_token: 'tok', refresh_token: 'ref', expires_in: 21600 })
    }
    if (String(req.headers.authorization) !== 'Bearer tok') return send(res, 401, {})
    if (p === '/api/empresas/me/dados-basicos') return send(res, 200, { data: { nome: 'NEW WAY ELETRIC LTDA', cnpj: '65.321.600/0001-05' } })
    if (p === '/api/canais-venda') return send(res, 200, { data: [{ id: ML, descricao: 'Mercado Livre', tipo: 'MercadoLivre' }] })
    if (p === '/api/depositos') return send(res, 200, { data: [{ id: DEPOSIT, descricao: 'Geral', padrao: true, situacao: 1 }] })
    if (p === '/api/pedidos/vendas') {
      b.listCalls.push(Object.fromEntries(url.searchParams))
      const loja = url.searchParams.get('idLoja')
      const page = Number(url.searchParams.get('pagina') || 1)
      const all = [...b.orders.values()].filter((o) => !loja || String(o.loja.id) === loja)
      const slice = all.slice((page - 1) * 100, page * 100).map(({ itens, taxas, transporte, ...summary }) => summary)
      return send(res, 200, { data: slice })
    }
    const m = p.match(/^\/api\/pedidos\/vendas\/(\d+)$/)
    if (m && b.orders.has(Number(m[1]))) return send(res, 200, { data: b.orders.get(Number(m[1])) })
    if (p === '/api/anuncios') {
      b.listingCalls.push(Object.fromEntries(url.searchParams))
      if (url.searchParams.get('tipoIntegracao') !== 'MercadoLivre' || url.searchParams.get('idLoja') !== String(ML)) {
        return send(res, 400, { error: { message: 'Integração inválida' } })
      }
      const sit = Number(url.searchParams.get('situacao') || 1)
      const data = [...b.listings.entries()]
        .filter(([, l]) => l.situacao === sit)
        .map(([id, l]) => ({ id, titulo: l.titulo, situacao: l.situacao, anuncioLoja: { id: l.mlb }, preco: l.preco }))
      return send(res, 200, { data })
    }
    const an = p.match(/^\/api\/anuncios\/(\d+)(\/(pausar|publicar))?$/)
    if (an && b.listings.has(Number(an[1]))) {
      const l = b.listings.get(Number(an[1]))
      b.listingCalls.push({ path: p, method: req.method, ...Object.fromEntries(url.searchParams) })
      if (an[3]) {
        l.situacao = an[3] === 'pausar' ? 4 : 1
        return send(res, 200, { data: {} })
      }
      return send(res, 200, { data: { id: Number(an[1]), produto: { id: l.produto }, preco: { valor: l.preco, promocional: 0 } } })
    }
    if (p === '/api/estoques/saldos') {
      const ids = url.searchParams.getAll('idsProdutos[]').map(Number)
      return send(res, 200, {
        data: ids.map((id) => ({
          produto: { id },
          saldoVirtualTotal: b.stock.get(id) ?? 0,
          depositos: [{ id: DEPOSIT, saldoVirtual: b.stock.get(id) ?? 0 }],
        })),
      })
    }
    if (p === '/api/estoques' && req.method === 'POST') {
      const j = JSON.parse(body)
      b.pushes.push(j)
      b.stock.set(j.produto.id, j.quantidade)
      return send(res, 201, { data: { id: b.pushes.length } })
    }
    send(res, 404, { error: { type: 'RESOURCE_NOT_FOUND' } })
  })
  return new Promise((resolve) => {
    b.server.listen(0, '127.0.0.1', () => {
      b.url = `http://127.0.0.1:${b.server.address().port}`
      resolve(b)
    })
  })
}

const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)
const req = (method, url, body, token = ctx.admin) => api(method, url, { token, body })
const list = async (collection, filter) =>
  (await req('GET', `/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`)).json.items
const stockOf = async (product, store) => {
  const rows = await list('stock_items', `product = '${product}' && store = '${store}'`)
  return rows.reduce((t, r) => t + r.quantity, 0)
}
const importNow = async () => {
  const res = await req('POST', `/backend/v1/marketplaces/channels/${ctx.channel}/import`)
  ok(res, 'importar')
  return res.json
}
const orders = async (status) =>
  (await req('GET', '/backend/v1/marketplaces/orders' + (status ? '?status=' + status : ''))).json.items

before(async () => {
  fake = await startFakeBling()
  process.env.BLING_OAUTH_BASE = fake.url + '/oauth'
  process.env.BLING_API_BASE = fake.url + '/api'
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = setup.json.token
  ctx.adminId = setup.json.record?.id || (await req('POST', '/api/collections/users/auth-refresh')).json.record.id
  ok(await req('POST', '/backend/v1/bling/credentials', { client_id: 'cid0123456789', client_secret: 'segredo0123456789' }), 'chaves')
  const state = new URL((await req('POST', '/backend/v1/bling/connect')).json.url).searchParams.get('state')
  await fetch(`${pb.baseUrl}/backend/v1/bling/callback?code=ok&state=${state}`, { redirect: 'manual' })

  const stores = (await req('GET', '/api/collections/stores/records')).json.items
  ctx.cj = stores.find((s) => s.slug === 'cajuru').id
  ctx.jp = stores.find((s) => s.slug === 'jockey-plaza').id
  ok(
    await req('POST', '/api/collections/users/records', {
      email: 'vendedor@newway.dev', name: 'Vendedor', password: PASSWORD, passwordConfirm: PASSWORD, profile: 'vendedor', stores: [ctx.cj],
    }),
    'vendedor',
  )
  ctx.seller = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: 'vendedor@newway.dev', password: PASSWORD } })).json.token

  const product = async (name, sku, cost) => {
    const res = await req('POST', '/api/collections/products/records', { status: 'ativo', name, sku, sale_price: 9000, cost_price: cost })
    ok(res, 'produto')
    return res.json.id
  }
  ctx.bike = await product('Bicicleta Elétrica Navee WDB04', 'TST-051', 5500)
  ctx.helmet = await product('Capacete', 'TST-CAP', 40)
  ok(await req('POST', '/api/collections/stock_items/records', { product: ctx.bike, store: ctx.cj, quantity: 3 }), 'estoque')
  ok(await req('POST', '/api/collections/stock_items/records', { product: ctx.helmet, store: ctx.cj, quantity: 1 }), 'estoque')

  fake.orders.set(9001, order(9001, '2000015952362833', [[16666906267, 'TST-051', 8458, 1]]))
  fake.orders.set(9002, order(9002, '2000015932140073', [[777, 'NW-999', 299.9, 1]], { nome: 'Outra Pessoa', doc: '111.444.777-35' }))
  fake.orders.set(9003, order(9003, '2000015911707333', [[16666906267, 'TST-051', 8458, 1]], { situacao: 12 }))
  fake.orders.set(9004, order(9004, '2000015000000001', [[16666906267, 'TST-051', 8458, 1]], { data: '2026-10-01' }))
  fake.orders.set(9005, order(9005, '2000015000000002', [[555, 'TST-CAP', 100, 3, 10]]))
})

after(async () => {
  if (pb) await pb.stop()
  fake?.server.close()
})

test('só o administrador mexe nos marketplaces', async () => {
  for (const [method, url] of [
    ['GET', '/backend/v1/marketplaces'],
    ['GET', '/backend/v1/marketplaces/discover'],
    ['POST', '/backend/v1/marketplaces/channels'],
    ['GET', '/backend/v1/marketplaces/orders'],
    ['POST', '/backend/v1/marketplaces/links'],
  ]) {
    const body = method === 'GET' ? undefined : {}
    assert.equal((await req(method, url, body, ctx.seller)).status, 403, url)
    assert.equal((await api(method, url, { body })).status, 403, url)
  }
  for (const name of ['sales_channels', 'bling_product_links', 'marketplace_orders']) {
    assert.equal((await req('GET', `/api/collections/${name}/records`)).status, 403, name)
  }
})

test('canais e depósitos vêm do Bling; o canal só liga com loja e responsável', async () => {
  const d = await req('GET', '/backend/v1/marketplaces/discover')
  assert.equal(d.status, 200, d.text)
  assert.deepEqual(d.json.channels, [{ bling_store_id: String(ML), name: 'Mercado Livre', type: 'MercadoLivre' }])
  assert.equal(d.json.deposits[0].id, String(DEPOSIT))

  const base = { bling_store_id: String(ML), name: 'Mercado Livre', kind: 'mercado_livre', import_from: '2026-11-01' }
  assert.equal((await req('POST', '/backend/v1/marketplaces/channels', { ...base, active: true })).status, 400)
  assert.equal(
    (await req('POST', '/backend/v1/marketplaces/channels', { ...base, active: true, stock_store: ctx.cj, seller: ctx.adminId, sync_stock: true })).status,
    400,
    'mandar estoque pede o depósito',
  )
  const saved = await req('POST', '/backend/v1/marketplaces/channels', { ...base, active: true, stock_store: ctx.cj, seller: ctx.adminId })
  assert.equal(saved.status, 200, saved.text)
  ctx.channel = saved.json.id
  const all = await req('GET', '/backend/v1/marketplaces')
  assert.equal(all.json.channels[0].active, true)
  assert.equal(all.json.channels[0].sync_stock, false)
})

test('o pedido do Mercado Livre vira venda confirmada na Loja de rua e baixa o estoque', async () => {
  const sum = await importNow()
  assert.deepEqual(sum, { imported: 2, waiting: 1, canceled: 0, ignored: 1, errors: 0 })
  assert.equal(fake.listCalls[0].idLoja, String(ML))
  assert.equal(fake.listCalls[0].dataAlteracaoInicial, '2026-11-01 00:00:00')

  const [sale] = await list('sales', "external_number = '2000015952362833'")
  assert.equal(sale.status, 'confirmada')
  assert.equal(sale.payment_status, 'pago')
  assert.equal(sale.payment, 'marketplace')
  assert.equal(sale.store, ctx.cj)
  assert.equal(sale.channel, ctx.channel)
  assert.equal(sale.total, 8458)
  assert.equal(sale.marketplace_fee, 1395.57)
  assert.equal(sale.shipping_cost, 106.85)
  assert.equal(sale.nf_status, '')
  assert.match(sale.number, /^[A-Z]+-000001$/)
  assert.equal(await stockOf(ctx.bike, ctx.cj), 2)
  assert.equal((await list('commissions', `sale = '${sale.id}'`)).length, 0, 'sem comissão')

  const customer = (await req('GET', `/api/collections/customers/records/${sale.customer}`)).json
  assert.equal(customer.document, '52998224725')
  assert.equal(customer.city, 'Teresópolis')
  assert.equal(customer.uf, 'RJ')

  // Desconto do item em % no Bling vira valor; faltou estoque: zera e anota.
  const [helmetSale] = await list('sales', "external_number = '2000015000000002'")
  assert.equal(helmetSale.total_discount, 30)
  assert.equal(helmetSale.total, 270)
  assert.equal(await stockOf(ctx.helmet, ctx.cj), 0)
  const notes = Object.fromEntries((await orders()).map((o) => [o.external_number, o]))
  assert.match(notes['2000015000000002'].note, /Faltou estoque na loja: Capacete \(havia 1\)/)

  // Antes do dia escolhido não entra; cancelado antes de entrar é ignorado.
  assert.equal(notes['2000015000000001'], undefined)
  assert.equal(notes['2000015911707333'].status, 'ignorado')
  assert.equal(notes['2000015932140073'].status, 'aguardando_vinculo')
  assert.deepEqual(notes['2000015932140073'].missing, [{ bling_product_id: '777', code: 'NW-999', name: 'Produto NW-999' }])

  // O vínculo do produto do Bling saiu sozinho pelo código.
  const links = await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/stock`)
  assert.deepEqual(links.json.items.map((l) => l.bling_product_id).sort(), ['16666906267', '555'])
})

test('buscar de novo não duplica; vinculado o produto, o pedido que esperava entra', async () => {
  const again = await importNow()
  assert.equal(again.imported, 0)
  assert.equal((await list('sales', "channel != ''")).length, 2)

  ok(
    await req('POST', '/backend/v1/marketplaces/links', { bling_product_id: '777', bling_code: 'NW-999', bling_name: 'Produto NW-999', product: ctx.helmet }),
    'vincular',
  )
  const after = await importNow()
  assert.equal(after.imported, 1)
  assert.equal((await orders('aguardando_vinculo')).length, 0)
})

test('pedido cancelado no Bling cancela a venda e devolve o estoque', async () => {
  fake.orders.get(9001).situacao = { id: 12, valor: 2 }
  const sum = await importNow()
  assert.equal(sum.canceled, 1)
  const [sale] = await list('sales', "external_number = '2000015952362833'")
  assert.equal(sale.status, 'cancelada')
  assert.match(sale.cancellation_reason, /Pedido cancelado no Mercado Livre/)
  assert.equal(await stockOf(ctx.bike, ctx.cj), 3)
  assert.equal((await importNow()).canceled, 0, 'cancela uma vez só')
  assert.equal(await stockOf(ctx.bike, ctx.cj), 3)
})

test('venda de marketplace não emite NF pelo sistema nem muda pela API', async () => {
  const [sale] = await list('sales', "external_number = '2000015000000002'")
  const nf = await req('POST', `/backend/v1/sales/${sale.id}/nfe`)
  assert.equal(nf.status, 400, nf.text)
  assert.match(nf.json.message, /nota fiscal sai pelo Bling/)
  for (const body of [{ channel: '' }, { marketplace_fee: 0 }, { external_number: 'x' }]) {
    assert.equal((await req('PATCH', `/api/collections/sales/records/${sale.id}`, body)).status, 403, JSON.stringify(body))
  }
})

test('estoque para o Bling: só quando ligado, como balanço, e só o que mudou', async () => {
  fake.stock.set(16666906267, 7)
  const cmp = await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/stock`)
  const bike = cmp.json.items.find((i) => i.bling_product_id === '16666906267')
  assert.equal(bike.system_qty, 3)
  assert.equal(bike.bling_qty, 7)
  assert.equal((await req('POST', `/backend/v1/marketplaces/channels/${ctx.channel}/stock`)).status, 400, 'desligado')
  assert.equal(fake.pushes.length, 0)

  ok(
    await req('POST', '/backend/v1/marketplaces/channels', {
      bling_store_id: String(ML), name: 'Mercado Livre', kind: 'mercado_livre', import_from: '2026-11-01',
      active: true, stock_store: ctx.cj, seller: ctx.adminId, sync_stock: true, bling_deposit_id: String(DEPOSIT),
    }),
    'ligar estoque',
  )
  const push = await req('POST', `/backend/v1/marketplaces/channels/${ctx.channel}/stock`)
  assert.equal(push.status, 200, push.text)
  assert.equal(push.json.sent, 3, "os 3 vínculos (2 automáticos e 1 à mão)")
  assert.deepEqual(
    fake.pushes.find((p) => p.produto.id === 16666906267),
    { produto: { id: 16666906267 }, deposito: { id: DEPOSIT }, operacao: 'B', quantidade: 3, observacoes: 'Saldo da loja no sistema de gestão New Way' },
  )
  assert.equal(fake.stock.get(16666906267), 3)

  // Rotina: só manda o que mudou desde o último envio.
  assert.equal((await importNow()).imported, 0)
  const before = fake.pushes.length
  ok(await req('PATCH', `/api/collections/stock_items/records/${(await list('stock_items', `product = '${ctx.bike}' && store = '${ctx.cj}'`))[0].id}`, { quantity: 5 }), 'ajuste de estoque')
  const cmp2 = await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/stock`)
  assert.equal(cmp2.json.items.find((i) => i.bling_product_id === '16666906267').system_qty, 5)
  assert.equal(fake.pushes.length, before)
})

test('permissões do Bling conferidas uma a uma, com registro na auditoria', async () => {
  const res = await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/check`)
  assert.equal(res.status, 200, res.text)
  assert.deepEqual(
    res.json.items.map((c) => [c.name, c.ok]),
    [
      ['Pedidos de venda', true],
      ['Canais de venda', true],
      ['Depósitos', true],
      ['Estoques', true],
      ['Anúncios', true],
    ],
  )
  const logs = await list('audit_logs', "entity = 'sales_channels'")
  assert.ok(logs.some((l) => /^Permissões do Bling conferidas: Pedidos de venda ok/.test(l.reason)))
  assert.equal((await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/check`, undefined, ctx.seller)).status, 403)
})

test('painel dos anúncios: lê do Bling, liga ao produto e mostra o estoque da loja', async () => {
  const refresh = await req('POST', `/backend/v1/marketplaces/channels/${ctx.channel}/listings`)
  assert.equal(refresh.status, 200, refresh.text)
  assert.equal(refresh.json.count, 3)
  assert.ok(fake.listingCalls.every((c) => !c.tipoIntegracao || (c.tipoIntegracao === 'MercadoLivre' && c.idLoja === String(ML))))
  const items = (await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/listings`)).json.items
  const byCode = Object.fromEntries(items.map((i) => [i.listing_code, i]))
  assert.equal(byCode.MLB5011.status, 'publicado')
  assert.equal(byCode.MLB5011.product, ctx.bike)
  assert.equal(byCode.MLB5011.stock, 5)
  assert.equal(byCode.MLB5011.price, 8458)
  assert.equal(byCode.MLB5022.status, 'pausado')
  assert.equal(byCode.MLB5022.product, ctx.helmet)
  assert.equal(byCode.MLB5033.status, 'rascunho')
  assert.equal(byCode.MLB5033.product, '')
  assert.equal(byCode.MLB5033.stock, null)
  ctx.listing = byCode.MLB5011.id
})

test('pausar e publicar passam pelo Bling; apagado no Bling sai do painel', async () => {
  const pause = await req('POST', `/backend/v1/marketplaces/listings/${ctx.listing}/pausar`)
  assert.equal(pause.status, 200, pause.text)
  assert.equal(pause.json.status, 'pausado')
  const call = fake.listingCalls.find((c) => c.path === '/api/anuncios/501/pausar')
  assert.equal(call.method, 'POST')
  assert.equal(call.tipoIntegracao, 'MercadoLivre')
  assert.equal(call.idLoja, String(ML))
  assert.equal(fake.listings.get(501).situacao, 4)
  assert.equal((await req('POST', `/backend/v1/marketplaces/listings/${ctx.listing}/publicar`)).json.status, 'publicado')
  assert.equal((await req('POST', `/backend/v1/marketplaces/listings/${ctx.listing}/apagar`)).status, 404)
  assert.equal((await req('POST', `/backend/v1/marketplaces/listings/${ctx.listing}/pausar`, undefined, ctx.seller)).status, 403)
  const logs = await list('audit_logs', "entity = 'marketplace_listings'")
  assert.deepEqual(logs.map((l) => l.reason).sort(), [
    'Anúncio MLB5011 pausado (Bicicleta Elétrica Navee WDB04 1000W)',
    'Anúncio MLB5011 publicado (Bicicleta Elétrica Navee WDB04 1000W)',
  ])

  fake.listings.delete(503)
  ok(await req('POST', `/backend/v1/marketplaces/channels/${ctx.channel}/listings`), 'reler')
  const codes = (await req('GET', `/backend/v1/marketplaces/channels/${ctx.channel}/listings`)).json.items.map((i) => i.listing_code)
  assert.deepEqual(codes.sort(), ['MLB5011', 'MLB5022'])
})

test('canal da Amazon: anúncios só pelas telas do Bling', async () => {
  const amazon = await req('POST', '/backend/v1/marketplaces/channels', {
    bling_store_id: '777000', name: 'Amazon', kind: 'amazon', import_from: '2026-11-01', active: false,
  })
  ok(amazon, 'canal amazon')
  const res = await req('POST', `/backend/v1/marketplaces/channels/${amazon.json.id}/listings`)
  assert.equal(res.status, 400)
  assert.match(res.json.message, /só deixa ver e mexer nos anúncios do Mercado Livre/)
})

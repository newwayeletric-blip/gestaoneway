// PNR-01/02/03: painel da rede. O admin da rede vê as vendas e o desempenho
// das franquias (e das lojas próprias) por uma rota do servidor, sem dados
// pessoais de clientes nem custos (R.2, ESC-07); ninguém mais lê essa rota.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

let pb
let api
const ctx = {}

const PASSWORD = 'SenhaForte!2026'
const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)
const denied = (res, msg) =>
  assert.ok(res.status >= 400 && res.status < 500, `${msg}: esperado 4xx, veio ${res.status} ${res.text}`)

async function login(email) {
  const res = await api('POST', '/api/collections/users/auth-with-password', {
    body: { identity: email, password: PASSWORD },
  })
  ok(res, `login ${email}`)
  return { token: res.json.token, id: res.json.record.id }
}

const submit = (token, body) =>
  api('POST', '/backend/v1/sales', { token, body: { idempotency_key: randomUUID(), ...body } })
const performance = (token, month) =>
  api('GET', '/backend/v1/network/performance' + (month ? `?month=${month}` : ''), { token })
const brMonth = (deltaMonths = 0) => {
  const now = new Date(Date.now() - 3 * 3600000)
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + deltaMonths, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)

  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono New Way', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = { token: setup.json.token, id: setup.json.record.id }
  ctx.ownOrg = setup.json.record.org
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })).json.items
  ctx.jockey = stores.find((s) => s.slug === 'jockey-plaza').id

  // Franquia com duas lojas e o proprietário.
  const created = await api('POST', '/backend/v1/network/franchises', {
    token: ctx.admin.token,
    body: {
      organization: { name: 'Silva Mobilidade', region: 'Curitiba' },
      legal_entity: { razao_social: 'Silva Mobilidade Ltda', cnpj: '11.222.333/0001-81' },
      stores: [{ name: 'Loja Batel' }, { name: 'Loja Mueller' }],
      owner: { name: 'Ana Silva', email: 'ana@silva.dev', password: PASSWORD },
    },
  })
  assert.equal(created.status, 201, created.text)
  ctx.silva = created.json.organization
  ctx.owner = await login('ana@silva.dev')
  const silvaStores = (await api('GET', '/api/collections/stores/records', { token: ctx.owner.token })).json.items
  ctx.batel = silvaStores.find((s) => s.name === 'Loja Batel').id
  ctx.mueller = silvaStores.find((s) => s.name === 'Loja Mueller').id

  ok(
    await api('POST', '/api/collections/users/records', {
      token: ctx.owner.token,
      body: {
        email: 'vendedor@silva.dev',
        name: 'Bruno Vendedor',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        profile: 'vendedor',
        stores: [ctx.batel],
      },
    }),
    'vendedor da franquia',
  )
  ctx.seller = await login('vendedor@silva.dev')

  const product = async (token, body) => {
    const res = await api('POST', '/api/collections/products/records', { token, body: { status: 'ativo', ...body } })
    ok(res, `produto ${body.sku}`)
    return res.json.id
  }
  ctx.scooter = await product(ctx.owner.token, { name: 'Patinete Silva', sku: 'SV-P1', sale_price: 1000, cost_price: 600 })
  ctx.helmet = await product(ctx.owner.token, { name: 'Capacete Silva', sku: 'SV-C1', sale_price: 200, cost_price: 90 })
  await product(ctx.owner.token, { name: 'Produto parado', sku: 'SV-X1', sale_price: 50, status: 'inativo' })
  ctx.nwScooter = await product(ctx.admin.token, { name: 'Patinete NW', sku: 'NW-P1', sale_price: 3000, cost_price: 2000 })
  for (const [token, p, store, quantity] of [
    [ctx.owner.token, ctx.scooter, ctx.batel, 5],
    [ctx.owner.token, ctx.helmet, ctx.batel, 4],
    [ctx.owner.token, ctx.helmet, ctx.mueller, 2],
    [ctx.admin.token, ctx.nwScooter, ctx.jockey, 2],
  ]) {
    ok(await api('POST', '/api/collections/stock_items/records', { token, body: { product: p, store, quantity } }), 'estoque')
  }

  const customer = async (token, name) =>
    (await api('POST', '/api/collections/customers/records', { token, body: { name, phone: '+5541988887777' } })).json.id
  ctx.silvaCustomer = await customer(ctx.owner.token, 'Cliente Sigiloso da Silva')
  ctx.nwCustomer = await customer(ctx.admin.token, 'Cliente New Way')

  // Batel: 2 vendas confirmadas, 1 cancelada e 1 do vendedor esperando
  // aprovação. Mueller: 1 venda. A venda do administrador é enviada e
  // aprovada em seguida, como faz a tela Nova venda.
  const sale = async (token, store, cust, items) => {
    const total = items.reduce((sum, it) => sum + it.price * it.quantity - (it.discount || 0), 0)
    const res = await submit(token, {
      store,
      customer: cust,
      items: items.map((it) => ({ product: it.product, quantity: it.quantity, discount: it.discount || 0 })),
      payments: [{ method: 'pix', amount: total }],
    })
    ok(res, 'venda')
    if (token !== ctx.seller.token) {
      ok(await api('POST', `/backend/v1/sales/${res.json.id}/approve`, { token, body: {} }), 'aprovar')
    }
    return res.json.id
  }
  ctx.sale1 = await sale(ctx.owner.token, ctx.batel, ctx.silvaCustomer, [
    { product: ctx.scooter, price: 1000, quantity: 2, discount: 50 },
  ])
  ctx.sale2 = await sale(ctx.owner.token, ctx.batel, ctx.silvaCustomer, [{ product: ctx.helmet, price: 200, quantity: 1 }])
  ctx.sale3 = await sale(ctx.owner.token, ctx.mueller, ctx.silvaCustomer, [{ product: ctx.helmet, price: 200, quantity: 1 }])
  ctx.canceled = await sale(ctx.owner.token, ctx.batel, ctx.silvaCustomer, [{ product: ctx.helmet, price: 200, quantity: 1 }])
  ok(
    await api('POST', `/backend/v1/sales/${ctx.canceled}/cancel`, {
      token: ctx.owner.token,
      body: { reason: 'Cliente desistiu da compra' },
    }),
    'cancelar',
  )
  ctx.pending = await sale(ctx.seller.token, ctx.batel, ctx.silvaCustomer, [{ product: ctx.scooter, price: 1000, quantity: 1 }])
  ctx.nwSale = await sale(ctx.admin.token, ctx.jockey, ctx.nwCustomer, [{ product: ctx.nwScooter, price: 3000, quantity: 1 }])
})

after(async () => {
  if (pb) await pb.stop()
})

describe('Quem vê o painel da rede', () => {
  test('só o admin da rede; proprietário, vendedor e visitante são barrados', async () => {
    denied(await performance(ctx.owner.token), 'proprietário da franquia')
    denied(await performance(ctx.seller.token), 'vendedor')
    denied(await performance(undefined), 'sem login')
    ok(await performance(ctx.admin.token), 'admin da rede')
  })

  test('mês inválido ou futuro é recusado', async () => {
    assert.equal((await performance(ctx.admin.token, 'novembro')).status, 400)
    assert.equal((await performance(ctx.admin.token, '2026-13')).status, 400)
    assert.equal((await performance(ctx.admin.token, brMonth(1))).status, 400)
  })
})

describe('Desempenho do mês', () => {
  test('lista as lojas próprias e as franquias, sem a organização da rede', async () => {
    const res = await performance(ctx.admin.token)
    ok(res, 'painel')
    assert.equal(res.json.month, brMonth())
    assert.equal(res.json.current, true)
    assert.deepEqual(
      res.json.organizations.map((o) => [o.name, o.type]),
      [
        ['New Way Eletric', 'propria'],
        ['Silva Mobilidade', 'franquia'],
      ],
    )
  })

  test('franquia: faturamento, vendas, ticket, itens, descontos, cancelamentos e pendências', async () => {
    const silva = (await performance(ctx.admin.token)).json.organizations.find((o) => o.id === ctx.silva)
    assert.deepEqual(silva.totals, {
      revenue: 2350,
      sales: 3,
      ticket: 783.33,
      items: 4,
      discounts: 50,
      canceled: 1,
      canceled_value: 200,
      returned: 0,
      rejected: 0,
      pending: 1,
      prev_revenue: 0,
      prev_sales: 0,
    })
    const batel = silva.stores.find((s) => s.id === ctx.batel)
    const mueller = silva.stores.find((s) => s.id === ctx.mueller)
    assert.equal(batel.totals.revenue, 2150)
    assert.equal(batel.totals.sales, 2)
    assert.equal(batel.totals.pending, 1)
    assert.equal(mueller.totals.revenue, 200)
    assert.equal(mueller.totals.ticket, 200)
    assert.ok(batel.last_sale_at && silva.last_sale_at, 'data da última venda')
  })

  test('as lojas próprias aparecem separadas da franquia', async () => {
    const own = (await performance(ctx.admin.token)).json.organizations.find((o) => o.id === ctx.ownOrg)
    assert.equal(own.totals.revenue, 3000)
    assert.equal(own.totals.sales, 1)
    assert.equal(own.stores.find((s) => s.id === ctx.jockey).totals.revenue, 3000)
  })

  test('estoque, produtos ativos e usuários da franquia', async () => {
    const silva = (await performance(ctx.admin.token)).json.organizations.find((o) => o.id === ctx.silva)
    assert.equal(silva.active_products, 2, 'o produto inativo não conta')
    assert.equal(silva.users, 2, 'proprietário e vendedor')
    // Batel: 5 patinetes - 2 vendidos - 1 reservado (pendente) = 2; capacetes 4 - 1 = 3
    // (a venda cancelada devolve). Mueller: 2 - 1 = 1.
    const batel = silva.stores.find((s) => s.id === ctx.batel)
    assert.deepEqual(batel.stock, { units: 5, products: 2, value: 2600 })
    assert.deepEqual(silva.stock, { units: 6, products: 2, value: 2800 })
  })

  test('últimos 6 meses, produtos mais vendidos e últimas vendas', async () => {
    const silva = (await performance(ctx.admin.token)).json.organizations.find((o) => o.id === ctx.silva)
    assert.equal(silva.history.length, 6)
    assert.deepEqual(silva.history[5], { month: brMonth(), revenue: 2350, sales: 3 })
    assert.deepEqual(silva.history[4], { month: brMonth(-1), revenue: 0, sales: 0 })

    assert.deepEqual(
      silva.top_products.map((p) => [p.sku, p.quantity, p.revenue]),
      [
        ['SV-P1', 2, 1950],
        ['SV-C1', 2, 400],
      ],
    )

    assert.equal(silva.recent_sales.length, 5, 'confirmadas, cancelada e pendente; sem rascunho')
    const pending = silva.recent_sales.find((s) => s.id === ctx.pending)
    assert.equal(pending.status, 'aguardando_aprovacao')
    assert.equal(pending.seller, 'Bruno Vendedor')
    assert.equal(pending.store, 'Loja Batel')
    assert.equal(pending.items, 1)
    assert.equal(pending.total, 1000)
  })

  test('nenhum dado pessoal de cliente nem custo sai na resposta', async () => {
    const res = await performance(ctx.admin.token)
    assert.ok(!res.text.includes('Cliente Sigiloso'), 'nome do cliente')
    assert.ok(!res.text.includes('988887777'), 'telefone do cliente')
    assert.ok(!res.text.includes(ctx.silvaCustomer), 'id do cliente')
    assert.ok(!/cost|custo|margin|margem/i.test(res.text), 'custo ou margem')
    for (const s of res.json.organizations.flatMap((o) => o.recent_sales)) {
      assert.ok(!('customer' in s), 'venda sem o campo cliente')
    }
  })

  test('mês anterior: sem vendas, comparado com o mês inteiro antes dele', async () => {
    const res = await performance(ctx.admin.token, brMonth(-1))
    ok(res, 'mês anterior')
    assert.equal(res.json.current, false)
    assert.equal(res.json.compare_until_day, 0)
    const silva = res.json.organizations.find((o) => o.id === ctx.silva)
    assert.equal(silva.totals.revenue, 0)
    assert.equal(silva.totals.sales, 0)
    assert.equal(silva.totals.pending, 1, 'pendências são a situação de agora')
    assert.equal(silva.recent_sales.length, 0)
    assert.equal(silva.top_products.length, 0)
  })
})

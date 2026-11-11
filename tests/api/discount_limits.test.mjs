// Limite de desconto (dono, 11/11/2026): geral da organização (padrão 5%) e,
// se o admin quiser, um próprio em cada produto, que vale no lugar do geral.
// Acima do limite a venda vai para o admin; o gerente não aprova desconto
// acima do limite de ninguém.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

const PASSWORD = 'SenhaForte!2026'
let pb
let api
const ctx = {}

const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)
// Itens de R$ 1000; o desconto vem em reais.
const sell = (token, lines) =>
  api('POST', '/backend/v1/sales', {
    token,
    body: {
      idempotency_key: randomUUID(),
      store: ctx.jp,
      customer: ctx.customer,
      items: lines.map(([product, discount]) => ({ product, quantity: 1, discount })),
      payments: [{ method: 'pix', amount: lines.reduce((s, [, d]) => s + 1000 - d, 0) }],
      discount_reason: 'Motivo do desconto',
    },
  })
const saleOf = async (res) => {
  assert.equal(res.status, 201, res.text)
  return (await api('GET', `/api/collections/sales/records/${res.json.id}`, { token: ctx.admin })).json
}

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = setup.json.token
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin })).json.items
  ctx.jp = stores.find((s) => s.slug === 'jockey-plaza').id
  const user = async (email, profile) => {
    ok(
      await api('POST', '/api/collections/users/records', {
        token: ctx.admin,
        body: { email, name: email, password: PASSWORD, passwordConfirm: PASSWORD, profile, stores: [ctx.jp] },
      }),
      email,
    )
    return (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: email, password: PASSWORD } })).json.token
  }
  ctx.seller = await user('vendedor@newway.dev', 'vendedor')
  ctx.manager = await user('gerente@newway.dev', 'gerente')
  const product = async (sku, extra) =>
    (
      await api('POST', '/api/collections/products/records', {
        token: ctx.admin,
        body: { status: 'ativo', name: sku, sku, sale_price: 1000, cost_price: 500, ...extra },
      })
    ).json.id
  ctx.own10 = await product('NW-LIMITE-10', { discount_limit_custom: true, discount_limit_pct: 10 })
  ctx.own0 = await product('NW-SEM-DESCONTO', { discount_limit_custom: true, discount_limit_pct: 0 })
  ctx.general = await product('NW-GERAL', {})
  for (const p of [ctx.own10, ctx.own0, ctx.general]) {
    ok(await api('POST', '/api/collections/stock_items/records', { token: ctx.admin, body: { product: p, store: ctx.jp, quantity: 20 } }), 'estoque')
  }
  ctx.customer = (await api('POST', '/api/collections/customers/records', { token: ctx.admin, body: { name: 'Cliente', phone: '+5541999990000' } })).json.id
})

after(async () => {
  if (pb) await pb.stop()
})

test('o limite próprio do produto vale no lugar do geral', async () => {
  assert.equal((await saleOf(await sell(ctx.seller, [[ctx.own10, 80]]))).discount_over_limit, false, '8% num produto de 10%')
  const general = await saleOf(await sell(ctx.seller, [[ctx.general, 80]]))
  assert.equal(general.discount_over_limit, true, '8% num produto do geral (5%)')
  assert.equal(general.discount_limit_pct, 5)
  const zero = await saleOf(await sell(ctx.seller, [[ctx.own0, 1]]))
  assert.equal(zero.discount_over_limit, true, 'produto com limite 0% não aceita desconto sem o admin')
  assert.equal(zero.discount_limit_pct, 0)
})

test('com vários itens, vale cada um contra o seu limite', async () => {
  const mixed = await saleOf(await sell(ctx.seller, [[ctx.own10, 120], [ctx.general, 30]]))
  assert.equal(mixed.discount_over_limit, true)
  assert.equal(mixed.discount_limit_pct, 10, 'o limite ultrapassado é o do produto de 10%')
  const fine = await saleOf(await sell(ctx.seller, [[ctx.own10, 100], [ctx.general, 50]]))
  assert.equal(fine.discount_over_limit, false, '10% e 5%, cada um no seu limite')
})

test('o admin muda o limite geral nas Configurações', async () => {
  const [row] = (
    await api('GET', `/api/collections/settings/records?filter=${encodeURIComponent("key = 'max_discount_general'")}`, { token: ctx.admin })
  ).json.items
  assert.equal(row.value, '5')
  assert.ok((await api('PATCH', `/api/collections/settings/records/${row.id}`, { token: ctx.seller, body: { value: '50' } })).status >= 400, 'vendedor não muda')
  ok(await api('PATCH', `/api/collections/settings/records/${row.id}`, { token: ctx.admin, body: { value: '8' } }), 'admin muda para 8%')
  assert.equal((await saleOf(await sell(ctx.seller, [[ctx.general, 70]]))).discount_over_limit, false, '7% com limite geral de 8%')
})

test('acima do limite só o admin aprova, mesmo a venda do vendedor da loja do gerente', async () => {
  const over = await saleOf(await sell(ctx.seller, [[ctx.general, 200]]))
  assert.equal(over.discount_over_limit, true)
  const byManager = await api('POST', `/backend/v1/sales/${over.id}/approve`, { token: ctx.manager, body: {} })
  assert.equal(byManager.status, 403, byManager.text)
  assert.match(byManager.json.message, /quem aprova é o administrador/)
  ok(await api('POST', `/backend/v1/sales/${over.id}/approve`, { token: ctx.admin, body: {} }), 'admin aprova')

  const inside = await saleOf(await sell(ctx.seller, [[ctx.general, 10]]))
  ok(await api('POST', `/backend/v1/sales/${inside.id}/approve`, { token: ctx.manager, body: {} }), 'gerente aprova dentro do limite')
})

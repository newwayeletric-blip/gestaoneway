// Perfil gerente (dono, 11/11/2026): nas lojas dele vê as vendas de todos,
// aprova e recusa (não cancela), corrige e consulta o chassi e anexa a NF;
// a venda dele mesmo com desconto acima do limite fica para o admin; fora das
// lojas dele não vê nada; custo continua escondido.
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
const sale = (token, store, serial, extra = {}) =>
  api('POST', '/backend/v1/sales', {
    token,
    body: {
      idempotency_key: randomUUID(),
      store,
      customer: ctx.customer,
      items: [{ product: ctx.scooter, quantity: 1, discount: extra.discount || 0, serial_number: serial }],
      payments: [{ method: 'pix', amount: 1000 - (extra.discount || 0) }],
      discount_reason: extra.reason || '',
    },
  })
const act = (token, id, action, body = {}) => api('POST', `/backend/v1/sales/${id}/${action}`, { token, body })
const listIds = async (token, collection, filter = '') =>
  (
    await api('GET', `/api/collections/${collection}/records?perPage=200${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`, {
      token,
    })
  ).json.items

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
  ctx.cj = stores.find((s) => s.slug === 'cajuru').id

  const user = async (email, profile, store) => {
    ok(
      await api('POST', '/api/collections/users/records', {
        token: ctx.admin,
        body: { email, name: email, password: PASSWORD, passwordConfirm: PASSWORD, profile, stores: [store] },
      }),
      `usuário ${email}`,
    )
    const login = await api('POST', '/api/collections/users/auth-with-password', { body: { identity: email, password: PASSWORD } })
    return { token: login.json.token, id: login.json.record.id }
  }
  ctx.manager = await user('gerente.jp@newway.dev', 'gerente', ctx.jp)
  ctx.sellerJP = await user('vendedor.jp@newway.dev', 'vendedor', ctx.jp)
  ctx.sellerCJ = await user('vendedor.cj@newway.dev', 'vendedor', ctx.cj)

  ok(await api('POST', '/api/collections/settings/records', { token: ctx.admin, body: { key: 'max_discount_pix', value: '5' } }), 'limite')
  ctx.scooter = (
    await api('POST', '/api/collections/products/records', {
      token: ctx.admin,
      body: { status: 'ativo', name: 'Patinete G4 Max', sku: 'NW-G4', sale_price: 1000, cost_price: 600, track_serial: true },
    })
  ).json.id
  for (const store of [ctx.jp, ctx.cj]) {
    ok(await api('POST', '/api/collections/stock_items/records', { token: ctx.admin, body: { product: ctx.scooter, store, quantity: 10 } }), 'estoque')
  }
  ctx.customer = (
    await api('POST', '/api/collections/customers/records', { token: ctx.admin, body: { name: 'Cliente', phone: '+5541999990000' } })
  ).json.id

  ctx.saleJP = (await sale(ctx.sellerJP.token, ctx.jp, 'JP0001')).json.id
  ctx.saleCJ = (await sale(ctx.sellerCJ.token, ctx.cj, 'CJ0001')).json.id
  assert.ok(ctx.saleJP && ctx.saleCJ, 'vendas criadas')
})

after(async () => {
  if (pb) await pb.stop()
})

test('o gerente vê as vendas das lojas dele, de todos os vendedores, e não as de outra loja', async () => {
  const ids = (await listIds(ctx.manager.token, 'sales')).map((s) => s.id)
  assert.ok(ids.includes(ctx.saleJP))
  assert.ok(!ids.includes(ctx.saleCJ))
  assert.equal((await api('GET', `/api/collections/sales/records/${ctx.saleCJ}`, { token: ctx.manager.token })).status, 404)
  const items = await listIds(ctx.manager.token, 'sale_items', `sale = '${ctx.saleJP}'`)
  assert.equal(items.length, 1)
  assert.equal(items[0].cost_price, undefined, 'custo escondido do gerente')
  assert.equal((await listIds(ctx.manager.token, 'sale_items', `sale = '${ctx.saleCJ}'`)).length, 0)
})

test('o gerente corrige o chassi e consulta só as lojas dele', async () => {
  const [item] = await listIds(ctx.manager.token, 'sale_items', `sale = '${ctx.saleJP}'`)
  ok(
    await api('POST', `/backend/v1/sales/${ctx.saleJP}/serials`, {
      token: ctx.manager.token,
      body: { items: [{ id: item.id, serial_number: 'JP0002' }] },
    }),
    'corrigir chassi da loja dele',
  )
  const [itemCJ] = await listIds(ctx.admin, 'sale_items', `sale = '${ctx.saleCJ}'`)
  const other = await api('POST', `/backend/v1/sales/${ctx.saleCJ}/serials`, {
    token: ctx.manager.token,
    body: { items: [{ id: itemCJ.id, serial_number: 'CJ9999' }] },
  })
  assert.equal(other.status, 404, other.text)
  const found = await api('GET', '/backend/v1/serials?q=000', { token: ctx.manager.token })
  assert.equal(found.status, 200, found.text)
  assert.deepEqual(found.json.items.map((i) => i.serial_number), ['JP0002'])
})

test('o gerente aprova e recusa nas lojas dele, mas não cancela', async () => {
  assert.equal((await act(ctx.sellerJP.token, ctx.saleJP, 'approve')).status, 403, 'vendedor não aprova')
  assert.equal((await act(ctx.manager.token, ctx.saleCJ, 'approve')).status, 404)
  assert.equal((await act(ctx.manager.token, ctx.saleCJ, 'reject', { reason: 'Outra loja' })).status, 404)
  const res = await act(ctx.manager.token, ctx.saleJP, 'approve')
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.status, 'confirmada')
  const audit = await listIds(ctx.admin, 'audit_logs', `record_id = '${ctx.saleJP}'`)
  assert.ok(audit.some((a) => /aprovada pelo gerente da loja/.test(a.reason)))
  const cancel = await act(ctx.manager.token, ctx.saleJP, 'cancel', { reason: 'Desistiu da compra' })
  assert.equal(cancel.status, 403, cancel.text)

  const other = (await sale(ctx.sellerJP.token, ctx.jp, 'JP0003')).json.id
  ok(await act(ctx.manager.token, other, 'reject', { reason: 'Cliente desistiu' }), 'recusar na loja dele')
})

test('o gerente anexa a NF de venda confirmada da loja dele', async () => {
  const form = (saleId) => {
    const f = new FormData()
    f.append('sale', saleId)
    f.append('label', 'NF-e')
    f.append('doc_type', 'nota_fiscal')
    f.append('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), 'nf.pdf')
    return f
  }
  ok(await api('POST', '/api/collections/sale_documents/records', { token: ctx.manager.token, form: form(ctx.saleJP) }), 'NF da loja dele')
  const other = await api('POST', '/api/collections/sale_documents/records', { token: ctx.manager.token, form: form(ctx.saleCJ) })
  assert.ok(other.status >= 400, `NF de outra loja: ${other.status}`)
})

test('venda do próprio gerente: dentro do limite ele aprova; acima, só o admin', async () => {
  const inside = (await sale(ctx.manager.token, ctx.jp, 'JP0004')).json.id
  ok(await act(ctx.manager.token, inside, 'approve'), 'dentro do limite')

  const noReason = await sale(ctx.manager.token, ctx.jp, 'JP0005', { discount: 100 })
  assert.equal(noReason.status, 400, 'acima do limite pede o motivo também ao gerente')
  const over = (await sale(ctx.manager.token, ctx.jp, 'JP0005', { discount: 100, reason: 'Cliente antigo da loja' })).json.id
  const self = await act(ctx.manager.token, over, 'approve')
  assert.equal(self.status, 403, self.text)
  assert.match(self.json.message, /quem aprova é o administrador/)
  ok(await act(ctx.admin, over, 'approve'), 'o admin aprova')
})

test('o gerente não lança estoque', async () => {
  const res = await api('POST', '/backend/v1/stock/manual', {
    token: ctx.manager.token,
    body: { store: ctx.jp, product: ctx.scooter, type: 'entrada', quantity: 1 },
  })
  assert.equal(res.status, 403, res.text)
})

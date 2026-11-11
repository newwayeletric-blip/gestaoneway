// Número de série na venda (dono, 11/11/2026): obrigatório e uma unidade por
// linha em produto com controle de série; não se repete nem fica em duas
// vendas ativas; o admin consulta o histórico e corrige a série antes da NF.
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
const submit = (token, items, total) =>
  api('POST', '/backend/v1/sales', {
    token,
    body: {
      idempotency_key: randomUUID(),
      store: ctx.jockey,
      customer: ctx.customer,
      items,
      payments: [{ method: 'pix', amount: total }],
    },
  })
const scooter = (serial) => ({ product: ctx.scooter, quantity: 1, discount: 0, serial_number: serial })
const items = async (sale) =>
  (
    await api('GET', `/api/collections/sale_items/records?filter=${encodeURIComponent(`sale = '${sale}'`)}`, {
      token: ctx.admin.token,
    })
  ).json.items
const fix = (token, sale, list) => api('POST', `/backend/v1/sales/${sale}/serials`, { token, body: { items: list } })

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = { token: setup.json.token }
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })).json.items
  ctx.jockey = stores.find((s) => s.slug === 'jockey-plaza').id

  ok(
    await api('POST', '/api/collections/users/records', {
      token: ctx.admin.token,
      body: {
        email: 'vendedor@newway.dev',
        name: 'Vendedor',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        profile: 'vendedor',
        stores: [ctx.jockey],
      },
    }),
    'vendedor',
  )
  const login = await api('POST', '/api/collections/users/auth-with-password', {
    body: { identity: 'vendedor@newway.dev', password: PASSWORD },
  })
  ctx.seller = { token: login.json.token }

  const product = async (body) =>
    (await api('POST', '/api/collections/products/records', { token: ctx.admin.token, body: { status: 'ativo', ...body } }))
      .json.id
  ctx.scooter = await product({ name: 'Patinete G4 Max', sku: 'NW-G4MAX', sale_price: 1000, cost_price: 600, track_serial: true })
  ctx.helmet = await product({ name: 'Capacete', sku: 'NW-CAP', sale_price: 100, cost_price: 50, track_serial: false })
  for (const [p, quantity] of [
    [ctx.scooter, 5],
    [ctx.helmet, 5],
  ]) {
    ok(await api('POST', '/api/collections/stock_items/records', { token: ctx.admin.token, body: { product: p, store: ctx.jockey, quantity } }), 'estoque')
  }
  ctx.customer = (
    await api('POST', '/api/collections/customers/records', {
      token: ctx.admin.token,
      body: { name: 'Cliente da Série', phone: '+5541999990000' },
    })
  ).json.id
})

after(async () => {
  if (pb) await pb.stop()
})

test('produto com série exige a série e uma unidade por linha', async () => {
  const without = await submit(ctx.seller.token, [scooter('')], 1000)
  assert.equal(without.status, 400, without.text)
  assert.match(without.json.message, /Informe o chassi/)
  const two = await submit(ctx.seller.token, [{ ...scooter('X1'), quantity: 2 }], 2000)
  assert.equal(two.status, 400, two.text)
  assert.match(two.json.message, /uma unidade por linha/)
  const twice = await submit(ctx.seller.token, [scooter('X1'), scooter(' x 1 ')], 2000)
  assert.equal(twice.status, 400, twice.text)
  assert.match(twice.json.message, /aparece duas vezes/)
})

test('venda com série e acessório sem série entra, com a série normalizada', async () => {
  const res = await submit(
    ctx.seller.token,
    [scooter(' ab 123 '), scooter('AB124'), { product: ctx.helmet, quantity: 2, discount: 0 }],
    2200,
  )
  assert.equal(res.status, 201, res.text)
  ctx.sale1 = res.json.id
  ctx.sale1Number = res.json.number
  const got = (await items(ctx.sale1)).map((i) => i.serial_number).sort()
  assert.deepEqual(got, ['', 'AB123', 'AB124'])
})

test('a mesma série não entra em outra venda ativa', async () => {
  const res = await submit(ctx.seller.token, [scooter('ab123')], 1000)
  assert.equal(res.status, 400, res.text)
  assert.match(res.json.message, new RegExp(`já está na venda ${ctx.sale1Number}`))
})

test('histórico: o admin encontra a série com venda e cliente; o vendedor não', async () => {
  const res = await api('GET', '/backend/v1/serials?q=ab12', { token: ctx.admin.token })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.items.length, 2)
  const row = res.json.items.find((i) => i.serial_number === 'AB123')
  assert.equal(row.sale_number, ctx.sale1Number)
  assert.equal(row.customer_name, 'Cliente da Série')
  assert.equal(row.product_name, 'Patinete G4 Max')
  assert.equal(row.has_nf, false)
  assert.equal((await api('GET', '/backend/v1/serials?q=ab12', { token: ctx.seller.token })).status, 403)
  assert.equal((await api('GET', '/backend/v1/serials?q=ab', { token: ctx.admin.token })).status, 400)
})

test('o admin corrige a série antes da NF, com auditoria; o vendedor não', async () => {
  const list = await items(ctx.sale1)
  const item = list.find((i) => i.serial_number === 'AB124')
  const helmet = list.find((i) => i.serial_number === '')
  assert.equal((await fix(ctx.seller.token, ctx.sale1, [{ id: item.id, serial_number: 'AB125' }])).status, 403)
  const empty = await fix(ctx.admin.token, ctx.sale1, [{ id: item.id, serial_number: ' ' }])
  assert.equal(empty.status, 400, empty.text)
  const dup = await fix(ctx.admin.token, ctx.sale1, [{ id: item.id, serial_number: 'ab123' }])
  assert.equal(dup.status, 400, dup.text)

  const res = await fix(ctx.admin.token, ctx.sale1, [
    { id: item.id, serial_number: 'ab 125' },
    { id: helmet.id, serial_number: '' },
  ])
  assert.equal(res.status, 200, res.text)
  const after = (await items(ctx.sale1)).map((i) => i.serial_number).sort()
  assert.deepEqual(after, ['', 'AB123', 'AB125'])
  const audit = await api(
    'GET',
    `/api/collections/audit_logs/records?filter=${encodeURIComponent(`record_id = '${ctx.sale1}' && action = 'alteracao'`)}`,
    { token: ctx.admin.token },
  )
  assert.equal(audit.json.items.length, 1)
  assert.equal(audit.json.items[0].new_values[item.id], 'AB125')
})

test('venda recusada libera a série', async () => {
  ok(await api('POST', `/backend/v1/sales/${ctx.sale1}/reject`, { token: ctx.admin.token, body: { reason: 'Teste de série' } }), 'recusar')
  const res = await submit(ctx.seller.token, [scooter('AB123')], 1000)
  assert.equal(res.status, 201, res.text)
  ctx.sale2 = res.json.id
})

test('depois da NF anexada a série não muda mais', async () => {
  ok(await api('POST', `/backend/v1/sales/${ctx.sale2}/approve`, { token: ctx.admin.token, body: {} }), 'aprovar')
  const form = new FormData()
  form.append('sale', ctx.sale2)
  form.append('label', 'NF-e')
  form.append('doc_type', 'nota_fiscal')
  form.append('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), 'nf.pdf')
  ok(await api('POST', '/api/collections/sale_documents/records', { token: ctx.admin.token, form }), 'anexar NF')
  const [item] = await items(ctx.sale2)
  const res = await fix(ctx.admin.token, ctx.sale2, [{ id: item.id, serial_number: 'ZZ999' }])
  assert.equal(res.status, 400, res.text)
  assert.match(res.json.message, /NF desta venda já foi anexada/)
})

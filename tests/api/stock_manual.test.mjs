// Lançamento manual de estoque (tela Estoque → Entrada / Ajuste): a
// movimentação e o saldo da loja mudam juntos. Antes só a movimentação era
// gravada e o saldo não mudava.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

let pb
let api
const ctx = {}

const PASSWORD = 'SenhaForte!2026'
const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)
const denied = (res, msg) =>
  assert.ok(res.status >= 400 && res.status < 500, `${msg}: esperado 4xx, veio ${res.status} ${res.text}`)

const manual = (token, body) => api('POST', '/backend/v1/stock/manual', { token, body })

async function balance(store) {
  const filter = encodeURIComponent(`store = '${store}' && product = '${ctx.product}'`)
  const res = await api('GET', `/api/collections/stock_items/records?filter=${filter}`, {
    token: ctx.admin.token,
  })
  ok(res, 'saldo')
  assert.ok(res.json.items.length <= 1, 'uma linha de saldo por loja e produto')
  return res.json.items[0]?.quantity ?? null
}

async function movements(store) {
  const filter = encodeURIComponent(`store = '${store}' && product = '${ctx.product}'`)
  const res = await api('GET', `/api/collections/stock_movements/records?sort=created&filter=${filter}`, {
    token: ctx.admin.token,
  })
  ok(res, 'movimentações')
  return res.json.items
}

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)

  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono New Way', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = { token: setup.json.token, id: setup.json.record.id }

  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })).json.items
  ctx.store = stores[0].id

  const product = await api('POST', '/api/collections/products/records', {
    token: ctx.admin.token,
    body: { status: 'ativo', name: 'Patinete X', sku: 'PX', sale_price: 1000, cost_price: 600 },
  })
  ok(product, 'produto')
  ctx.product = product.json.id

  ok(
    await api('POST', '/api/collections/users/records', {
      token: ctx.admin.token,
      body: {
        email: 'vendedor@newway.dev',
        name: 'Vendedor',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        profile: 'vendedor',
        stores: [ctx.store],
      },
    }),
    'vendedor',
  )
  const login = await api('POST', '/api/collections/users/auth-with-password', {
    body: { identity: 'vendedor@newway.dev', password: PASSWORD },
  })
  ok(login, 'login vendedor')
  ctx.seller = { token: login.json.token }
})

after(async () => {
  if (pb) await pb.stop()
})

describe('Entrada / Ajuste manual de estoque', () => {
  test('entrada cria o saldo da loja e soma nas seguintes', async () => {
    const base = { product: ctx.product, store: ctx.store, reason: '' }
    const first = await manual(ctx.admin.token, { ...base, type: 'entrada', quantity: 5 })
    ok(first, 'primeira entrada')
    assert.deepEqual([first.json.previous, first.json.quantity], [0, 5])
    assert.equal(await balance(ctx.store), 5)

    ok(await manual(ctx.admin.token, { ...base, type: 'entrada', quantity: 3 }), 'segunda entrada')
    assert.equal(await balance(ctx.store), 8)

    const movs = await movements(ctx.store)
    assert.deepEqual(
      movs.map((m) => [m.type, m.quantity, m.source_ref, m.user]),
      [
        ['entrada', 5, 'MANUAL-ADMIN', ctx.admin.id],
        ['entrada', 3, 'MANUAL-ADMIN', ctx.admin.id],
      ],
    )
  })

  test('avaria e perda retiram, sem deixar o saldo negativo', async () => {
    const base = { product: ctx.product, store: ctx.store }
    ok(await manual(ctx.admin.token, { ...base, type: 'avaria', quantity: 2, reason: 'Retrovisor quebrado' }), 'avaria')
    assert.equal(await balance(ctx.store), 6)

    const tooMuch = await manual(ctx.admin.token, { ...base, type: 'perda', quantity: 7, reason: 'Extravio' })
    denied(tooMuch, 'perda maior que o saldo')
    assert.equal(await balance(ctx.store), 6, 'saldo intacto')
    assert.equal((await movements(ctx.store)).length, 3, 'nenhuma movimentação gravada')
  })

  test('ajuste define o saldo contado e guarda a diferença com sinal', async () => {
    const base = { product: ctx.product, store: ctx.store, type: 'ajuste', reason: 'Contagem física' }
    const down = await manual(ctx.admin.token, { ...base, quantity: 4 })
    ok(down, 'ajuste para baixo')
    assert.deepEqual([down.json.previous, down.json.quantity], [6, 4])
    assert.equal(await balance(ctx.store), 4)

    ok(await manual(ctx.admin.token, { ...base, quantity: 0 }), 'ajuste zerando')
    assert.equal(await balance(ctx.store), 0)

    ok(await manual(ctx.admin.token, { ...base, quantity: 2 }), 'ajuste para cima')
    const movs = (await movements(ctx.store)).filter((m) => m.type === 'ajuste')
    assert.deepEqual(movs.map((m) => m.quantity), [-2, -4, 2])

    denied(await manual(ctx.admin.token, { ...base, quantity: 2 }), 'ajuste sem diferença')
  })

  test('motivo é obrigatório fora da entrada', async () => {
    for (const type of ['ajuste', 'avaria', 'perda']) {
      const res = await manual(ctx.admin.token, {
        product: ctx.product,
        store: ctx.store,
        type,
        quantity: 1,
        reason: '  ',
      })
      denied(res, `${type} sem motivo`)
    }
    assert.equal(await balance(ctx.store), 2)
  })

  test('quantidade inválida e vendedor são recusados', async () => {
    const base = { product: ctx.product, store: ctx.store, reason: 'x' }
    for (const quantity of [0, -1, 1.5, 'abc']) {
      denied(await manual(ctx.admin.token, { ...base, type: 'entrada', quantity }), `entrada ${quantity}`)
    }
    denied(await manual(ctx.seller.token, { ...base, type: 'entrada', quantity: 10 }), 'vendedor')
    denied(await manual(null, { ...base, type: 'entrada', quantity: 10 }), 'sem login')
    assert.equal(await balance(ctx.store), 2)
  })
})

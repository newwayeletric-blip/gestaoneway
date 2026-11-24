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

// O mesmo modelo comprado por valores diferentes (dono, 24/11/2026): cada
// entrada guarda o custo da compra e o custo do produto vira a média ponderada.
describe('Custo da compra na entrada', () => {
  const product = async () =>
    (await api('GET', `/api/collections/products/records/${ctx.costProduct}`, { token: ctx.admin.token })).json

  before(async () => {
    const created = await api('POST', '/api/collections/products/records', {
      token: ctx.admin.token,
      body: { status: 'ativo', name: 'Navee V25 Pro', sku: 'V25', sale_price: 3000, cost_price: 2000 },
    })
    ok(created, 'produto')
    ctx.costProduct = created.json.id
    const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })).json.items
    ctx.store2 = stores.find((s) => s.id !== ctx.store)?.id
    if (!ctx.store2) {
      const store = await api('POST', '/api/collections/stores/records', {
        token: ctx.admin.token,
        body: { name: 'Shopping', status: 'ativa' },
      })
      ok(store, 'segunda loja')
      ctx.store2 = store.json.id
    }
  })

  test('cada compra guarda o próprio custo e o produto fica com a média de todas as lojas', async () => {
    const first = await manual(ctx.admin.token, {
      product: ctx.costProduct,
      store: ctx.store,
      type: 'entrada',
      quantity: 2,
      unit_cost: 2000,
    })
    ok(first, 'primeira compra')
    assert.deepEqual(first.json.cost, { unit: 2000, previous: 2000, average: 2000, sale_price: 3000 })

    // Outra loja, mais cara: (2 × 2000 + 5 × 2300) / 7 = 2214,29.
    const second = await manual(ctx.admin.token, {
      product: ctx.costProduct,
      store: ctx.store2,
      type: 'entrada',
      quantity: 5,
      unit_cost: '2300',
      reason: 'Fornecedor Navee, NF 123',
    })
    ok(second, 'segunda compra')
    assert.deepEqual(second.json.cost, { unit: 2300, previous: 2000, average: 2214.29, sale_price: 3000 })
    assert.equal((await product()).cost_price, 2214.29)

    const filter = encodeURIComponent(`product = '${ctx.costProduct}'`)
    const movs = (
      await api('GET', `/api/collections/stock_movements/records?sort=created&filter=${filter}`, {
        token: ctx.admin.token,
      })
    ).json.items
    assert.deepEqual(movs.map((m) => [m.quantity, m.unit_cost]), [
      [2, 2000],
      [5, 2300],
    ])
  })

  test('preço de venda muda na entrada; sem custo informado, vale o custo atual', async () => {
    const res = await manual(ctx.admin.token, {
      product: ctx.costProduct,
      store: ctx.store,
      type: 'entrada',
      quantity: 1,
      sale_price: 3200,
    })
    ok(res, 'entrada com preço novo')
    assert.deepEqual(res.json.cost, { unit: 2214.29, previous: 2214.29, average: 2214.29, sale_price: 3200 })
    const p = await product()
    assert.deepEqual([p.cost_price, p.sale_price], [2214.29, 3200])

    const filter = encodeURIComponent(`entity = 'products' && record_id = '${ctx.costProduct}'`)
    const logs = (
      await api('GET', `/api/collections/audit_logs/records?sort=created&filter=${filter}`, {
        token: ctx.admin.token,
      })
    ).json.items
    assert.deepEqual(
      logs.map((l) => [l.previous_values, l.new_values]),
      [
        [{ sale_price: 3000, cost_price: 2000 }, { sale_price: 3000, cost_price: 2214.29 }],
        [{ sale_price: 3000, cost_price: 2214.29 }, { sale_price: 3200, cost_price: 2214.29 }],
      ],
    )
  })

  test('o que está em trânsito entra na média', async () => {
    // 8 un nas lojas + 2 em trânsito; chegam 10 a 2500: (10 × 2214,29 + 10 × 2500) / 20.
    const transfer = await api('POST', '/api/collections/transfers/records', {
      token: ctx.admin.token,
      body: { origin_store: ctx.store, destination_store: ctx.store2, status: 'em_transito', user: ctx.admin.id },
    })
    ok(transfer, 'transferência')
    ok(
      await api('POST', '/api/collections/transfer_items/records', {
        token: ctx.admin.token,
        body: { transfer: transfer.json.id, product: ctx.costProduct, quantity: 2 },
      }),
      'item em trânsito',
    )
    const res = await manual(ctx.admin.token, {
      product: ctx.costProduct,
      store: ctx.store,
      type: 'entrada',
      quantity: 10,
      unit_cost: 2500,
    })
    ok(res, 'entrada')
    assert.equal(res.json.cost.average, 2357.15)
  })

  test('custo e preço inválidos são recusados sem mexer em nada', async () => {
    const base = { product: ctx.costProduct, store: ctx.store, type: 'entrada', quantity: 1 }
    for (const extra of [{ unit_cost: -1 }, { unit_cost: 'abc' }, { sale_price: 0 }, { sale_price: 'x' }]) {
      denied(await manual(ctx.admin.token, { ...base, ...extra }), `entrada ${JSON.stringify(extra)}`)
    }
    const p = await product()
    assert.deepEqual([p.cost_price, p.sale_price], [2357.15, 3200])
  })

  test('ajuste, avaria e perda não mexem no custo', async () => {
    ok(
      await manual(ctx.admin.token, {
        product: ctx.costProduct,
        store: ctx.store,
        type: 'avaria',
        quantity: 1,
        reason: 'Quebrado',
        unit_cost: 1,
        sale_price: 1,
      }),
      'avaria',
    )
    const p = await product()
    assert.deepEqual([p.cost_price, p.sale_price], [2357.15, 3200])
  })

  test('o vendedor não vê o custo das compras nem filtra por ele', async () => {
    const filter = encodeURIComponent(`product = '${ctx.costProduct}'`)
    const res = await api('GET', `/api/collections/stock_movements/records?filter=${filter}`, {
      token: ctx.seller.token,
    })
    ok(res, 'vendedor lista movimentações')
    assert.ok(res.json.items.length > 0, 'vê as movimentações')
    assert.ok(res.json.items.every((m) => !('unit_cost' in m)), 'sem o custo')
    const probe = encodeURIComponent('unit_cost > 2000')
    denied(
      await api('GET', `/api/collections/stock_movements/records?filter=${probe}`, { token: ctx.seller.token }),
      'filtro por custo',
    )
  })
})

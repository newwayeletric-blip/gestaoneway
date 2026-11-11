// Fase 1 (VEN-01..06, D.8 cenários 9 e 10) com a regra do dono: toda venda
// de vendedor espera o administrador antes da NF; o estoque fica reservado
// enquanto ela espera e volta se for recusada.
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
const act = (token, id, action, body = {}) =>
  api('POST', `/backend/v1/sales/${id}/${action}`, { token, body })
const getSale = async (id) => (await api('GET', `/api/collections/sales/records/${id}`, { token: ctx.admin.token })).json
const list = async (collection, filter, token = ctx.admin.token) => {
  const res = await api('GET', `/api/collections/${collection}/records?perPage=200&filter=${encodeURIComponent(filter)}`, { token })
  ok(res, `listar ${collection}`)
  return res.json.items
}
const stockOf = async (product, store = ctx.jockey) =>
  (await list('stock_items', `product = '${product}' && store = '${store}'`))[0].quantity
const pix = (amount) => [{ method: 'pix', amount }]
const nfForm = (sale, docType) => {
  const form = new FormData()
  form.append('sale', sale)
  form.append('label', 'Documento')
  form.append('doc_type', docType)
  form.append('file', new Blob(['%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'], { type: 'application/pdf' }), 'nf.pdf')
  return form
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
  ctx.jockey = stores.find((s) => s.slug === 'jockey-plaza').id
  ctx.cajuru = stores.find((s) => s.slug === 'cajuru').id
  ctx.codes = Object.fromEntries(stores.map((s) => [s.slug, s.code]))

  for (const [email, rate] of [
    ['vendedor.a@newway.dev', 2],
    ['vendedor.b@newway.dev', 0],
  ]) {
    ok(
      await api('POST', '/api/collections/users/records', {
        token: ctx.admin.token,
        body: {
          email,
          name: email,
          password: PASSWORD,
          passwordConfirm: PASSWORD,
          profile: 'vendedor',
          stores: [ctx.jockey],
          cs_available: true,
          default_commission_rate: rate,
        },
      }),
      `vendedor ${email}`,
    )
  }
  ctx.sellerA = await login('vendedor.a@newway.dev')
  ctx.sellerB = await login('vendedor.b@newway.dev')

  // O limite geral de desconto (5%) já vem da migration 0017.
  for (const [key, value] of [['max_installments_cartao_credito', '10']]) {
    ok(await api('POST', '/api/collections/settings/records', { token: ctx.admin.token, body: { key, value } }), key)
  }

  const product = async (body) =>
    (await api('POST', '/api/collections/products/records', { token: ctx.admin.token, body: { status: 'ativo', ...body } })).json.id
  ctx.p1 = await product({ name: 'Patinete X', sku: 'PX', sale_price: 1000, cost_price: 600 })
  ctx.p2 = await product({ name: 'Capacete', sku: 'CAP', sale_price: 200, cost_price: 100, commission_rate: 5 })
  ctx.p3 = await product({ name: 'Patinete Única', sku: 'PU', sale_price: 3000, cost_price: 2000 })
  for (const [p, store, quantity] of [
    [ctx.p1, ctx.jockey, 3],
    [ctx.p2, ctx.jockey, 5],
    [ctx.p3, ctx.jockey, 1],
    [ctx.p1, ctx.cajuru, 1],
  ]) {
    ok(
      await api('POST', '/api/collections/stock_items/records', { token: ctx.admin.token, body: { product: p, store, quantity } }),
      'estoque inicial',
    )
  }
  ctx.customer = (
    await api('POST', '/api/collections/customers/records', {
      token: ctx.admin.token,
      body: { name: 'Cliente Balcão', phone: '+5541999990000' },
    })
  ).json.id
})

after(async () => {
  if (pb) await pb.stop()
})

describe('Envio da venda pelo vendedor', () => {
  test('as lojas próprias ganharam os códigos JP e CJ', () => {
    assert.equal(ctx.codes['jockey-plaza'], 'JP')
    assert.equal(ctx.codes.cajuru, 'CJ')
  })

  test('fica aguardando aprovação, com preço do catálogo, número da loja e estoque reservado', async () => {
    const res = await submit(ctx.sellerA.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [
        { product: ctx.p1, quantity: 1, discount: 0, sale_price: 1 },
        { product: ctx.p2, quantity: 2, discount: 0 },
      ],
      payments: pix(1400),
    })
    assert.equal(res.status, 201, res.text)
    assert.equal(res.json.status, 'aguardando_aprovacao')
    assert.equal(res.json.number, 'JP-000001')
    ctx.saleA1 = res.json.id

    const sale = await getSale(ctx.saleA1)
    assert.equal(sale.total, 1400, 'preço do catálogo, não o enviado')
    assert.equal(sale.seller, ctx.sellerA.id)
    assert.equal(sale.payment_status, 'pendente')
    assert.equal(sale.pending_balance, 0)
    assert.equal(sale.discount_over_limit, false)

    assert.equal(await stockOf(ctx.p1), 2)
    assert.equal(await stockOf(ctx.p2), 3)
    const moves = await list('stock_movements', `source_ref = '${ctx.saleA1}'`)
    assert.deepEqual(moves.map((m) => [m.type, m.quantity]).sort(), [
      ['saida_venda', -1],
      ['saida_venda', -2],
    ])

    const items = await api('GET', `/api/collections/sale_items/records?filter=${encodeURIComponent(`sale = '${ctx.saleA1}'`)}`, {
      token: ctx.sellerA.token,
    })
    assert.equal(items.json.items.length, 2)
    assert.ok(!/cost/.test(items.text), 'o vendedor não vê custo')
  })

  test('o mesmo envio repetido (duplo clique) não duplica a venda nem o estoque', async () => {
    const body = {
      idempotency_key: randomUUID(),
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1, discount: 0 }],
      payments: pix(200),
    }
    const [first, second] = [
      await api('POST', '/backend/v1/sales', { token: ctx.sellerA.token, body }),
      await api('POST', '/backend/v1/sales', { token: ctx.sellerA.token, body }),
    ]
    assert.equal(first.status, 201, first.text)
    assert.equal(second.status, 200, second.text)
    assert.equal(second.json.id, first.json.id)
    assert.equal(second.json.duplicate, true)
    assert.equal(await stockOf(ctx.p2), 2, 'baixou uma vez só')
    ctx.saleDup = first.json.id
  })

  test('loja não autorizada é recusada', async () => {
    const res = await submit(ctx.sellerA.token, {
      store: ctx.cajuru,
      customer: ctx.customer,
      items: [{ product: ctx.p1, quantity: 1 }],
      payments: pix(1000),
    })
    assert.equal(res.status, 403, res.text)
  })

  test('sem estoque, nada é gravado nem numerado', async () => {
    const before = (await list('sales', "id != ''")).length
    const res = await submit(ctx.sellerA.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p1, quantity: 99 }],
      payments: pix(99000),
    })
    assert.equal(res.status, 400, res.text)
    assert.match(res.json.message, /Sem estoque suficiente de "Patinete X"/)
    assert.equal((await list('sales', "id != ''")).length, before)
    assert.equal(await stockOf(ctx.p1), 2)
  })
})

describe('Regra do dono: NF só depois do administrador', () => {
  test('a NF não entra em venda aguardando aprovação; outros documentos entram', async () => {
    const nf = await api('POST', '/api/collections/sale_documents/records', {
      token: ctx.sellerA.token,
      form: nfForm(ctx.saleA1, 'nota_fiscal'),
    })
    assert.equal(nf.status, 403, nf.text)
    assert.match(nf.json.message, /só pode ser anexada depois que o administrador confirmar/)
    ok(
      await api('POST', '/api/collections/sale_documents/records', {
        token: ctx.sellerA.token,
        form: nfForm(ctx.saleA1, 'comprovante_pagamento'),
      }),
      'comprovante de pagamento',
    )
  })
})

describe('Aprovação pelo administrador', () => {
  test('vendedor não aprova, recusa nem cancela', async () => {
    for (const action of ['approve', 'reject', 'cancel']) {
      const res = await act(ctx.sellerA.token, ctx.saleA1, action, { reason: 'tentativa do vendedor' })
      assert.equal(res.status, 403, `${action}: ${res.text}`)
    }
  })

  test('aprovar confirma a venda, grava custo e comissão e libera a NF', async () => {
    const res = await act(ctx.admin.token, ctx.saleA1, 'approve')
    assert.equal(res.status, 200, res.text)

    const sale = await getSale(ctx.saleA1)
    assert.equal(sale.status, 'confirmada')
    assert.equal(sale.confirmed_by, ctx.admin.id)
    assert.equal(sale.payment_status, 'pago')

    const items = await list('sale_items', `sale = '${ctx.saleA1}'`)
    const byProduct = Object.fromEntries(items.map((i) => [i.product, i]))
    assert.equal(byProduct[ctx.p1].cost_price_snapshot, 600)
    assert.equal(byProduct[ctx.p1].commission_rate, 2, 'sem taxa no produto: vale a do vendedor')
    assert.equal(byProduct[ctx.p1].commission_value, 20)
    assert.equal(byProduct[ctx.p2].commission_rate, 5, 'a taxa do produto vence a do vendedor')
    assert.equal(byProduct[ctx.p2].commission_value, 20)

    const commissions = await list('commissions', `sale = '${ctx.saleA1}'`)
    assert.equal(commissions.length, 1)
    assert.equal(commissions[0].seller, ctx.sellerA.id)
    assert.equal(commissions[0].base_amount, 1400)
    assert.equal(commissions[0].value, 40)
    assert.equal(commissions[0].status, 'liberada')

    const payments = await list('sale_payments', `sale = '${ctx.saleA1}'`)
    assert.ok(payments.every((p) => p.confirmed), 'pagamentos recebidos')

    const audit = await list('audit_logs', `record_id = '${ctx.saleA1}'`)
    assert.ok(audit.some((a) => /aprovada pelo administrador/.test(a.reason)))

    denied(await act(ctx.admin.token, ctx.saleA1, 'approve'), 'aprovar de novo')
    ok(
      await api('POST', '/api/collections/sale_documents/records', {
        token: ctx.sellerA.token,
        form: nfForm(ctx.saleA1, 'nota_fiscal'),
      }),
      'NF depois da aprovação',
    )
    const mine = await list('commissions', `sale = '${ctx.saleA1}'`, ctx.sellerA.token)
    assert.equal(mine.length, 1, 'o vendedor vê a própria comissão')
  })
})

describe('Desconto acima do limite e recusa', () => {
  test('o vendedor explica o desconto; recusar devolve o estoque reservado', async () => {
    const body = {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p1, quantity: 1, discount: 100 }],
      payments: pix(900),
    }
    const noReason = await submit(ctx.sellerA.token, body)
    assert.equal(noReason.status, 400, noReason.text)
    assert.ok(noReason.json.data.discount_reason)

    const res = await submit(ctx.sellerA.token, { ...body, discount_reason: 'Cliente fiel, compra à vista' })
    assert.equal(res.status, 201, res.text)
    const sale = await getSale(res.json.id)
    assert.equal(sale.discount_over_limit, true)
    assert.equal(sale.discount_limit_pct, 5)
    assert.equal(sale.discount_reason, 'Cliente fiel, compra à vista')
    assert.equal(await stockOf(ctx.p1), 1)

    denied(await act(ctx.admin.token, res.json.id, 'reject', { reason: '' }), 'recusar sem motivo')
    ok(await act(ctx.admin.token, res.json.id, 'reject', { reason: 'Desconto alto demais' }), 'recusar')
    const rejected = await getSale(res.json.id)
    assert.equal(rejected.status, 'recusada')
    assert.equal(rejected.rejection_reason, 'Desconto alto demais')
    assert.equal(await stockOf(ctx.p1), 2, 'o estoque reservado voltou')
    const back = await list('stock_movements', `source_ref = '${res.json.id}' && type = 'cancelamento_venda'`)
    assert.deepEqual(back.map((m) => m.quantity), [1])

    denied(await act(ctx.admin.token, res.json.id, 'reject', { reason: 'de novo, de novo' }), 'recusar de novo')
    denied(await act(ctx.admin.token, res.json.id, 'approve'), 'aprovar venda recusada')
  })

  test('desconto dentro do limite não é marcado', async () => {
    const res = await submit(ctx.sellerA.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1, discount: 10 }],
      payments: pix(190),
    })
    assert.equal(res.status, 201, res.text)
    assert.equal((await getSale(res.json.id)).discount_over_limit, false)
    ok(await act(ctx.admin.token, res.json.id, 'reject', { reason: 'Só para liberar o estoque' }), 'recusar')
  })
})

describe('Saldo pendente', () => {
  test('aprovar com saldo exige justificativa; a venda fica parcial e a comissão prevista', async () => {
    const res = await submit(ctx.sellerA.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1 }],
      payments: pix(50),
    })
    assert.equal(res.status, 201, res.text)
    assert.equal((await getSale(res.json.id)).pending_balance, 150)

    const noNote = await act(ctx.admin.token, res.json.id, 'approve')
    assert.equal(noNote.status, 400, noNote.text)
    assert.ok(noNote.json.data.note)
    ok(await act(ctx.admin.token, res.json.id, 'approve', { note: 'Cliente paga o restante na retirada' }), 'aprovar')

    const sale = await getSale(res.json.id)
    assert.equal(sale.payment_status, 'parcial')
    assert.equal(sale.authorized_by, ctx.admin.id)
    const commissions = await list('commissions', `sale = '${res.json.id}'`)
    assert.equal(commissions[0].status, 'prevista')
    assert.equal(commissions[0].value, 10)
    ctx.salePartial = res.json.id
  })
})

describe('Cenário 9 — dois vendedores, última unidade', () => {
  test('só um envio reserva a unidade; o outro recebe "sem estoque"', async () => {
    const body = (key) => ({
      idempotency_key: key,
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p3, quantity: 1 }],
      payments: pix(3000),
    })
    const results = await Promise.all([
      api('POST', '/backend/v1/sales', { token: ctx.sellerA.token, body: body(randomUUID()) }),
      api('POST', '/backend/v1/sales', { token: ctx.sellerB.token, body: body(randomUUID()) }),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400], results.map((r) => r.text).join(' | '))
    assert.match(results.find((r) => r.status === 400).json.message, /Sem estoque suficiente/)
    assert.equal(await stockOf(ctx.p3), 0)
  })
})

describe('Venda lançada pelo administrador', () => {
  test('não precisa explicar desconto e é aprovada em seguida; sem comissão para quem não comissiona', async () => {
    const res = await submit(ctx.admin.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1, discount: 100 }],
      payments: [{ method: 'cartao_credito', amount: 100, installments: 2 }],
    })
    assert.equal(res.status, 201, res.text)
    ok(await act(ctx.admin.token, res.json.id, 'approve'), 'aprovar')
    const sale = await getSale(res.json.id)
    assert.equal(sale.status, 'confirmada')
    assert.equal(sale.payment, 'cartao_credito')
    assert.equal(sale.installments, 2)
    assert.equal((await list('commissions', `sale = '${res.json.id}'`)).length, 0)
  })

  test('parcelamento acima do configurado é recusado', async () => {
    const res = await submit(ctx.admin.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1 }],
      payments: [{ method: 'cartao_credito', amount: 200, installments: 11 }],
    })
    assert.equal(res.status, 400, res.text)
    assert.match(res.json.message, /até 10x/)
  })
})

describe('Cancelamento (DEV-01)', () => {
  test('venda confirmada e não entregue: estoque volta, comissão é estornada e o reembolso fica pendente', async () => {
    const p1 = await stockOf(ctx.p1)
    const p2 = await stockOf(ctx.p2)
    denied(await act(ctx.admin.token, ctx.saleA1, 'cancel', { reason: 'x' }), 'cancelar sem motivo')
    ok(await act(ctx.admin.token, ctx.saleA1, 'cancel', { reason: 'Cliente desistiu da compra' }), 'cancelar')

    const sale = await getSale(ctx.saleA1)
    assert.equal(sale.status, 'cancelada')
    assert.equal(sale.cancellation_reason, 'Cliente desistiu da compra')
    assert.equal(await stockOf(ctx.p1), p1 + 1)
    assert.equal(await stockOf(ctx.p2), p2 + 2)
    const commissions = await list('commissions', `sale = '${ctx.saleA1}'`)
    assert.deepEqual(commissions.map((c) => c.status), ['estornada'])
    const refunds = await list('sale_returns', `sale = '${ctx.saleA1}'`)
    assert.equal(refunds.length, 1)
    assert.equal(refunds[0].type, 'cancelamento')
    assert.equal(refunds[0].refund_amount, 1400)
    assert.equal(refunds[0].refund_status, 'pendente')

    denied(await act(ctx.admin.token, ctx.saleA1, 'cancel', { reason: 'cancelar de novo' }), 'cancelar de novo')
  })

  test('venda entregue não é cancelada (volta por devolução), e venda aguardando é recusada', async () => {
    ok(
      await api('PATCH', `/api/collections/sales/records/${ctx.salePartial}`, {
        token: ctx.admin.token,
        body: { delivery_status: 'entregue' },
      }),
      'registrar entrega',
    )
    const delivered = await act(ctx.admin.token, ctx.salePartial, 'cancel', { reason: 'Cliente desistiu' })
    assert.equal(delivered.status, 400, delivered.text)
    assert.match(delivered.json.message, /entregue/)

    const pending = await act(ctx.admin.token, ctx.saleDup, 'cancel', { reason: 'Cliente desistiu' })
    assert.equal(pending.status, 400, pending.text)
    ok(await act(ctx.admin.token, ctx.saleDup, 'reject', { reason: 'Cliente desistiu' }), 'recusar a pendente')
  })
})

describe('Travas da API comum', () => {
  test('ninguém troca a situação nem os valores de uma venda enviada pela API', async () => {
    const pending = await submit(ctx.sellerA.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1 }],
      payments: pix(200),
    })
    assert.equal(pending.status, 201, pending.text)
    ctx.salePending = pending.json.id
    denied(
      await api('PATCH', `/api/collections/sales/records/${ctx.salePending}`, { token: ctx.admin.token, body: { status: 'confirmada' } }),
      'admin confirmando pela API',
    )
    denied(
      await api('PATCH', `/api/collections/sales/records/${ctx.salePartial}`, { token: ctx.admin.token, body: { total: 1 } }),
      'admin mudando o total',
    )
    denied(
      await api('POST', '/api/collections/sale_items/records', {
        token: ctx.admin.token,
        body: { sale: ctx.salePartial, product: ctx.p2, quantity: 1 },
      }),
      'item em venda confirmada',
    )
    const payment = (await list('sale_payments', `sale = '${ctx.salePartial}'`))[0]
    denied(
      await api('PATCH', `/api/collections/sale_payments/records/${payment.id}`, { token: ctx.admin.token, body: { amount: 1 } }),
      'mudar pagamento de venda confirmada',
    )
    denied(
      await api('POST', '/api/collections/sales/records', {
        token: ctx.admin.token,
        body: { number: 'X-1', customer: ctx.customer, store: ctx.jockey, seller: ctx.admin.id, status: 'confirmada', total: 1 },
      }),
      'criar venda já confirmada',
    )
    ok(
      await api('PATCH', `/api/collections/sales/records/${ctx.salePartial}`, {
        token: ctx.admin.token,
        body: { observation: 'Retirada combinada para sábado' },
      }),
      'observação continua editável',
    )
    const item = (await list('sale_items', `sale = '${ctx.salePartial}'`))[0]
    ok(
      await api('PATCH', `/api/collections/sale_items/records/${item.id}`, { token: ctx.admin.token, body: { returned_quantity: 1 } }),
      'quantidade devolvida (tela de devolução)',
    )
  })
})

describe('Numeração por loja', () => {
  test('cada loja tem a própria sequência', async () => {
    const res = await submit(ctx.admin.token, {
      store: ctx.cajuru,
      customer: ctx.customer,
      items: [{ product: ctx.p1, quantity: 1 }],
      payments: pix(1000),
    })
    assert.equal(res.status, 201, res.text)
    assert.equal(res.json.number, 'CJ-000001')
  })

  test('loja de franquia ganha código pelas iniciais do nome', async () => {
    const res = await api('POST', '/backend/v1/network/franchises', {
      token: ctx.admin.token,
      body: {
        organization: { name: 'Silva Mobilidade' },
        legal_entity: { razao_social: 'Silva Mobilidade Ltda', cnpj: '11222333000181' },
        stores: [{ name: 'Loja Batel' }, { name: 'Shopping Mueller' }],
        owner: { name: 'Ana', email: 'ana@silva.dev', password: PASSWORD },
      },
    })
    assert.equal(res.status, 201, res.text)
    const ana = await login('ana@silva.dev')
    const stores = (await api('GET', '/api/collections/stores/records?sort=name', { token: ana.token })).json.items
    assert.deepEqual(stores.map((s) => s.code), ['BA', 'SM'])
  })
})

describe('Mês fechado', () => {
  test('com o mês atual fechado, a venda não entra', async () => {
    const now = new Date(Date.now() - 3 * 3600 * 1000)
    ok(
      await api('POST', '/api/collections/monthly_closings/records', {
        token: ctx.admin.token,
        body: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, status: 'fechado', closed_by: ctx.admin.id },
      }),
      'fechar o mês',
    )
    const res = await submit(ctx.sellerA.token, {
      store: ctx.jockey,
      customer: ctx.customer,
      items: [{ product: ctx.p2, quantity: 1 }],
      payments: pix(200),
    })
    assert.equal(res.status, 400, res.text)
    assert.match(res.json.message, /mês atual está fechado/)
  })
})

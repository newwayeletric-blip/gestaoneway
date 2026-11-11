// PRD D.8 — cenários de segurança 1 a 8, por chamadas diretas à API,
// logado como vendedor (o "vendedor malicioso").
//
// Sobre os códigos HTTP: o PocketBase recusa uma regra de API com 400, 403
// ou 404, conforme a operação (ex.: update fora da regra responde 404 para
// não revelar o registro). Por isso "negado" aqui é qualquer 4xx, e cada
// teste confere também que nada foi gravado.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

let pb
let api
const ctx = {}

const PASSWORD = 'SenhaForte!2026'
const denied = (res, msg) =>
  assert.ok(res.status >= 400 && res.status < 500, `${msg}: esperado 4xx, veio ${res.status} ${res.text}`)
const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)

async function login(email) {
  const res = await api('POST', '/api/collections/users/auth-with-password', {
    body: { identity: email, password: PASSWORD },
  })
  ok(res, `login ${email}`)
  return { token: res.json.token, id: res.json.record.id }
}

async function createSeller(email, stores) {
  const res = await api('POST', '/api/collections/users/records', {
    token: ctx.admin.token,
    body: {
      email,
      name: email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      profile: 'vendedor',
      stores,
    },
  })
  ok(res, `admin cria vendedor ${email}`)
  assert.equal(res.json.status, 'ativo', 'status padrão do usuário novo')
  return login(email)
}

async function count(collection, filter = '') {
  const q = filter ? `&filter=${encodeURIComponent(filter)}` : ''
  const res = await api('GET', `/api/collections/${collection}/records?perPage=1${q}`, {
    token: ctx.admin.token,
  })
  ok(res, `contagem ${collection}`)
  return res.json.totalItems
}

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)
})

after(async () => {
  if (pb) await pb.stop()
})

describe('Cenário 1 — criar usuário sem login', () => {
  test('cadastro anônimo de usuário é negado', async () => {
    const res = await api('POST', '/api/collections/users/records', {
      body: {
        email: 'invasor@teste.dev',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        profile: 'admin',
        status: 'ativo',
      },
    })
    denied(res, 'create anônimo em users')
    const status = await api('GET', '/backend/v1/setup/status')
    assert.equal(status.json.available, true, 'nenhum usuário pode ter sido criado')
  })

  test('setup sem token ou com token errado é negado', async () => {
    const body = { name: 'Admin', email: 'admin@teste.dev', password: PASSWORD, passwordConfirm: PASSWORD }
    assert.equal((await api('POST', '/backend/v1/setup', { body })).status, 403)
    assert.equal(
      (await api('POST', '/backend/v1/setup', { body: { ...body, token: 'errado' } })).status,
      403,
    )
  })

  test('setup com token cria o primeiro admin e depois se autodesativa', async () => {
    const body = {
      token: SETUP_TOKEN,
      name: 'Admin Teste',
      email: 'admin@teste.dev',
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    }
    const res = await api('POST', '/backend/v1/setup', { body })
    ok(res, 'setup inicial')
    assert.equal(res.json.record.profile, 'admin')
    ctx.admin = { token: res.json.token, id: res.json.record.id }

    const again = await api('POST', '/backend/v1/setup', { body: { ...body, email: 'outro@teste.dev' } })
    assert.equal(again.status, 404, 'rota desativada após o primeiro usuário')
    assert.equal((await api('GET', '/backend/v1/setup/status')).json.available, false)
    assert.equal(await count('users'), 1)
  })

  test('vendedor não cria usuário nem se promove a admin', async () => {
    // Fixtures do restante da suíte.
    const stores = await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })
    ctx.jockey = stores.json.items.find((s) => s.slug === 'jockey-plaza').id
    ctx.cajuru = stores.json.items.find((s) => s.slug === 'cajuru').id
    ctx.sellerA = await createSeller('vendedor.a@teste.dev', [ctx.jockey])
    ctx.sellerB = await createSeller('vendedor.b@teste.dev', [ctx.cajuru])

    const before = await count('users')
    const res = await api('POST', '/api/collections/users/records', {
      token: ctx.sellerA.token,
      body: { email: 'x@teste.dev', password: PASSWORD, passwordConfirm: PASSWORD, profile: 'admin' },
    })
    denied(res, 'vendedor criando usuário')
    assert.equal(await count('users'), before)

    const promote = await api('PATCH', `/api/collections/users/records/${ctx.sellerA.id}`, {
      token: ctx.sellerA.token,
      body: { profile: 'admin' },
    })
    denied(promote, 'vendedor alterando o próprio perfil')
    const me = await api('GET', `/api/collections/users/records/${ctx.sellerA.id}`, { token: ctx.admin.token })
    assert.equal(me.json.profile, 'vendedor')
  })
})

describe('Fixtures de catálogo e vendas', () => {
  test('admin cadastra produto, cliente e regra de desconto', async () => {
    const product = await api('POST', '/api/collections/products/records', {
      token: ctx.admin.token,
      body: { name: 'Patinete Teste', sku: 'TST-001', sale_price: 1000, cost_price: 600, status: 'ativo' },
    })
    ok(product, 'produto')
    ctx.product = product.json.id
    const variant = await api('POST', '/api/collections/product_variants/records', {
      token: ctx.admin.token,
      body: { product: ctx.product, name: 'Preto', sku: 'TST-001-P', sale_price: 1000, cost_price: 600 },
    })
    ok(variant, 'variação')
    ctx.variant = variant.json.id

    const stock = await api('POST', '/api/collections/stock_items/records', {
      token: ctx.admin.token,
      body: { product: ctx.product, variant: ctx.variant, store: ctx.jockey, quantity: 5 },
    })
    ok(stock, 'estoque inicial (admin, até a Fase 1)')
    ctx.stockItem = stock.json.id

    const customer = await api('POST', '/api/collections/customers/records', {
      token: ctx.admin.token,
      body: { name: 'Cliente Teste', phone: '+5541999990000', document: '52998224725' },
    })
    ok(customer, 'cliente')
    ctx.customer = customer.json.id

    ok(
      await api('POST', '/api/collections/settings/records', {
        token: ctx.admin.token,
        body: { key: 'max_discount_pix', value: '5' },
      }),
      'limite de desconto Pix = 5%',
    )

    // Venda do vendedor B (terceiro) com item, para o cenário 2.
    const saleB = await api('POST', '/api/collections/sales/records', {
      token: ctx.sellerB.token,
      body: {
        number: 'TST-B-1',
        customer: ctx.customer,
        store: ctx.cajuru,
        seller: ctx.sellerB.id,
        status: 'rascunho',
        total: 1000,
        payment: 'pix',
      },
    })
    ok(saleB, 'rascunho do vendedor B')
    ctx.saleB = saleB.json.id
    ok(
      await api('POST', '/api/collections/sale_items/records', {
        token: ctx.sellerB.token,
        body: { sale: ctx.saleB, product: ctx.product, variant: ctx.variant, product_name: 'x', sale_price: 1000, quantity: 1, total: 1000 },
      }),
      'item do vendedor B',
    )
  })

  test('as sementes fictícias foram removidas (CFG-04)', async () => {
    assert.equal(await count('settings', "key = 'max_discount_dinheiro'"), 0)
    assert.equal(await count('settings', "key = 'company_cnpj'"), 0)
    assert.equal(await count('customers', "document = '12345678909'"), 0)
    assert.equal(await count('financial_accounts', "name = 'Banco Itaú - Conta Principal'"), 0)
    assert.equal(await count('expense_allocations'), 0)
  })
})

describe('Cenário 7 — vender em loja não autorizada', () => {
  test('vendedor A (Jockey) não cria venda no Cajuru', async () => {
    const before = await count('sales')
    const res = await api('POST', '/api/collections/sales/records', {
      token: ctx.sellerA.token,
      body: {
        number: 'TST-A-X',
        customer: ctx.customer,
        store: ctx.cajuru,
        seller: ctx.sellerA.id,
        status: 'rascunho',
        total: 1000,
        payment: 'pix',
      },
    })
    denied(res, 'venda em loja não autorizada')
    assert.equal(await count('sales'), before)
  })

  test('vendedor A não cria venda em nome de outro vendedor nem já confirmada', async () => {
    const base = { customer: ctx.customer, store: ctx.jockey, total: 1000, payment: 'pix' }
    denied(
      await api('POST', '/api/collections/sales/records', {
        token: ctx.sellerA.token,
        body: { ...base, number: 'TST-A-Y', seller: ctx.sellerB.id, status: 'rascunho' },
      }),
      'venda em nome de terceiro',
    )
    denied(
      await api('POST', '/api/collections/sales/records', {
        token: ctx.sellerA.token,
        body: { ...base, number: 'TST-A-Z', seller: ctx.sellerA.id, status: 'confirmada' },
      }),
      'venda já confirmada',
    )
  })

  test('na loja autorizada o rascunho é aceito', async () => {
    const res = await api('POST', '/api/collections/sales/records', {
      token: ctx.sellerA.token,
      body: {
        number: 'TST-A-1',
        customer: ctx.customer,
        store: ctx.jockey,
        seller: ctx.sellerA.id,
        status: 'rascunho',
        total: 1,
        payment: 'pix',
      },
    })
    ok(res, 'rascunho na loja autorizada')
    ctx.saleA = res.json.id
  })
})

describe('Cenário 8 — preço ou desconto diferente do permitido', () => {
  test('preço enviado pelo navegador é ignorado e recalculado', async () => {
    const res = await api('POST', '/api/collections/sale_items/records', {
      token: ctx.sellerA.token,
      body: {
        sale: ctx.saleA,
        product: ctx.product,
        variant: ctx.variant,
        product_name: 'Nome forjado',
        sale_price: 1,
        cost_price: 0,
        quantity: 2,
        discount: 0,
        total: 2,
      },
    })
    ok(res, 'item com preço forjado')
    assert.equal(res.json.sale_price, 1000)
    assert.equal(res.json.total, 2000)
    assert.equal(res.json.product_name, 'Patinete Teste - Preto')
    assert.equal(res.json.cost_price, undefined, 'custo não volta para o vendedor')

    const sale = await api('GET', `/api/collections/sales/records/${ctx.saleA}`, { token: ctx.admin.token })
    assert.equal(sale.json.total, 2000, 'total da venda recalculado pelo servidor')
  })

  test('desconto acima do limite configurado é rejeitado', async () => {
    const before = await count('sale_items', `sale = '${ctx.saleA}'`)
    const res = await api('POST', '/api/collections/sale_items/records', {
      token: ctx.sellerA.token,
      body: { sale: ctx.saleA, product: ctx.product, variant: ctx.variant, quantity: 1, discount: 100, sale_price: 1000, product_name: 'x', total: 900 },
    })
    assert.equal(res.status, 400, res.text)
    assert.match(res.json.message, /Desconto acima do permitido/)
    assert.equal(await count('sale_items', `sale = '${ctx.saleA}'`), before)
  })

  test('desconto dentro do limite é aceito', async () => {
    const res = await api('POST', '/api/collections/sale_items/records', {
      token: ctx.sellerA.token,
      body: { sale: ctx.saleA, product: ctx.product, variant: ctx.variant, quantity: 1, discount: 50, sale_price: 1000, product_name: 'x', total: 950 },
    })
    ok(res, 'desconto de 5%')
    assert.equal(res.json.total, 950)
  })

  test('vendedor não altera totais nem status do rascunho', async () => {
    denied(
      await api('PATCH', `/api/collections/sales/records/${ctx.saleA}`, {
        token: ctx.sellerA.token,
        body: { total: 1 },
      }),
      'alterar total',
    )
    denied(
      await api('PATCH', `/api/collections/sales/records/${ctx.saleA}`, {
        token: ctx.sellerA.token,
        body: { status: 'confirmada' },
      }),
      'confirmar pela API',
    )
    const sale = await api('GET', `/api/collections/sales/records/${ctx.saleA}`, { token: ctx.admin.token })
    assert.equal(sale.json.status, 'rascunho')
    assert.equal(sale.json.total, 2950)
  })
})

describe('Cenário 2 — custo e comissão de terceiros não saem na API', () => {
  test('products, product_variants e sale_items sem campo de custo', async () => {
    for (const path of [
      '/api/collections/products/records?perPage=200',
      '/api/collections/product_variants/records?perPage=200&expand=product',
      '/api/collections/sale_items/records?perPage=200&expand=product,variant,sale',
      '/api/collections/stock_items/records?perPage=200&expand=product,variant',
    ]) {
      const res = await api('GET', path, { token: ctx.sellerA.token })
      ok(res, path)
      assert.ok(!/cost_price/.test(res.text), `${path} expôs custo: ${res.text.slice(0, 300)}`)
    }
    const adminView = await api('GET', `/api/collections/products/records/${ctx.product}`, { token: ctx.admin.token })
    assert.equal(adminView.json.cost_price, 600, 'admin continua vendo o custo')
  })

  test('varredura (D.5): nenhuma coleção que o vendedor lê traz campo de custo', async () => {
    const all = [
      'users', 'organizations', 'legal_entities', 'stores', 'categories', 'products',
      'product_variants', 'stock_items', 'stock_movements', 'transfers', 'transfer_items',
      'customers', 'customer_change_requests', 'sales', 'sale_items', 'sale_documents',
      'sale_payments', 'expenses', 'payments', 'commissions', 'commission_rules', 'settings',
      'financial_accounts', 'financial_categories', 'financial_transactions', 'card_receivables',
      'recurring_expenses', 'expense_allocations', 'sale_returns', 'monthly_closings',
      'audit_logs', 'transaction_attachments',
    ]
    let readable = 0
    for (const coll of all) {
      const res = await api('GET', `/api/collections/${coll}/records?perPage=200`, { token: ctx.sellerA.token })
      if (res.status !== 200) continue
      readable++
      assert.ok(!/"cost/.test(res.text), `${coll} expôs um campo de custo`)
    }
    assert.ok(readable >= 10, `o vendedor deveria ler várias coleções (leu ${readable})`)
  })

  test('itens e pagamentos de vendas de outro vendedor não aparecem', async () => {
    const items = await api('GET', '/api/collections/sale_items/records?perPage=200', { token: ctx.sellerA.token })
    assert.ok(items.json.items.length > 0)
    assert.ok(items.json.items.every((i) => i.sale === ctx.saleA), 'só itens das próprias vendas')
    const pays = await api('GET', '/api/collections/sale_payments/records?perPage=200', { token: ctx.sellerA.token })
    assert.ok(pays.json.items.every((p) => p.sale === ctx.saleA))
  })

  test('filtrar ou ordenar por custo é recusado', async () => {
    for (const q of ['filter=cost_price>500', 'sort=-cost_price', 'filter=product.cost_price>500']) {
      const coll = q.includes('product.') ? 'stock_items' : 'products'
      const res = await api('GET', `/api/collections/${coll}/records?${q}`, { token: ctx.sellerA.token })
      assert.equal(res.status, 403, `${coll}?${q}: ${res.status}`)
    }
  })
})

describe('Cenário 3 — escrita em estoque, movimentos, comissões e auditoria', () => {
  test('vendedor não cria nem altera nada nessas coleções', async () => {
    const attempts = [
      ['stock_items', { product: ctx.product, store: ctx.jockey, quantity: 99 }],
      ['stock_movements', { type: 'ajuste', product: ctx.product, store: ctx.jockey, quantity: 99 }],
      ['commissions', { seller: ctx.sellerA.id, sale: ctx.saleA, store: ctx.jockey, base_amount: 1, rate: 100, value: 999, status: 'liberada' }],
      ['audit_logs', { entity: 'x', record_id: 'x', action: 'criacao', user: ctx.sellerA.id }],
    ]
    for (const [coll, body] of attempts) {
      const before = await count(coll)
      denied(await api('POST', `/api/collections/${coll}/records`, { token: ctx.sellerA.token, body }), `create ${coll}`)
      assert.equal(await count(coll), before, `${coll} não pode ter mudado`)
    }
    denied(
      await api('PATCH', `/api/collections/stock_items/records/${ctx.stockItem}`, {
        token: ctx.sellerA.token,
        body: { quantity: 999 },
      }),
      'update stock_items',
    )
    const stock = await api('GET', `/api/collections/stock_items/records/${ctx.stockItem}`, { token: ctx.admin.token })
    assert.equal(stock.json.quantity, 5)
  })

  test('nem o admin escreve na auditoria pela API', async () => {
    const before = await count('audit_logs')
    denied(
      await api('POST', '/api/collections/audit_logs/records', {
        token: ctx.admin.token,
        body: { entity: 'x', record_id: 'x', action: 'criacao', user: ctx.admin.id },
      }),
      'admin criando auditoria',
    )
    const first = await api('GET', '/api/collections/audit_logs/records?perPage=1', { token: ctx.admin.token })
    const id = first.json.items[0].id
    denied(
      await api('PATCH', `/api/collections/audit_logs/records/${id}`, { token: ctx.admin.token, body: { reason: 'apagado' } }),
      'admin editando auditoria',
    )
    denied(await api('DELETE', `/api/collections/audit_logs/records/${id}`, { token: ctx.admin.token }), 'admin apagando auditoria')
    assert.equal(await count('audit_logs'), before)
  })
})

describe('Cenário 4 — CPF de cliente existente', () => {
  test('vendedor não edita o documento, mas edita observações', async () => {
    denied(
      await api('PATCH', `/api/collections/customers/records/${ctx.customer}`, {
        token: ctx.sellerA.token,
        body: { document: '11144477735' },
      }),
      'editar CPF',
    )
    const c = await api('GET', `/api/collections/customers/records/${ctx.customer}`, { token: ctx.admin.token })
    assert.equal(c.json.document, '52998224725')

    ok(
      await api('PATCH', `/api/collections/customers/records/${ctx.customer}`, {
        token: ctx.sellerA.token,
        body: { notes: 'Prefere contato por WhatsApp' },
      }),
      'editar observações',
    )
  })

  test('solicitação de alteração é aceita e só o admin aprova', async () => {
    const req = await api('POST', '/api/collections/customer_change_requests/records', {
      token: ctx.sellerA.token,
      body: {
        customer: ctx.customer,
        requested_by: ctx.sellerA.id,
        changes: { document: '11144477735' },
        reason: 'Cliente informou CPF errado',
        status: 'pendente',
      },
    })
    assert.equal(req.status, 200, req.text)
    assert.deepEqual(req.json.previous_values, { document: '52998224725' })

    denied(
      await api('PATCH', `/api/collections/customer_change_requests/records/${req.json.id}`, {
        token: ctx.sellerA.token,
        body: { status: 'aprovada' },
      }),
      'vendedor aprovando a própria solicitação',
    )
    let c = await api('GET', `/api/collections/customers/records/${ctx.customer}`, { token: ctx.admin.token })
    assert.equal(c.json.document, '52998224725')

    ok(
      await api('PATCH', `/api/collections/customer_change_requests/records/${req.json.id}`, {
        token: ctx.admin.token,
        body: { status: 'aprovada' },
      }),
      'admin aprova',
    )
    c = await api('GET', `/api/collections/customers/records/${ctx.customer}`, { token: ctx.admin.token })
    assert.equal(c.json.document, '11144477735')
    assert.equal(await count('audit_logs', `entity = 'customers' && record_id = '${ctx.customer}'`), 1)
  })
})

describe('Cenário 5 — PDF de NF sem token', () => {
  test('arquivo protegido não abre sem token e abre com token', async () => {
    // A NF em si só entra em venda confirmada (sales_flow.test.mjs); a
    // proteção do arquivo é a mesma para qualquer documento da venda.
    const form = new FormData()
    form.append('sale', ctx.saleA)
    form.append('label', 'Comprovante teste')
    form.append('doc_type', 'comprovante_pagamento')
    form.append('file', new Blob(['%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'], { type: 'application/pdf' }), 'nf.pdf')
    const doc = await api('POST', '/api/collections/sale_documents/records', { token: ctx.sellerA.token, form })
    ok(doc, 'upload da NF pelo vendedor dono da venda')
    const fileUrl = `/api/files/sale_documents/${doc.json.id}/${doc.json.file}`

    const anon = await api('GET', fileUrl)
    assert.ok([401, 403, 404].includes(anon.status), `sem token: ${anon.status}`)

    const other = await api('POST', '/api/files/token', { token: ctx.sellerB.token })
    const otherRes = await api('GET', `${fileUrl}?token=${other.json.token}`)
    assert.ok([401, 403, 404].includes(otherRes.status), `token de outro vendedor: ${otherRes.status}`)

    const own = await api('POST', '/api/files/token', { token: ctx.sellerA.token })
    assert.equal((await api('GET', `${fileUrl}?token=${own.json.token}`)).status, 200)
  })

  test('tipo de arquivo fora da lista é rejeitado', async () => {
    const form = new FormData()
    form.append('sale', ctx.saleA)
    form.append('label', 'executável')
    form.append('file', new Blob([Buffer.from('MZ\x90\x00\x03\x00\x00\x00binario', 'binary')]), 'nf.exe')
    denied(await api('POST', '/api/collections/sale_documents/records', { token: ctx.sellerA.token, form }), 'upload .exe')
  })
})

describe('Cenário 6 — usuário desativado com token antigo', () => {
  test('perde o acesso na hora', async () => {
    const sellerC = await createSeller('vendedor.c@teste.dev', [ctx.jockey])
    const sale = await api('POST', '/api/collections/sales/records', {
      token: sellerC.token,
      body: { number: 'TST-C-1', customer: ctx.customer, store: ctx.jockey, seller: sellerC.id, status: 'rascunho', total: 1, payment: 'pix' },
    })
    ok(sale, 'rascunho do vendedor C antes de ser desativado')

    ok(
      await api('PATCH', `/api/collections/users/records/${sellerC.id}`, {
        token: ctx.admin.token,
        body: { status: 'inativo' },
      }),
      'admin desativa',
    )

    const refresh = await api('POST', '/api/collections/users/auth-refresh', { token: sellerC.token })
    assert.equal(refresh.status, 401, `auth-refresh com token antigo: ${refresh.status}`)

    const relogin = await api('POST', '/api/collections/users/auth-with-password', {
      body: { identity: 'vendedor.c@teste.dev', password: PASSWORD },
    })
    assert.ok([400, 401, 403].includes(relogin.status), `login de desativado: ${relogin.status}`)

    // O token antigo vira anônimo: nenhum dado volta.
    const list = await api('GET', '/api/collections/sales/records', { token: sellerC.token })
    assert.equal(list.json.items?.length ?? 0, 0)
    const view = await api('GET', `/api/collections/sales/records/${sale.json.id}`, { token: sellerC.token })
    assert.ok([401, 403, 404].includes(view.status), `ver a própria venda: ${view.status}`)
    denied(
      await api('POST', '/api/collections/customers/records', {
        token: sellerC.token,
        body: { name: 'Depois de desativado', phone: '+5541900000000' },
      }),
      'criar cliente após desativação',
    )
  })
})

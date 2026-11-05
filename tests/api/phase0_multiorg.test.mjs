// PRD D.8 — rede e multiempresa, cenários 25 a 29, mais o cadastro de
// franquia, a validação de CNPJ e a troca de CNPJ de uma loja.
// "New Way" = organização própria (lojas Jockey e Cajuru); "Franquia B" =
// franqueado cadastrado pela rota de onboarding.
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
  return { token: res.json.token, id: res.json.record.id, org: res.json.record.org }
}

async function create(token, collection, body, msg) {
  const res = await api('POST', `/api/collections/${collection}/records`, { token, body })
  ok(res, msg || `criar ${collection}`)
  return res.json
}

async function listIds(token, collection, filter = '') {
  const q = filter ? `&filter=${encodeURIComponent(filter)}` : ''
  const res = await api('GET', `/api/collections/${collection}/records?perPage=500${q}`, { token })
  ok(res, `listar ${collection}`)
  return res.json.items.map((r) => r.id)
}

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)

  // --- New Way (organização própria) ---------------------------------------
  const setup = await api('POST', '/backend/v1/setup', {
    body: {
      token: SETUP_TOKEN,
      name: 'Dono New Way',
      email: 'dono@newway.dev',
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    },
  })
  ok(setup, 'setup')
  ctx.admin = { token: setup.json.token, id: setup.json.record.id, org: setup.json.record.org }
  assert.equal(setup.json.record.network_role, 'admin_rede')

  const orgs = await api('GET', '/api/collections/organizations/records', { token: ctx.admin.token })
  ctx.ownOrg = orgs.json.items.find((o) => o.type === 'propria').id
  ctx.networkOrg = orgs.json.items.find((o) => o.type === 'rede').id
  assert.equal(ctx.admin.org, ctx.ownOrg)

  const stores = await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })
  ctx.jockey = stores.json.items.find((s) => s.slug === 'jockey-plaza').id

  await create(ctx.admin.token, 'users', {
    email: 'vendedor@newway.dev',
    name: 'Vendedor New Way',
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    profile: 'vendedor',
    stores: [ctx.jockey],
  })
  ctx.sellerA = await login('vendedor@newway.dev')
  ctx.customerA = (
    await create(ctx.admin.token, 'customers', { name: 'Cliente New Way', phone: '+5541999990001', document: '52998224725' })
  ).id
  ctx.productA = (
    await create(ctx.admin.token, 'products', { name: 'Produto New Way', sku: 'NW-1', sale_price: 1000, cost_price: 600, status: 'ativo' })
  ).id

  // --- Franquia B, cadastrada pela rota da rede -----------------------------
  const onboarding = await api('POST', '/backend/v1/network/franchises', {
    token: ctx.admin.token,
    body: {
      organization: { name: 'Franquia B', region: 'Joinville' },
      legal_entity: { razao_social: 'Franquia B Mobilidade Ltda', cnpj: '11.222.333/0001-81', regime: 'simples_nacional' },
      stores: [{ name: 'Loja B', slug: 'loja-b' }],
      owner: { name: 'Dono B', email: 'dono@franquiab.dev', password: PASSWORD },
    },
  })
  assert.equal(onboarding.status, 201, onboarding.text)
  ctx.orgB = onboarding.json.organization
  ctx.legalB = onboarding.json.legal_entity
  ctx.storeB = onboarding.json.stores[0]
  ctx.ownerB = await login('dono@franquiab.dev')
  assert.equal(ctx.ownerB.org, ctx.orgB)

  await create(ctx.ownerB.token, 'users', {
    email: 'vendedor@franquiab.dev',
    name: 'Vendedor B',
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    profile: 'vendedor',
    stores: [ctx.storeB],
  })
  ctx.sellerB = await login('vendedor@franquiab.dev')
  assert.equal(ctx.sellerB.org, ctx.orgB, 'usuário criado pelo dono B nasce na franquia B')

  ctx.customerB = (
    await create(ctx.ownerB.token, 'customers', { name: 'Cliente B', phone: '+5547999990002', document: '11144477735' })
  ).id
  ctx.productB = (
    await create(ctx.ownerB.token, 'products', { name: 'Produto B', sku: 'B-1', sale_price: 2000, cost_price: 1500, status: 'ativo' })
  ).id
  ctx.stockB = (await create(ctx.ownerB.token, 'stock_items', { product: ctx.productB, store: ctx.storeB, quantity: 3 })).id
  const saleB = await create(ctx.sellerB.token, 'sales', {
    number: 'B-0001',
    customer: ctx.customerB,
    store: ctx.storeB,
    seller: ctx.sellerB.id,
    status: 'rascunho',
    total: 1,
    payment: 'pix',
  })
  ctx.saleB = saleB.id
  ctx.saleBLegalEntity = saleB.legal_entity
  await create(ctx.sellerB.token, 'sale_items', { sale: ctx.saleB, product: ctx.productB, quantity: 1 })
  ctx.expenseB = (
    await create(ctx.ownerB.token, 'financial_transactions', {
      description: 'Aluguel Loja B',
      type: 'despesa',
      amount: 3000,
      competence_date: '2026-10-01 00:00:00.000Z',
      due_date: '2026-10-10 00:00:00.000Z',
      status: 'pendente',
    })
  ).id

  const form = new FormData()
  form.append('sale', ctx.saleB)
  form.append('label', 'NF B')
  form.append('file', new Blob(['%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'], { type: 'application/pdf' }), 'nf-b.pdf')
  const doc = await api('POST', '/api/collections/sale_documents/records', { token: ctx.sellerB.token, form })
  ok(doc, 'NF da franquia B')
  ctx.docB = doc.json
})

after(async () => {
  if (pb) await pb.stop()
})

describe('New Way: lojas próprias e CNPJ', () => {
  test('as duas lojas usam o CNPJ 65.321.600/0001-05, e a venda sai carimbada com ele', async () => {
    const stores = await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })
    const own = stores.json.items.filter((s) => ['jockey-plaza', 'cajuru'].includes(s.slug))
    assert.equal(own.length, 2)
    const le = await api('GET', `/api/collections/legal_entities/records/${own[0].legal_entity}`, {
      token: ctx.admin.token,
    })
    assert.equal(le.json.cnpj, '65321600000105')
    assert.equal(le.json.razao_social, 'NEW WAY ELETRIC LTDA')
    assert.equal(le.json.regime, 'simples_nacional')
    assert.equal(le.json.ie, '9120881202')
    assert.ok(own.every((s) => s.legal_entity === le.json.id), 'Jockey e Cajuru no mesmo CNPJ')
    const cajuru = own.find((s) => s.slug === 'cajuru')
    assert.match(cajuru.address, /Rua Santo André, 59/)

    const sale = await create(ctx.sellerA.token, 'sales', {
      number: 'NW-0001',
      customer: ctx.customerA,
      store: ctx.jockey,
      seller: ctx.sellerA.id,
      status: 'rascunho',
      total: 1,
      payment: 'pix',
    })
    assert.equal(sale.legal_entity, le.json.id)
  })
})

describe('Cadastro de franquia (rota da rede)', () => {
  test('tudo nasce na organização nova, e o CNPJ vai para a loja e para a venda', async () => {
    const store = await api('GET', `/api/collections/stores/records/${ctx.storeB}`, { token: ctx.ownerB.token })
    assert.equal(store.json.org, ctx.orgB)
    assert.equal(store.json.legal_entity, ctx.legalB)
    assert.equal(ctx.saleBLegalEntity, ctx.legalB, 'venda carimbada com o CNPJ da loja')
    const le = await api('GET', `/api/collections/legal_entities/records/${ctx.legalB}`, { token: ctx.ownerB.token })
    assert.equal(le.json.cnpj, '11222333000181', 'CNPJ guardado sem pontuação')
  })

  test('só o admin da rede cadastra franquia', async () => {
    const body = {
      organization: { name: 'Franquia Pirata' },
      legal_entity: { razao_social: 'X', cnpj: '11444777000161' },
      stores: [{ name: 'X', slug: 'x' }],
      owner: { name: 'X', email: 'x@x.dev', password: PASSWORD },
    }
    assert.equal((await api('POST', '/backend/v1/network/franchises', { token: ctx.ownerB.token, body })).status, 403)
    assert.equal((await api('POST', '/backend/v1/network/franchises', { token: ctx.sellerA.token, body })).status, 403)
    assert.equal((await api('POST', '/backend/v1/network/franchises', { body })).status, 403)
  })

  test('falha no meio não deixa nada pela metade', async () => {
    const before = (await listIds(ctx.admin.token, 'organizations')).length
    const res = await api('POST', '/backend/v1/network/franchises', {
      token: ctx.admin.token,
      body: {
        organization: { name: 'Franquia Duplicada' },
        legal_entity: { razao_social: 'Dup', cnpj: '11222333000181' }, // CNPJ da franquia B
        stores: [{ name: 'Dup', slug: 'dup' }],
        owner: { name: 'Dup', email: 'dup@dup.dev', password: PASSWORD },
      },
    })
    denied(res, 'CNPJ repetido')
    assert.equal((await listIds(ctx.admin.token, 'organizations')).length, before)
  })

  test('franqueado não cria organização nem loja pela API, nem se dá papel de rede', async () => {
    denied(
      await api('POST', '/api/collections/organizations/records', {
        token: ctx.ownerB.token,
        body: { name: 'Nova', type: 'franquia', status: 'ativa' },
      }),
      'criar organização',
    )
    denied(
      await api('POST', '/api/collections/stores/records', {
        token: ctx.ownerB.token,
        body: { name: 'Loja extra', slug: 'extra', org: ctx.orgB },
      }),
      'criar loja',
    )
    denied(
      await api('PATCH', `/api/collections/users/records/${ctx.sellerB.id}`, {
        token: ctx.ownerB.token,
        body: { network_role: 'admin_rede' },
      }),
      'dar papel de rede ao vendedor',
    )
    denied(
      await api('PATCH', `/api/collections/users/records/${ctx.ownerB.id}`, {
        token: ctx.ownerB.token,
        body: { network_role: 'admin_rede' },
      }),
      'se dar papel de rede',
    )
    denied(
      await api('PATCH', `/api/collections/users/records/${ctx.ownerB.id}`, {
        token: ctx.ownerB.token,
        body: { org: ctx.ownOrg },
      }),
      'mudar de organização',
    )
  })
})

describe('Cenário 25 — franqueado A tenta ler B (e vice-versa)', () => {
  const collections = ['sales', 'sale_items', 'customers', 'stock_items', 'products', 'stores', 'users', 'sale_documents', 'financial_transactions', 'settings']

  test('New Way (admin e vendedor) não vê nada da franquia B, nem forçando o filtro', async () => {
    const idsB = [ctx.saleB, ctx.customerB, ctx.stockB, ctx.productB, ctx.storeB, ctx.ownerB.id, ctx.sellerB.id, ctx.docB.id, ctx.expenseB]
    for (const who of [ctx.admin, ctx.sellerA]) {
      for (const coll of collections) {
        const res = await api('GET', `/api/collections/${coll}/records?perPage=500`, { token: who.token })
        if (res.status === 200) {
          for (const id of idsB) assert.ok(!res.text.includes(id), `${coll} expôs registro da franquia B`)
        }
        const forced = await api('GET', `/api/collections/${coll}/records?filter=${encodeURIComponent(`org='${ctx.orgB}'`)}`, {
          token: who.token,
        })
        if (forced.status === 200) assert.equal(forced.json.totalItems, 0, `${coll} com filtro org=B`)
      }
    }
  })

  test('abrir pelo id, expandir relação ou baixar arquivo de B: nada volta', async () => {
    for (const [coll, id] of [
      ['customers', ctx.customerB],
      ['sales', ctx.saleB],
      ['financial_transactions', ctx.expenseB],
      ['stores', ctx.storeB],
    ]) {
      const res = await api('GET', `/api/collections/${coll}/records/${id}`, { token: ctx.admin.token })
      assert.ok([403, 404].includes(res.status), `${coll}/${id}: ${res.status}`)
    }
    const token = (await api('POST', '/api/files/token', { token: ctx.admin.token })).json.token
    const file = await api('GET', `/api/files/sale_documents/${ctx.docB.id}/${ctx.docB.file}?token=${token}`)
    assert.ok([403, 404].includes(file.status), `arquivo de B com token da New Way: ${file.status}`)
  })

  test('franquia B também não vê a New Way', async () => {
    for (const coll of ['customers', 'products', 'stores', 'users']) {
      const ids = await listIds(ctx.ownerB.token, coll)
      for (const id of [ctx.customerA, ctx.productA, ctx.jockey, ctx.admin.id, ctx.sellerA.id]) {
        assert.ok(!ids.includes(id), `${coll} da franquia B mostrou registro da New Way`)
      }
    }
  })

  test('B não usa cliente, produto ou loja da New Way nos próprios registros', async () => {
    denied(
      await api('POST', '/api/collections/sales/records', {
        token: ctx.ownerB.token,
        body: { number: 'B-X', customer: ctx.customerA, store: ctx.storeB, seller: ctx.ownerB.id, status: 'rascunho', total: 1 },
      }),
      'venda com cliente da New Way',
    )
    denied(
      await api('POST', '/api/collections/sale_items/records', {
        token: ctx.sellerB.token,
        body: { sale: ctx.saleB, product: ctx.productA, quantity: 1 },
      }),
      'item com produto da New Way',
    )
    denied(
      await api('POST', '/api/collections/stock_items/records', {
        token: ctx.ownerB.token,
        body: { product: ctx.productB, store: ctx.jockey, quantity: 1 },
      }),
      'estoque na loja da New Way',
    )
  })

  test('mandar outra organização no corpo não muda nada: o servidor decide', async () => {
    const c = await create(ctx.ownerB.token, 'customers', {
      name: 'Tentativa de invasão',
      phone: '+5547900000000',
      org: ctx.ownOrg,
    })
    assert.equal(c.org, ctx.orgB)
    denied(
      await api('PATCH', `/api/collections/customers/records/${c.id}`, {
        token: ctx.ownerB.token,
        body: { org: ctx.ownOrg },
      }),
      'trocar a organização de um registro',
    )
  })
})

describe('Cenário 26 — consultor de campo vê só as franquias dele', () => {
  test('consultor atribuído à franquia B não vê a New Way', async () => {
    await create(ctx.admin.token, 'users', {
      email: 'consultor@rede.dev',
      name: 'Consultor',
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      profile: 'vendedor',
      org: ctx.networkOrg,
      network_role: 'consultor',
    })
    const consultant = await login('consultor@rede.dev')
    assert.equal(consultant.org, ctx.networkOrg)

    ok(
      await api('PATCH', `/api/collections/organizations/records/${ctx.orgB}`, {
        token: ctx.admin.token,
        body: { consultant: consultant.id },
      }),
      'admin da rede atribui o consultor',
    )
    const visible = await listIds(consultant.token, 'organizations')
    assert.ok(visible.includes(ctx.orgB), 'vê a franquia atribuída')
    assert.ok(!visible.includes(ctx.ownOrg), 'não vê organização não atribuída')
    assert.equal((await listIds(consultant.token, 'sales')).length, 0, 'sem acesso direto às vendas')
  })

  test('só o admin da rede dá papel de rede', async () => {
    denied(
      await api('POST', '/api/collections/users/records', {
        token: ctx.ownerB.token,
        body: {
          email: 'falso-consultor@franquiab.dev',
          password: PASSWORD,
          passwordConfirm: PASSWORD,
          profile: 'vendedor',
          network_role: 'consultor',
        },
      }),
      'franqueado criando consultor',
    )
  })
})

describe('Cenário 27 — a rede não recebe dados pessoais nem despesas da franquia', () => {
  test('admin da rede não lê clientes nem despesas de B pela API', async () => {
    assert.equal((await listIds(ctx.admin.token, 'customers', `org='${ctx.orgB}'`)).length, 0)
    assert.equal((await listIds(ctx.admin.token, 'financial_transactions', `org='${ctx.orgB}'`)).length, 0)
    // O CNPJ (dado cadastral) a rede enxerga.
    const le = await api('GET', `/api/collections/legal_entities/records/${ctx.legalB}`, { token: ctx.admin.token })
    assert.equal(le.status, 200)
  })
})

describe('Cenário 28 — sem modo suporte, a rede não escreve na franquia', () => {
  test('alterar cliente ou venda de B pela API é negado', async () => {
    denied(
      await api('PATCH', `/api/collections/customers/records/${ctx.customerB}`, {
        token: ctx.admin.token,
        body: { notes: 'escrito pela rede' },
      }),
      'rede alterando cliente de B',
    )
    denied(
      await api('PATCH', `/api/collections/sales/records/${ctx.saleB}`, {
        token: ctx.admin.token,
        body: { observation: 'escrito pela rede' },
      }),
      'rede alterando venda de B',
    )
    const c = await api('GET', `/api/collections/customers/records/${ctx.customerB}`, { token: ctx.ownerB.token })
    assert.notEqual(c.json.notes, 'escrito pela rede')
  })
})

describe('Cenário 29 — mesmo CPF em duas franquias', () => {
  test('permitido em organizações diferentes, bloqueado na mesma', async () => {
    // 11144477735 é cliente da franquia B; a New Way pode cadastrar o mesmo CPF.
    const sameCpf = await api('POST', '/api/collections/customers/records', {
      token: ctx.admin.token,
      body: { name: 'Mesmo CPF na New Way', phone: '+5541900000001', document: '111.444.777-35' },
    })
    ok(sameCpf, 'mesmo CPF em outra organização')
    assert.equal(sameCpf.json.document, '11144477735', 'documento guardado sem pontuação')

    const again = await api('POST', '/api/collections/customers/records', {
      token: ctx.ownerB.token,
      body: { name: 'Duplicado em B', phone: '+5547900000003', document: '111.444.777-35' },
    })
    assert.equal(again.status, 400, again.text)
    assert.ok(again.json.data.document, 'erro aponta o campo documento')
  })

  test('CPF com dígito errado é recusado', async () => {
    const res = await api('POST', '/api/collections/customers/records', {
      token: ctx.ownerB.token,
      body: { name: 'CPF errado', phone: '+5547900000004', document: '111.444.777-00' },
    })
    assert.equal(res.status, 400, res.text)
  })
})

describe('CNPJs: validação e troca de CNPJ da loja', () => {
  test('CNPJ inválido é recusado; CNPJ alfanumérico válido é aceito', async () => {
    const bad = await api('POST', '/api/collections/legal_entities/records', {
      token: ctx.ownerB.token,
      body: { razao_social: 'CNPJ errado', cnpj: '11.222.333/0001-00' },
    })
    assert.equal(bad.status, 400, bad.text)

    const alnum = await create(ctx.ownerB.token, 'legal_entities', {
      razao_social: 'Franquia B Filial Ltda',
      cnpj: '12.ABC.345/01DE-35',
      matriz_filial: 'filial',
    })
    assert.equal(alnum.cnpj, '12ABC34501DE35')
    assert.equal(alnum.org, ctx.orgB)
    ctx.legalB2 = alnum.id
  })

  test('trocar o CNPJ da loja vale para as vendas novas; as antigas mantêm o CNPJ', async () => {
    ok(
      await api('PATCH', `/api/collections/stores/records/${ctx.storeB}`, {
        token: ctx.ownerB.token,
        body: { legal_entity: ctx.legalB2 },
      }),
      'dono troca o CNPJ da loja',
    )
    const newSale = await create(ctx.sellerB.token, 'sales', {
      number: 'B-0002',
      customer: ctx.customerB,
      store: ctx.storeB,
      seller: ctx.sellerB.id,
      status: 'rascunho',
      total: 1,
      payment: 'pix',
    })
    assert.equal(newSale.legal_entity, ctx.legalB2)
    const oldSale = await api('GET', `/api/collections/sales/records/${ctx.saleB}`, { token: ctx.ownerB.token })
    assert.equal(oldSale.json.legal_entity, ctx.legalB)
    denied(
      await api('PATCH', `/api/collections/sales/records/${ctx.saleB}`, {
        token: ctx.ownerB.token,
        body: { legal_entity: ctx.legalB2 },
      }),
      'trocar o CNPJ de uma venda já lançada',
    )
  })

  test('loja não pode apontar para CNPJ de outra organização', async () => {
    const leNewWay = await create(ctx.admin.token, 'legal_entities', {
      razao_social: 'New Way Eletric Ltda',
      cnpj: '11.444.777/0001-61',
    })
    assert.equal(leNewWay.org, ctx.ownOrg)
    denied(
      await api('PATCH', `/api/collections/stores/records/${ctx.storeB}`, {
        token: ctx.ownerB.token,
        body: { legal_entity: leNewWay.id },
      }),
      'loja de B apontando para CNPJ da New Way',
    )
  })
})

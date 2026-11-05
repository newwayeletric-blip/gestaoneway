// FRQ-01: cadastro e lista de franquias pela rede (tela /franquias), com o
// identificador de loja gerado pelo servidor e o número do CNPJ travado
// depois que a empresa tem movimento (CNPJ-03).
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

async function login(email) {
  const res = await api('POST', '/api/collections/users/auth-with-password', {
    body: { identity: email, password: PASSWORD },
  })
  ok(res, `login ${email}`)
  return { token: res.json.token, id: res.json.record.id, record: res.json.record }
}

async function listFranchises(token = ctx.admin.token) {
  const res = await api('GET', '/backend/v1/network/franchises', { token })
  ok(res, 'listar franquias')
  return res.json.items
}

const silva = {
  organization: { name: 'Silva Mobilidade', region: 'Curitiba - PR' },
  legal_entity: {
    razao_social: 'Silva Mobilidade Ltda',
    nome_fantasia: 'Silva Mobi',
    cnpj: '11.222.333/0001-81',
    matriz_filial: 'matriz',
    regime: 'simples_nacional',
    ie: '90.12345-67',
    fiscal_email: 'fiscal@silva.dev',
    accountant_contact: 'Contabilidade Exemplo (41) 3333-0000',
    address: {
      cep: '80.240-000',
      logradouro: 'Av. do Batel',
      numero: '1000',
      complemento: 'Loja 2',
      bairro: 'Batel',
      municipio: 'Curitiba',
      uf: 'pr',
    },
  },
  // "Cajuru" já é o identificador de uma loja da New Way.
  stores: [
    { name: 'Loja Batel', address: 'Av. do Batel, 1000', phone: '41 3333-0000', whatsapp: '41 99999-0000' },
    { name: 'Cajuru' },
  ],
  owner: { name: 'Ana Silva', email: 'Ana@Silva.dev', password: PASSWORD },
}

// Cadastro mínimo válido, para variar um campo de cada vez.
const minimal = (cnpj, email, name = 'Franquia ' + cnpj) => ({
  organization: { name },
  legal_entity: { razao_social: name + ' Ltda', cnpj },
  stores: [{ name: 'Loja ' + name }],
  owner: { name: 'Dono ' + name, email, password: PASSWORD },
})

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)

  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono New Way', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = { token: setup.json.token, id: setup.json.record.id }
  ctx.ownOrg = setup.json.record.org

  const stores = await api('GET', '/api/collections/stores/records', { token: ctx.admin.token })
  ctx.jockey = stores.json.items.find((s) => s.slug === 'jockey-plaza')

  ok(
    await api('POST', '/api/collections/users/records', {
      token: ctx.admin.token,
      body: {
        email: 'vendedor@newway.dev',
        name: 'Vendedor New Way',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        profile: 'vendedor',
        stores: [ctx.jockey.id],
      },
    }),
    'vendedor da New Way',
  )
  ctx.seller = await login('vendedor@newway.dev')

  const res = await api('POST', '/backend/v1/network/franchises', { token: ctx.admin.token, body: silva })
  assert.equal(res.status, 201, res.text)
  ctx.silva = res.json
})

after(async () => {
  if (pb) await pb.stop()
})

describe('Cadastro completo de franquia', () => {
  test('a lista da rede mostra empresa, lojas e proprietário; só franquias entram', async () => {
    const items = await listFranchises()
    assert.deepEqual(
      items.map((f) => f.name),
      ['Silva Mobilidade'],
      'New Way (própria) e a Rede não aparecem na lista de franquias',
    )
    const f = items[0]
    assert.equal(f.id, ctx.silva.organization)
    assert.equal(f.status, 'implantacao')
    assert.equal(f.region, 'Curitiba - PR')

    assert.equal(f.legal_entities.length, 1)
    const le = f.legal_entities[0]
    assert.equal(le.cnpj, '11222333000181', 'CNPJ sem pontuação')
    assert.equal(le.ie, '901234567', 'IE sem pontuação')
    assert.equal(le.regime, 'simples_nacional')
    assert.equal(le.fiscal_email, 'fiscal@silva.dev')
    assert.deepEqual(le.address, {
      cep: '80240000',
      logradouro: 'Av. do Batel',
      numero: '1000',
      complemento: 'Loja 2',
      bairro: 'Batel',
      municipio: 'Curitiba',
      uf: 'PR',
    })

    assert.deepEqual(
      f.stores.map((s) => [s.name, s.slug, s.status, s.legal_entity]),
      [
        ['Cajuru', 'cajuru-2', 'ativa', le.id],
        ['Loja Batel', 'loja-batel', 'ativa', le.id],
      ],
    )
    assert.equal(f.stores.find((s) => s.slug === 'loja-batel').whatsapp, '41 99999-0000')

    assert.equal(f.admins.length, 1)
    assert.equal(f.admins[0].email, 'ana@silva.dev', 'e-mail do proprietário em minúsculas')
    assert.equal(f.admins[0].name, 'Ana Silva')
  })

  test('o proprietário entra com a senha inicial, na franquia e com acesso às lojas dela', async () => {
    const ana = await login('ana@silva.dev')
    assert.equal(ana.record.org, ctx.silva.organization)
    assert.equal(ana.record.profile, 'admin')
    assert.deepEqual([...ana.record.stores].sort(), [...ctx.silva.stores].sort())
    ctx.ana = ana
  })

  test('duas lojas com o mesmo nome no mesmo cadastro recebem identificadores diferentes', async () => {
    const body = minimal('22333444000181', 'dono@mobisul.dev', 'Mobi Sul')
    body.stores = [{ name: 'Centro' }, { name: 'Centro' }]
    // Isenta de IE: um número digitado antes de marcar a isenção não é gravado.
    body.legal_entity.ie_isento = true
    body.legal_entity.ie = '123'
    const res = await api('POST', '/backend/v1/network/franchises', { token: ctx.admin.token, body })
    assert.equal(res.status, 201, res.text)
    ctx.mobiSul = res.json
    const f = (await listFranchises()).find((x) => x.id === res.json.organization)
    assert.deepEqual(f.stores.map((s) => s.slug).sort(), ['centro', 'centro-2'])
    assert.equal(f.legal_entities[0].ie_isento, true)
    assert.equal(f.legal_entities[0].ie, '')
    assert.equal(f.legal_entities[0].address, null, 'sem endereço informado, nada é gravado')
  })
})

describe('Erros de preenchimento', () => {
  test('cada erro diz o campo, e nada fica gravado pela metade', async () => {
    const before = (await listFranchises()).length
    const cases = [
      ['name', minimal('33444555000181', 'a@x.dev', 'silva mobilidade')],
      ['cnpj', minimal('11222333000181', 'b@x.dev')],
      ['cnpj', minimal('11.222.333/0001-00', 'c@x.dev')],
      ['email', minimal('33444555000181', 'ANA@silva.dev')],
      ['email', minimal('33444555000181', 'sem-arroba')],
      ['password', { ...minimal('33444555000181', 'd@x.dev'), owner: { name: 'D', email: 'd@x.dev', password: 'curta' } }],
      ['store_name', { ...minimal('33444555000181', 'e@x.dev'), stores: [{ name: '  ' }] }],
      ['stores', { ...minimal('33444555000181', 'f@x.dev'), stores: [] }],
      ['slug', { ...minimal('33444555000181', 'g@x.dev'), stores: [{ name: 'Outra', slug: 'jockey-plaza' }] }],
      ['razao_social', { ...minimal('33444555000181', 'h@x.dev'), legal_entity: { cnpj: '33444555000181' } }],
      ['regime', { ...minimal('33444555000181', 'i@x.dev'), legal_entity: { razao_social: 'I', cnpj: '33444555000181', regime: 'outro' } }],
      ['cep', { ...minimal('33444555000181', 'j@x.dev'), legal_entity: { razao_social: 'J', cnpj: '33444555000181', address: { cep: '80240' } } }],
      ['uf', { ...minimal('33444555000181', 'k@x.dev'), legal_entity: { razao_social: 'K', cnpj: '33444555000181', address: { uf: 'XX' } } }],
    ]
    for (const [field, body] of cases) {
      const res = await api('POST', '/backend/v1/network/franchises', { token: ctx.admin.token, body })
      assert.equal(res.status, 400, `${field}: ${res.text}`)
      assert.ok(res.json.data && res.json.data[field], `${field}: erro sem o campo (${res.text})`)
    }

    const dup = await api('POST', '/backend/v1/network/franchises', {
      token: ctx.admin.token,
      body: minimal('11222333000181', 'z@x.dev'),
    })
    assert.match(dup.json.message, /Silva Mobilidade/, 'CNPJ repetido diz onde já está')

    assert.equal((await listFranchises()).length, before, 'nenhuma franquia a mais')
    for (const email of ['a@x.dev', 'b@x.dev', 'c@x.dev', 'd@x.dev', 'e@x.dev']) {
      const res = await api('POST', '/api/collections/users/auth-with-password', {
        body: { identity: email, password: PASSWORD },
      })
      assert.equal(res.status, 400, `${email} não deveria existir`)
    }
  })
})

describe('Quem vê a lista', () => {
  test('só o admin da rede; franqueado, vendedor e visitante recebem 403', async () => {
    for (const [who, token] of [
      ['franqueado', ctx.ana.token],
      ['vendedor da New Way', ctx.seller.token],
      ['visitante', undefined],
    ]) {
      const res = await api('GET', '/backend/v1/network/franchises', { token })
      assert.equal(res.status, 403, `${who}: ${res.text}`)
    }
  })

  test('o franqueado continua sem ver a New Way e as outras franquias pela API', async () => {
    const res = await api('GET', '/api/collections/stores/records?perPage=500', { token: ctx.ana.token })
    ok(res, 'lojas do franqueado')
    assert.deepEqual(res.json.items.map((s) => s.org), [ctx.silva.organization, ctx.silva.organization])
    const orgs = await api('GET', '/api/collections/organizations/records', { token: ctx.ana.token })
    assert.deepEqual(orgs.json.items.map((o) => o.id), [ctx.silva.organization])
  })
})

describe('A rede ajusta o cadastro da franquia', () => {
  test('situação, empresa, loja existente e loja nova', async () => {
    const org = ctx.silva.organization
    const le = ctx.silva.legal_entity
    ok(
      await api('PATCH', `/api/collections/organizations/records/${org}`, {
        token: ctx.admin.token,
        body: { status: 'ativa', region: 'Curitiba e região' },
      }),
      'ativar a franquia',
    )
    ok(
      await api('PATCH', `/api/collections/legal_entities/records/${le}`, {
        token: ctx.admin.token,
        body: { razao_social: 'Silva Mobilidade Elétrica Ltda' },
      }),
      'corrigir a razão social',
    )
    ok(
      await api('PATCH', `/api/collections/stores/records/${ctx.silva.stores[0]}`, {
        token: ctx.admin.token,
        body: { phone: '41 3030-3030' },
      }),
      'editar loja da franquia',
    )
    const created = await api('POST', '/api/collections/stores/records', {
      token: ctx.admin.token,
      body: { org, legal_entity: le, name: 'Loja Água Verde' },
    })
    ok(created, 'loja nova na franquia')
    assert.equal(created.json.org, org)
    assert.equal(created.json.slug, 'loja-agua-verde')
    assert.equal(created.json.status, 'ativa')

    const f = (await listFranchises()).find((x) => x.id === org)
    assert.equal(f.status, 'ativa')
    assert.equal(f.region, 'Curitiba e região')
    assert.equal(f.legal_entities[0].razao_social, 'Silva Mobilidade Elétrica Ltda')
    assert.equal(f.stores.length, 3)
    assert.equal(f.stores.find((s) => s.id === ctx.silva.stores[0]).phone, '41 3030-3030')
  })

  test('loja nova não aponta para CNPJ de outra organização, e o franqueado não muda a própria situação', async () => {
    const own = await api('GET', `/api/collections/stores/records/${ctx.jockey.id}`, { token: ctx.admin.token })
    denied(
      await api('POST', '/api/collections/stores/records', {
        token: ctx.admin.token,
        body: { org: ctx.silva.organization, legal_entity: own.json.legal_entity, name: 'Loja Errada' },
      }),
      'loja da franquia com CNPJ da New Way',
    )
    denied(
      await api('PATCH', `/api/collections/organizations/records/${ctx.silva.organization}`, {
        token: ctx.ana.token,
        body: { status: 'encerrada' },
      }),
      'franqueado mudando a situação da franquia',
    )
  })
})

describe('Número do CNPJ (CNPJ-03)', () => {
  test('corrigível enquanto a empresa não tem movimento; travado depois da primeira venda', async () => {
    const le = ctx.mobiSul.legal_entity
    ok(
      await api('PATCH', `/api/collections/legal_entities/records/${le}`, {
        token: ctx.admin.token,
        body: { cnpj: '44.555.666/0001-81' },
      }),
      'corrigir digitação sem movimento',
    )

    const owner = await login('dono@mobisul.dev')
    const customer = await api('POST', '/api/collections/customers/records', {
      token: owner.token,
      body: { name: 'Cliente Mobi Sul', phone: '+5547999990000' },
    })
    ok(customer, 'cliente')
    const sale = await api('POST', '/api/collections/sales/records', {
      token: owner.token,
      body: {
        number: 'MS-0001',
        customer: customer.json.id,
        store: ctx.mobiSul.stores[0],
        seller: owner.id,
        status: 'rascunho',
        total: 1,
        payment: 'pix',
      },
    })
    ok(sale, 'venda')
    assert.equal(sale.json.legal_entity, le)

    for (const [who, token] of [
      ['rede', ctx.admin.token],
      ['proprietário', owner.token],
    ]) {
      const res = await api('PATCH', `/api/collections/legal_entities/records/${le}`, {
        token,
        body: { cnpj: '55.666.777/0001-81' },
      })
      assert.equal(res.status, 400, `${who}: ${res.text}`)
      assert.ok(res.json.data.cnpj, `${who}: erro aponta o CNPJ`)
    }
    ok(
      await api('PATCH', `/api/collections/legal_entities/records/${le}`, {
        token: owner.token,
        body: { cnpj: '44555666000181', nome_fantasia: 'Mobi Sul Joinville' },
      }),
      'mesmo número (sem pontuação) e outros dados continuam editáveis',
    )
    const after = await api('GET', `/api/collections/legal_entities/records/${le}`, { token: owner.token })
    assert.equal(after.json.cnpj, '44555666000181')
    assert.equal(after.json.nome_fantasia, 'Mobi Sul Joinville')
  })
})

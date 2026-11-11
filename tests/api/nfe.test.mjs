// NF-e automática pelo Bling (dono, 11/11/2026): a aprovação do
// administrador manda a nota direto para a Sefaz; a do gerente deixa a nota
// esperando o administrador. Chassi na observação, desconto e NCM certos,
// PDF e XML anexados; erro com o motivo e nova tentativa sem nota duplicada.
// Um servidor HTTP de mentira faz o papel do Bling e da Sefaz.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { SETUP_TOKEN, client, runPocketBase, startPocketBase } from './harness.mjs'

const PASSWORD = 'SenhaForte!2026'
const CLIENT_ID = 'cid0123456789abcdef0123456789abcdef01234'
const CLIENT_SECRET = 'segredo0123456789ABCDEFGHIJabcdefghij0123456789xyz'
const NATUREZA = 15109912299
let pb
let api
let fake
const ctx = {}

function startFakeBling() {
  const b = {
    valid: new Set(),
    notes: new Map(),
    creates: [],
    puts: [],
    sends: [],
    mode: 'autorizar',
    nextId: 27355000000,
    nextNumber: 289,
  }
  const send = (res, status, json) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(json))
  }
  const note = (id) => {
    const n = b.notes.get(id)
    return {
      id,
      situacao: n.situacao,
      numero: n.numero || '',
      chaveAcesso: n.chave || '',
      linkPDF: n.numero ? `${b.url}/docs/${id}.pdf` : '',
      xml: n.numero ? `${b.url}/docs/${id}.xml` : '',
    }
  }
  b.server = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const url = new URL(req.url, 'http://bling')
    const path = url.pathname
    if (req.method === 'POST' && path === '/oauth/token') {
      b.n = (b.n || 0) + 1
      b.valid.add('access-' + b.n)
      return send(res, 200, { access_token: 'access-' + b.n, refresh_token: 'refresh-' + b.n, expires_in: 21600 })
    }
    if (path.startsWith('/docs/')) {
      const pdf = path.endsWith('.pdf')
      res.writeHead(200, { 'Content-Type': pdf ? 'application/pdf' : 'application/xml' })
      return res.end(
        pdf
          ? '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
          : '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe/></nfeProc>',
      )
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '')
    if (!b.valid.has(token)) return send(res, 401, { error: { type: 'invalid_token' } })
    if (req.method === 'GET' && path === '/api/empresas/me/dados-basicos') {
      return send(res, 200, { data: { nome: 'NEW WAY ELETRIC LTDA', cnpj: '65.321.600/0001-05' } })
    }
    if (req.method === 'GET' && path === '/api/naturezas-operacoes') {
      return send(res, 200, {
        data: [
          { id: 777, situacao: 1, padrao: 1, descricao: 'Venda padrão' },
          { id: NATUREZA, situacao: 1, padrao: 0, descricao: 'Venda de mercadoria' },
        ],
      })
    }
    if (req.method === 'GET' && path === '/api/nfe') {
      return send(res, 200, { data: [{ id: 1, naturezaOperacao: { id: NATUREZA } }] })
    }
    if (req.method === 'POST' && path === '/api/nfe') {
      const json = JSON.parse(body)
      b.creates.push(json)
      const id = ++b.nextId
      b.notes.set(id, { situacao: 1, body: json })
      return send(res, 201, { data: { id, numero: '', serie: '1' } })
    }
    const m = path.match(/^\/api\/nfe\/(\d+)(\/enviar)?$/)
    if (m && b.notes.has(Number(m[1]))) {
      const id = Number(m[1])
      const n = b.notes.get(id)
      if (req.method === 'PUT' && !m[2]) {
        b.puts.push({ id, body: JSON.parse(body) })
        n.body = JSON.parse(body)
        n.situacao = 1
        return send(res, 200, { data: { id } })
      }
      if (req.method === 'POST' && m[2]) {
        b.sends.push(id)
        if (b.mode === 'rejeitar') {
          n.situacao = 4
          return send(res, 400, {
            error: {
              type: 'VALIDATION_ERROR',
              message: 'Não foi possível enviar a nota',
              description: 'Rejeição 778: Informado NCM inexistente',
            },
          })
        }
        n.numero = String(b.nextNumber++).padStart(6, '0')
        n.chave = '4126116532160000010555001' + n.numero.padStart(9, '0') + '1' + '0'.repeat(8) + '7'
        n.situacao = b.mode === 'fila' ? 8 : 6
        return send(res, 200, { data: { xml: '<xml/>' } })
      }
      if (req.method === 'GET' && !m[2]) {
        if (b.failGet) return send(res, 500, { error: { type: 'SERVER_ERROR', message: 'Erro interno' } })
        return send(res, 200, { data: note(id) })
      }
    }
    send(res, 404, { error: { type: 'RESOURCE_NOT_FOUND' } })
  })
  return new Promise((resolve) => {
    b.server.listen(0, '127.0.0.1', () => {
      b.url = `http://127.0.0.1:${b.server.address().port}`
      resolve(b)
    })
  })
}

const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)

// Venda do vendedor: patinete com chassi (R$ 1.000, desconto de R$ 50) e
// 2 capacetes (R$ 100 cada).
const newSale = async (token, customer, serial, store = ctx.jp) => {
  const res = await api('POST', '/backend/v1/sales', {
    token,
    body: {
      idempotency_key: randomUUID(),
      store,
      customer,
      items: [
        { product: ctx.scooter, quantity: 1, discount: 50, serial_number: serial },
        { product: ctx.helmet, quantity: 2, discount: 0 },
      ],
      payments: [{ method: 'pix', amount: 1150 }],
      discount_reason: 'Cliente da casa',
    },
  })
  ok(res, 'venda')
  return res.json.id
}
const approve = (token, id) => api('POST', `/backend/v1/sales/${id}/approve`, { token, body: {} })
const emit = (token, id) => api('POST', `/backend/v1/sales/${id}/nfe`, { token })
const getSale = async (id) => (await api('GET', `/api/collections/sales/records/${id}`, { token: ctx.admin })).json

before(async () => {
  fake = await startFakeBling()
  process.env.BLING_OAUTH_BASE = fake.url + '/oauth'
  process.env.BLING_API_BASE = fake.url + '/api'
  process.env.BLING_DOC_SOURCES = fake.url + '/docs/'
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  ok(setup, 'setup')
  ctx.admin = setup.json.token
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin })).json.items
  ctx.jp = stores.find((s) => s.slug === 'jockey-plaza').id

  // Conecta o Bling (o "Bling" autoriza na hora).
  ok(
    await api('POST', '/backend/v1/bling/credentials', {
      token: ctx.admin,
      body: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
    }),
    'chaves',
  )
  const connect = await api('POST', '/backend/v1/bling/connect', { token: ctx.admin })
  const state = new URL(connect.json.url).searchParams.get('state')
  const back = await fetch(`${pb.baseUrl}/backend/v1/bling/callback?code=ok&state=${state}`, { redirect: 'manual' })
  assert.match(back.headers.get('location'), /bling=conectado/)

  const user = async (email, profile) => {
    ok(
      await api('POST', '/api/collections/users/records', {
        token: ctx.admin,
        body: { email, name: email, password: PASSWORD, passwordConfirm: PASSWORD, profile, stores: [ctx.jp] },
      }),
      `usuário ${email}`,
    )
    return (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: email, password: PASSWORD } }))
      .json.token
  }
  ctx.seller = await user('vendedor@newway.dev', 'vendedor')
  ctx.manager = await user('gerente@newway.dev', 'gerente')

  const product = async (body) => {
    const res = await api('POST', '/api/collections/products/records', { token: ctx.admin, body: { status: 'ativo', ...body } })
    ok(res, 'produto')
    ok(
      await api('POST', '/api/collections/stock_items/records', {
        token: ctx.admin,
        body: { product: res.json.id, store: ctx.jp, quantity: 50 },
      }),
      'estoque',
    )
    return res.json.id
  }
  ctx.scooter = await product({ name: 'Patinete G4 Max', sku: 'NW-G4', sale_price: 1000, cost_price: 600, track_serial: true })
  ctx.helmet = await product({ name: 'Capacete Urbano', sku: 'NW-CAP', sale_price: 100, cost_price: 40, ncm: '6506.10.00' })

  const customer = async (body) => {
    const res = await api('POST', '/api/collections/customers/records', { token: ctx.admin, body })
    ok(res, 'cliente')
    return res.json.id
  }
  ctx.complete = await customer({
    name: 'Maria Cliente',
    phone: '(41) 99999-0000',
    document: '529.982.247-25',
    email: 'maria@exemplo.dev',
    cep: '80410-220',
    street: '  Rua  Desembargador Clotário Portugal ',
    street_number: '53',
    complement: 'ap 401',
    district: 'Centro',
    city: 'Curitiba',
    uf: 'pr',
  })
  ctx.incomplete = await customer({ name: 'João Sem Endereço', phone: '41988887777', document: '111.444.777-35' })
})

after(async () => {
  if (pb) await pb.stop()
  fake?.server.close()
})

test('endereço do cliente guardado do jeito da nota; UF e CEP conferidos', async () => {
  const c = (await api('GET', `/api/collections/customers/records/${ctx.complete}`, { token: ctx.admin })).json
  assert.equal(c.cep, '80410220')
  assert.equal(c.uf, 'PR')
  assert.equal(c.street, 'Rua Desembargador Clotário Portugal')
  for (const [field, value] of [
    ['uf', 'XX'],
    ['cep', '1234'],
  ]) {
    const res = await api('PATCH', `/api/collections/customers/records/${ctx.incomplete}`, {
      token: ctx.admin,
      body: { [field]: value },
    })
    assert.equal(res.status, 400, field)
  }
})

test('naturezas do Bling, com a da última nota marcada; configurar as notas', async () => {
  const res = await api('GET', '/backend/v1/bling/naturezas', { token: ctx.admin })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.items.length, 2)
  assert.equal(res.json.lastUsedId, NATUREZA)
  assert.equal((await api('GET', '/backend/v1/bling/naturezas', { token: ctx.seller })).status, 403)
  const bad = await api('POST', '/backend/v1/bling/nfe-settings', {
    token: ctx.admin,
    body: { natureza_id: NATUREZA, ncm_default: '8711' },
  })
  assert.equal(bad.status, 400)
  const saved = await api('POST', '/backend/v1/bling/nfe-settings', {
    token: ctx.admin,
    body: { natureza_id: NATUREZA, natureza_name: 'Venda de mercadoria', ncm_default: '87116000' },
  })
  assert.equal(saved.status, 200, saved.text)
  assert.equal(saved.json.nfeNaturezaId, NATUREZA)
  assert.equal(saved.json.nfeNcmDefault, '8711.60.00')
})

test('só o administrador emite a nota', async () => {
  const id = await newSale(ctx.seller, ctx.complete, 'CH-0000')
  for (const token of [ctx.seller, ctx.manager]) {
    assert.equal((await emit(token, id)).status, 403)
    assert.equal((await api('GET', `/backend/v1/sales/${id}/nfe/check`, { token })).status, 403)
  }
  // Antes de aprovar não sai nota.
  const res = await emit(ctx.admin, id)
  assert.equal(res.status, 400, res.text)
  assert.equal(fake.creates.length, 0)
  ctx.waiting = id
})

test('o administrador aprova: a nota vai para a Sefaz com chassi, desconto e NCM', async () => {
  const res = await approve(ctx.admin, ctx.waiting)
  assert.equal(res.status, 200, res.text)
  assert.deepEqual(res.json.nf, { status: 'autorizada', number: '000289', error: '' })

  assert.equal(fake.creates.length, 1)
  const body = fake.creates[0]
  assert.equal(body.tipo, 1)
  assert.equal(body.numero, undefined, 'o número é o Bling quem dá')
  assert.equal(body.naturezaOperacao.id, NATUREZA)
  assert.deepEqual(body.contato, {
    nome: 'Maria Cliente',
    tipoPessoa: 'F',
    numeroDocumento: '52998224725',
    contribuinte: 9,
    telefone: '41999990000',
    email: 'maria@exemplo.dev',
    endereco: {
      endereco: 'Rua Desembargador Clotário Portugal',
      numero: '53',
      complemento: 'ap 401',
      bairro: 'Centro',
      cep: '80410220',
      municipio: 'Curitiba',
      uf: 'PR',
    },
  })
  assert.deepEqual(
    body.itens.map((i) => [i.codigo, i.quantidade, i.valor, i.classificacaoFiscal, i.unidade, i.origem]),
    [
      ['NW-G4', 1, 1000, '8711.60.00', 'UN', 0],
      ['NW-CAP', 2, 100, '6506.10.00', 'UN', 0],
    ],
  )
  assert.equal(body.desconto, 50)
  assert.match(body.observacoes, /Chassi: CH-0000 \(Patinete G4 Max\)\./)
  assert.match(body.dataOperacao, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  assert.deepEqual(fake.sends, [fake.nextId])

  const sale = await getSale(ctx.waiting)
  assert.equal(sale.nf_status, 'autorizada')
  assert.equal(sale.invoice_number, '000289')
  assert.match(sale.nf_key, /^\d{44}$/)
  assert.ok(sale.nf_issued_at)

  // PDF e XML na venda; o vendedor vê os da venda dele.
  const docs = await api(
    'GET',
    `/api/collections/sale_documents/records?filter=${encodeURIComponent(`sale = '${ctx.waiting}'`)}`,
    { token: ctx.seller },
  )
  assert.equal(docs.status, 200, docs.text)
  assert.deepEqual(docs.json.items.map((d) => d.label).sort(), ['NF-e 000289 (PDF)', 'NF-e 000289 (XML)'])
  assert.ok(docs.json.items.every((d) => d.doc_type === 'nota_fiscal' && d.file))

  // Clicar de novo não cria outra nota.
  const again = await emit(ctx.admin, ctx.waiting)
  assert.equal(again.status, 200, again.text)
  assert.equal(again.json.status, 'autorizada')
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.sends.length, 1)
})

test('cliente sem endereço: o erro diz o que falta; corrigido, sai uma nota só', async () => {
  const id = await newSale(ctx.seller, ctx.incomplete, 'CH-0001')
  const check = await api('GET', `/backend/v1/sales/${id}/nfe/check`, { token: ctx.admin })
  assert.equal(check.status, 200, check.text)
  assert.deepEqual(check.json.problems, ['endereço do cliente (CEP, rua, número, bairro, cidade, UF)'])

  const res = await approve(ctx.admin, id)
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.nf.status, 'erro')
  assert.match(res.json.nf.error, /^Falta para a nota sair: endereço do cliente \(CEP, rua/)
  assert.equal(fake.creates.length, 1, 'nada foi para o Bling')
  assert.equal((await getSale(id)).status, 'confirmada', 'a venda continua aprovada')

  ok(
    await api('PATCH', `/api/collections/customers/records/${ctx.incomplete}`, {
      token: ctx.seller,
      body: { cep: '83505540', street: 'Rua Monte Sião', street_number: '351', district: 'Campina', city: 'Almirante Tamandaré', uf: 'PR' },
    }),
    'vendedor completa o endereço',
  )
  const retry = await emit(ctx.admin, id)
  assert.equal(retry.status, 200, retry.text)
  assert.equal(retry.json.status, 'autorizada')
  assert.equal(fake.creates.length, 2)
})

test('a Sefaz rejeita: o motivo fica na venda; tentar de novo corrige a mesma nota', async () => {
  fake.mode = 'rejeitar'
  const id = await newSale(ctx.seller, ctx.complete, 'CH-0002')
  const res = await approve(ctx.admin, id)
  assert.equal(res.json.nf.status, 'erro')
  assert.match(res.json.nf.error, /Rejeição 778: Informado NCM inexistente/)
  const sale = await getSale(id)
  assert.ok(sale.nf_bling_id)
  const creates = fake.creates.length

  fake.mode = 'autorizar'
  const retry = await emit(ctx.admin, id)
  assert.equal(retry.json.status, 'autorizada', retry.text)
  assert.equal(fake.creates.length, creates, 'não criou outra nota')
  assert.equal(fake.puts.at(-1).id, Number(sale.nf_bling_id), 'corrigiu a mesma nota')

  const logs = await api(
    'GET',
    `/api/collections/audit_logs/records?perPage=50&filter=${encodeURIComponent(`record_id = '${id}'`)}`,
    { token: ctx.admin },
  )
  const reasons = logs.json.items.map((l) => l.reason)
  assert.ok(reasons.some((r) => /^NF-e não saiu: a Sefaz não autorizou/.test(r)))
  assert.ok(reasons.some((r) => /^NF-e \d{6} autorizada pela Sefaz$/.test(r)))
})

test('falha passageira ao consultar a nota no Bling: não cria outra', async () => {
  fake.mode = 'rejeitar'
  const id = await newSale(ctx.seller, ctx.complete, 'CH-0007')
  assert.equal((await approve(ctx.admin, id)).json.nf.status, 'erro')
  const creates = fake.creates.length
  fake.mode = 'autorizar'
  fake.failGet = true
  const res = await emit(ctx.admin, id)
  assert.equal(res.json.status, 'erro', res.text)
  assert.match(res.json.error, /^Não consegui ler a nota no Bling \(Erro interno\)/)
  assert.equal(fake.creates.length, creates, 'não criou outra nota')
  fake.failGet = false
  const retry = await emit(ctx.admin, id)
  assert.equal(retry.json.status, 'autorizada', retry.text)
  assert.equal(fake.creates.length, creates)
})

test('o gerente aprova: a nota espera o administrador; clique duplo não duplica', async () => {
  const id = await newSale(ctx.seller, ctx.complete, 'CH-0003')
  const creates = fake.creates.length
  const res = await approve(ctx.manager, id)
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.nf, null)
  assert.equal((await getSale(id)).nf_status, 'aguardando_admin')
  assert.equal(fake.creates.length, creates)

  const [a, b] = await Promise.all([emit(ctx.admin, id), emit(ctx.admin, id)])
  const statuses = [a, b].map((r) => (r.status === 200 ? r.json.status : r.status)).sort()
  assert.ok(statuses.includes('autorizada'), JSON.stringify(statuses))
  assert.equal(fake.creates.length, creates + 1, 'uma nota só')
})

test('os campos da nota não mudam pela API', async () => {
  for (const body of [{ nf_status: 'erro' }, { invoice_number: '999999' }, { nf_key: '1' }]) {
    const res = await api('PATCH', `/api/collections/sales/records/${ctx.waiting}`, { token: ctx.admin, body })
    assert.equal(res.status, 403, JSON.stringify(body))
  }
  // Rascunho válido passa; o mesmo rascunho com a situação da nota, não.
  const me = (await api('POST', '/api/collections/users/auth-refresh', { token: ctx.seller })).json.record
  const body = { status: 'rascunho', number: 'X-1', store: ctx.jp, seller: me.id, customer: ctx.complete, total: 1 }
  const draft = await api('POST', '/api/collections/sales/records', {
    token: ctx.seller,
    body: { ...body, nf_status: 'autorizada' },
  })
  assert.equal(draft.status, 403, draft.text)
  const plain = await api('POST', '/api/collections/sales/records', { token: ctx.seller, body })
  assert.equal(plain.status, 200, plain.text)
})

test('nota na fila da Sefaz: "Atualizar" e a rotina de 2 minutos conferem depois', async () => {
  fake.mode = 'fila'
  const first = await newSale(ctx.seller, ctx.complete, 'CH-0004')
  const second = await newSale(ctx.seller, ctx.complete, 'CH-0005')
  for (const id of [first, second]) {
    const res = await approve(ctx.admin, id)
    assert.equal(res.json.nf.status, 'emitindo', res.text)
  }
  fake.mode = 'autorizar'
  for (const id of [first, second]) {
    fake.notes.get(Number((await getSale(id)).nf_bling_id)).situacao = 6
  }
  // O administrador clica em "Atualizar".
  const now = await emit(ctx.admin, first)
  assert.equal(now.json.status, 'autorizada', now.text)

  // A rotina (disparada por um superusuário) pega a outra.
  await pb.stop({ keepData: true })
  await runPocketBase(pb.dir, ['superuser', 'upsert', 'su@newway.dev', PASSWORD])
  pb = await startPocketBase({ dir: pb.dir })
  api = client(pb.baseUrl)
  const su = (
    await api('POST', '/api/collections/_superusers/auth-with-password', {
      body: { identity: 'su@newway.dev', password: PASSWORD },
    })
  ).json.token
  // Envio de mais de 1 minuto atrás (o superusuário não passa pelas travas).
  ok(await api('PATCH', `/api/collections/sales/records/${second}`, { token: su, body: { nf_started_at: 1 } }), 'voltar o relógio')
  assert.equal((await api('POST', '/api/crons/nfe_sync', { token: su })).status, 204)
  let sale
  for (let i = 0; i < 50; i++) {
    sale = await getSale(second)
    if (sale.nf_status === 'autorizada') break
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.equal(sale.nf_status, 'autorizada')
  assert.ok(sale.invoice_number)
})

test('sem o Bling conectado, aprovar não tenta nota (NF anexada à mão, como antes)', async () => {
  ok(await api('POST', '/backend/v1/bling/disconnect', { token: ctx.admin }), 'desconectar')
  const id = await newSale(ctx.seller, ctx.complete, 'CH-0006')
  const creates = fake.creates.length
  const res = await approve(ctx.admin, id)
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.nf, null)
  assert.equal((await getSale(id)).nf_status, '')
  assert.equal(fake.creates.length, creates)
})

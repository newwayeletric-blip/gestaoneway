// Migration 0011: a tela antiga do Financeiro gravava em `store` a primeira
// loja da lista, e a escolha da pessoa só em `store_allocation`. O teste sobe
// o banco até a 0010, grava lançamentos como a tela antiga gravava, aplica a
// 0011 e confere; depois desfaz com `migrate down` e confere de novo.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SETUP_TOKEN, client, runPocketBase, startPocketBase } from './harness.mjs'

let pb
let api
const ctx = {}
const tx = {}

const PASSWORD = 'SenhaForte!2026'
const ok = (res, msg) =>
  assert.ok(res.status >= 200 && res.status < 300, `${msg}: esperado 2xx, veio ${res.status} ${res.text}`)

async function getTx(id) {
  const res = await api('GET', `/api/collections/financial_transactions/records/${id}`, { token: ctx.admin })
  ok(res, `ler lançamento ${id}`)
  return res.json
}

async function auditRows(reason) {
  const filter = encodeURIComponent(`entity = 'financial_transactions' && reason ~ '${reason}'`)
  const res = await api('GET', `/api/collections/audit_logs/records?perPage=200&filter=${filter}`, {
    token: ctx.admin,
  })
  ok(res, 'listar auditoria')
  return res.json.items
}

before(async () => {
  pb = await startPocketBase({ migrationsUpTo: '0010' })
  api = client(pb.baseUrl)

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
  ctx.admin = setup.json.token
  ctx.adminId = setup.json.record.id
  ctx.org = setup.json.record.org

  const stores = await api('GET', '/api/collections/stores/records', { token: ctx.admin })
  ctx.jockey = stores.json.items.find((s) => s.slug === 'jockey-plaza').id
  ctx.cajuru = stores.json.items.find((s) => s.slug === 'cajuru').id

  const legacy = async (key, store, allocation, date = '2026-10-10') => {
    const res = await api('POST', '/api/collections/financial_transactions/records', {
      token: ctx.admin,
      body: {
        description: `Despesa ${key}`,
        type: 'despesa',
        store: store || undefined,
        store_allocation: allocation || undefined,
        amount: 100,
        competence_date: date,
        due_date: date,
        status: 'pendente',
        paid_amount: 0,
        payment_method: 'pix',
        created_by: ctx.adminId,
      },
    })
    ok(res, `criar lançamento ${key}`)
    tx[key] = res.json
  }
  // Como a tela antiga gravava: `store` = primeira loja da lista.
  await legacy('cajuruGravadoNoJockey', ctx.jockey, 'cajuru')
  await legacy('jockeyGravadoNoCajuru', ctx.cajuru, 'jockey')
  await legacy('compartilhadoGravadoNoJockey', ctx.jockey, 'compartilhado')
  await legacy('mesFechado', ctx.jockey, 'cajuru', '2026-09-10')
  // Já certos: a escolha bate com a loja, sem escolha (ex.: lançamento de
  // venda) e o compartilhado como a tela grava desde a v0.0.10.
  await legacy('jockeyCerto', ctx.jockey, 'jockey')
  await legacy('semEscolha', ctx.jockey, '')
  await legacy('compartilhadoNovo', '', 'compartilhado')

  ok(
    await api('POST', '/api/collections/monthly_closings/records', {
      token: ctx.admin,
      body: { year: 2026, month: 9, status: 'fechado', closed_by: ctx.adminId, closed_at: '2026-10-01 12:00:00.000Z' },
    }),
    'fechar setembro',
  )

  // Aplica a 0011 sobre esses dados.
  await pb.stop({ keepData: true })
  pb = await startPocketBase({ dir: pb.dir })
  api = client(pb.baseUrl)
})

after(async () => {
  if (pb) await pb.stop()
})

describe('0011: loja dos lançamentos antigos do Financeiro', () => {
  test('a loja passa a ser a escolhida na tela antiga, e o compartilhado fica sem loja', async () => {
    assert.equal((await getTx(tx.cajuruGravadoNoJockey.id)).store, ctx.cajuru)
    assert.equal((await getTx(tx.jockeyGravadoNoCajuru.id)).store, ctx.jockey)
    assert.equal((await getTx(tx.compartilhadoGravadoNoJockey.id)).store, '')
    assert.equal((await getTx(tx.mesFechado.id)).store, ctx.cajuru)
  })

  test('lançamentos que já estavam certos não são regravados', async () => {
    for (const key of ['jockeyCerto', 'semEscolha', 'compartilhadoNovo']) {
      const now = await getTx(tx[key].id)
      assert.equal(now.store, tx[key].store, key)
      assert.equal(now.updated, tx[key].updated, `${key} foi regravado`)
    }
  })

  test('cada correção fica na auditoria como ação do sistema, com a loja anterior', async () => {
    const rows = await auditRows('Correção automática')
    assert.equal(rows.length, 4)
    const row = rows.find((r) => r.record_id === tx.compartilhadoGravadoNoJockey.id)
    assert.deepEqual(row.previous_values, { store: ctx.jockey })
    assert.deepEqual(row.new_values, { store: '', store_allocation: 'compartilhado' })
    assert.equal(row.action, 'alteracao')
    assert.equal(row.user, '')
    assert.equal(row.org, ctx.org)
  })

  test('o down desfaz só o que a correção deixou e registra a reversão', async () => {
    // Depois da correção, alguém escolhe outra loja para um dos lançamentos:
    // essa escolha fica.
    ok(
      await api('PATCH', `/api/collections/financial_transactions/records/${tx.compartilhadoGravadoNoJockey.id}`, {
        token: ctx.admin,
        body: { store: ctx.cajuru },
      }),
      'trocar a loja depois da correção',
    )

    await pb.stop({ keepData: true })
    await runPocketBase(pb.dir, ['migrate', 'down', '1'])
    pb = await startPocketBase({ dir: pb.dir, migrationsUpTo: '0010' })
    api = client(pb.baseUrl)

    assert.equal((await getTx(tx.cajuruGravadoNoJockey.id)).store, ctx.jockey)
    assert.equal((await getTx(tx.jockeyGravadoNoCajuru.id)).store, ctx.cajuru)
    assert.equal((await getTx(tx.mesFechado.id)).store, ctx.jockey)
    assert.equal((await getTx(tx.compartilhadoGravadoNoJockey.id)).store, ctx.cajuru)
    assert.equal((await auditRows('Reversão')).length, 3)
  })
})

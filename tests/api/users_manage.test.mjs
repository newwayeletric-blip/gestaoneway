// O admin troca a senha dos usuários da própria organização sem saber a
// antiga (migration 0013). Ninguém mais troca a senha de outra pessoa, e um
// admin comum não troca a do admin da rede.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

const PASSWORD = 'SenhaForte!2026'
const NEW_PASSWORD = 'NovaSenha!2026'
let pb
let api
const ctx = {}

const login = (email, password) =>
  api('POST', '/api/collections/users/auth-with-password', { body: { identity: email, password } })
const setPassword = (token, id, password, extra = {}) =>
  api('PATCH', `/api/collections/users/records/${id}`, {
    token,
    body: { password, passwordConfirm: password, ...extra },
  })

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  assert.equal(setup.status, 200, setup.text)
  ctx.owner = { token: setup.json.token, id: setup.json.record.id }
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.owner.token })).json.items

  const create = async (email, profile) => {
    const res = await api('POST', '/api/collections/users/records', {
      token: ctx.owner.token,
      body: { email, name: email, password: PASSWORD, passwordConfirm: PASSWORD, profile, stores: [stores[0].id] },
    })
    assert.equal(res.status, 200, res.text)
    return { id: res.json.id, token: (await login(email, PASSWORD)).json.token }
  }
  ctx.seller = await create('vendedor@newway.dev', 'vendedor')
  ctx.other = await create('outro@newway.dev', 'vendedor')
  ctx.manager = await create('gerente@newway.dev', 'admin')
})

after(async () => {
  if (pb) await pb.stop()
})

test('admin troca a senha do vendedor sem a senha antiga', async () => {
  const res = await setPassword(ctx.owner.token, ctx.seller.id, NEW_PASSWORD)
  assert.equal(res.status, 200, res.text)
  assert.equal((await login('vendedor@newway.dev', NEW_PASSWORD)).status, 200)
  assert.equal((await login('vendedor@newway.dev', PASSWORD)).status, 400)
})

test('vendedor não troca a senha de outro vendedor', async () => {
  const res = await setPassword(ctx.other.token, ctx.seller.id, 'Invasao!2026x')
  assert.ok(res.status >= 400, `status ${res.status}`)
  assert.equal((await login('vendedor@newway.dev', NEW_PASSWORD)).status, 200)
})

test('a própria senha continua pedindo a senha antiga', async () => {
  const without = await setPassword(ctx.other.token, ctx.other.id, 'Trocada!2026x')
  assert.equal(without.status, 400, without.text)
  const withOld = await setPassword(ctx.other.token, ctx.other.id, 'Trocada!2026x', { oldPassword: PASSWORD })
  assert.equal(withOld.status, 200, withOld.text)
})

test('admin comum não troca a senha do admin da rede', async () => {
  const res = await setPassword(ctx.manager.token, ctx.owner.id, 'Tomada!2026xx')
  assert.ok(res.status >= 400, `status ${res.status}`)
  assert.equal((await login('dono@newway.dev', PASSWORD)).status, 200)
})

// Erros de tela enviados pelo navegador (ErrorBoundary) vão para o log do
// servidor; só usuário logado pode enviar.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

let pb
let api
let token

before(async () => {
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: 'SenhaForte!2026', passwordConfirm: 'SenhaForte!2026' },
  })
  assert.equal(setup.status, 200, setup.text)
  token = setup.json.token
})

after(async () => {
  if (pb) await pb.stop()
})

test('erro de tela de usuário logado vai para o log do servidor', async () => {
  const res = await api('POST', '/backend/v1/client-errors', {
    token,
    body: { message: 'Teste: tela caiu', stack: 'x'.repeat(5000), path: '/estoque' },
  })
  assert.equal(res.status, 204, res.text)
  await new Promise((r) => setTimeout(r, 300))
  const line = pb.log().split('\n').find((l) => l.includes('[erro-de-tela]'))
  assert.ok(line, 'linha no log do servidor')
  assert.ok(line.includes('Teste: tela caiu') && line.includes('/estoque'))
  assert.ok(!line.includes('x'.repeat(2001)), 'pilha cortada')
})

test('sem login é recusado', async () => {
  const res = await api('POST', '/backend/v1/client-errors', { body: { message: 'spam' } })
  assert.equal(res.status, 401, res.text)
})

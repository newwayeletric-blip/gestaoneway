// Importação de produtos por planilha (catálogo + Bling): só o admin; prévia
// sem gravar; cria e atualiza pelo SKU; preço no formato brasileiro;
// categoria criada se faltar; auditoria; foto só de endereço conhecido.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

const PASSWORD = 'SenhaForte!2026'
// PNG de 1 x 1 pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
let pb
let api
let photos
const ctx = {}

const run = (token, rows, dryRun = false) =>
  api('POST', '/backend/v1/products/import', { token, body: { rows, dry_run: dryRun } })
const bySku = async (sku) =>
  (
    await api('GET', `/api/collections/products/records?expand=category&filter=${encodeURIComponent(`sku = '${sku}'`)}`, {
      token: ctx.admin,
    })
  ).json.items[0]
const scooter = {
  sku: 'nw-teste-g4',
  nome: 'Honeywhale G4 Max',
  marca: 'Honeywhale',
  categoria: 'Patinete',
  descricao: 'Dois motores de 1640W, 72km/h',
  preco_venda: '9.999,00',
  custo: '6700',
  pede_chassi: 'sim',
}
const helmet = { sku: 'NW-TESTE-CAP', nome: 'Capacete Preto M', categoria: 'Acessório', preco_venda: '120,5', pede_chassi: 'não' }

before(async () => {
  photos = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' })
    res.end(PNG)
  })
  await new Promise((r) => photos.listen(0, '127.0.0.1', r))
  process.env.PRODUCT_PHOTO_SOURCES = `http://127.0.0.1:${photos.address().port}/fotos/`
  pb = await startPocketBase()
  delete process.env.PRODUCT_PHOTO_SOURCES
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  assert.equal(setup.status, 200, setup.text)
  ctx.admin = setup.json.token
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.admin })).json.items
  await api('POST', '/api/collections/users/records', {
    token: ctx.admin,
    body: { email: 'vendedor@newway.dev', name: 'Vendedor', password: PASSWORD, passwordConfirm: PASSWORD, profile: 'vendedor', stores: [stores[0].id] },
  })
  ctx.seller = (
    await api('POST', '/api/collections/users/auth-with-password', { body: { identity: 'vendedor@newway.dev', password: PASSWORD } })
  ).json.token
})

after(async () => {
  if (pb) await pb.stop()
  photos?.close()
})

test('só o administrador importa', async () => {
  assert.equal((await run(ctx.seller, [scooter])).status, 403)
})

test('a prévia aponta os erros e não grava nada', async () => {
  const res = await run(
    ctx.admin,
    [scooter, { sku: 'x y', nome: 'Errado' }, { ...helmet, sku: 'NW-TESTE-G4' }, { sku: 'NW-SEM-NOME' }, { ...helmet, preco_venda: 'abc' }],
    true,
  )
  assert.equal(res.status, 200, res.text)
  assert.deepEqual(res.json.summary, { criar: 1, atualizar: 0, erro: 4 })
  assert.deepEqual(
    res.json.results.map((r) => [r.line, r.action, r.errors.join(',')]),
    [
      [2, 'criar', ''],
      [3, 'erro', 'código (SKU) inválido'],
      [4, 'erro', 'código repetido na planilha (linha 2)'],
      [5, 'erro', 'falta o nome'],
      [6, 'erro', 'preço de venda inválido'],
    ],
  )
  assert.equal(await bySku('NW-TESTE-G4'), undefined)
})

test('cria pelo SKU, com preço brasileiro, categoria nova e auditoria', async () => {
  const res = await run(ctx.admin, [scooter, helmet])
  assert.equal(res.status, 200, res.text)
  assert.deepEqual(res.json.summary, { criar: 2, atualizar: 0, erro: 0 })
  const g4 = await bySku('NW-TESTE-G4')
  assert.equal(g4.name, 'Honeywhale G4 Max')
  assert.equal(g4.brand, 'Honeywhale')
  assert.equal(g4.sale_price, 9999)
  assert.equal(g4.cost_price, 6700)
  assert.equal(g4.track_serial, true)
  assert.equal(g4.discount_limit_custom, false, 'sem a coluna, vale o limite geral')
  assert.equal(g4.status, 'ativo')
  assert.equal(g4.expand.category.name, 'Patinete')
  const cap = await bySku('NW-TESTE-CAP')
  assert.equal(cap.sale_price, 120.5)
  assert.equal(cap.track_serial, false)
  assert.equal(cap.expand.category.name, 'Acessório')
  ctx.g4 = g4.id
  const audit = await api('GET', `/api/collections/audit_logs/records?filter=${encodeURIComponent("entity = 'products'")}`, {
    token: ctx.admin,
  })
  assert.equal(audit.json.items.length, 1)
  assert.match(audit.json.items[0].reason, /2 criados, 0 atualizados, 0 com erro/)
})

test('importar de novo atualiza; preço vazio mantém o atual', async () => {
  const bad = await run(ctx.admin, [{ ...scooter, limite_desconto: '120' }], true)
  assert.deepEqual(bad.json.results[0].errors, ['"limite_desconto" deve ser de 0 a 100'])
  const res = await run(ctx.admin, [
    { ...scooter, preco_venda: '10.499', custo: '', limite_desconto: '3,5%' },
    { ...helmet, preco_venda: '' },
  ])
  assert.equal(res.status, 200, res.text)
  assert.deepEqual(res.json.summary, { criar: 0, atualizar: 2, erro: 0 })
  const g4 = await bySku('NW-TESTE-G4')
  assert.equal(g4.id, ctx.g4)
  assert.equal(g4.sale_price, 10499)
  assert.equal(g4.cost_price, 6700)
  assert.equal(g4.discount_limit_custom, true)
  assert.equal(g4.discount_limit_pct, 3.5)
  assert.equal((await bySku('NW-TESTE-CAP')).sale_price, 120.5)
  const cats = await api('GET', `/api/collections/categories/records?filter=${encodeURIComponent("name = 'Patinete'")}`, {
    token: ctx.admin,
  })
  assert.equal(cats.json.items.length, 1, 'a categoria não duplica')
})

test('foto só de endereço conhecido', async () => {
  const photo = (token, url) => api('POST', '/backend/v1/products/photo-from-url', { token, body: { product: ctx.g4, url } })
  const base = `http://127.0.0.1:${photos.address().port}`
  assert.equal((await photo(ctx.seller, `${base}/fotos/g4.png`)).status, 403)
  assert.equal((await photo(ctx.admin, 'https://exemplo.com/fotos/g4.png')).status, 400)
  assert.equal((await photo(ctx.admin, `${base}/outra-pasta/g4.png`)).status, 400)
  assert.equal((await photo(ctx.admin, `${base}/fotos/../segredo.png`)).status, 400)
  const ok = await photo(ctx.admin, `${base}/fotos/g4.png`)
  assert.equal(ok.status, 200, ok.text)
  assert.match((await bySku('NW-TESTE-G4')).photo, /g4.*\.png$/)
})

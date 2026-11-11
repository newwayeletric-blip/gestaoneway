/**
 * Importação de produtos por planilha (dono, 11/11/2026): o sistema é o
 * cadastro mestre; a planilha revisada junta o catálogo (nome, marca,
 * especificações, preço, fotos) e o Bling (SKU, custo). Só o administrador.
 * - POST /backend/v1/products/import { rows, dry_run }: cada linha cria ou
 *   atualiza o produto da organização pelo SKU (categoria criada se faltar).
 *   dry_run devolve o que aconteceria, sem gravar. Um registro na auditoria
 *   resume a importação.
 * - POST /backend/v1/products/photo-from-url { product, url }: baixa a foto
 *   para o produto. Só de endereços conhecidos (o catálogo; a variável
 *   PRODUCT_PHOTO_SOURCES troca a lista, separada por vírgula), para o
 *   servidor não buscar arquivos em qualquer lugar.
 * Linha: { sku, nome, marca?, categoria?, descricao?, preco_venda?, custo?,
 *          pede_chassi? ("sim"/"não") }
 */
routerAdd('POST', '/backend/v1/products/import', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador importa produtos.')
  }
  const orgId = auth.getString('org')
  const body = e.requestInfo().body || {}
  const dryRun = body.dry_run === true
  const rows = body.rows && body.rows.length ? body.rows : []
  if (rows.length === 0) throw new BadRequestError('A planilha não tem linhas.')
  if (rows.length > 1000) throw new BadRequestError('Planilha grande demais: até 1000 produtos.')

  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  // Formato brasileiro: "6.700,00", "6700,5", "6.999" (ponto de milhar) ou
  // 6700 → número; vazio → null.
  const money = (v) => {
    let s = text(v).replace(/[R$\s]/g, '')
    if (!s) return null
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
    const n = Number(s)
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
  }

  const results = []
  const seen = {}
  const plan = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {}
    const line = i + 2
    const sku = text(r.sku).toUpperCase()
    const name = text(r.nome)
    const errors = []
    if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(sku)) errors.push('código (SKU) inválido')
    else if (seen[sku]) errors.push('código repetido na planilha (linha ' + seen[sku] + ')')
    if (!name) errors.push('falta o nome')
    const price = money(r.preco_venda)
    const cost = money(r.custo)
    if (Number.isNaN(price)) errors.push('preço de venda inválido')
    if (Number.isNaN(cost)) errors.push('custo inválido')
    const chassi = text(r.pede_chassi).toLowerCase()
    if (chassi && ['sim', 'não', 'nao'].indexOf(chassi) === -1)
      errors.push('"pede_chassi" deve ser sim ou não')
    if (sku) seen[sku] = seen[sku] || line

    let existing = null
    if (errors.length === 0) {
      const found = $app.findRecordsByFilter('products', 'org = {:org} && sku = {:sku}', '', 1, 0, {
        org: orgId,
        sku: sku,
      })
      existing = found.length > 0 ? found[0] : null
    }
    const result = {
      line: line,
      sku: sku,
      name: name,
      action: errors.length ? 'erro' : existing ? 'atualizar' : 'criar',
      errors: errors,
      product: existing ? existing.id : '',
      has_photo: !!existing && !!existing.getString('photo'),
    }
    results.push(result)
    if (errors.length === 0) {
      plan.push({
        result: result,
        existing: existing,
        name: name,
        brand: text(r.marca),
        category: text(r.categoria),
        description: text(r.descricao),
        price: price,
        cost: cost,
        chassi: chassi,
      })
    }
  }

  const summary = {
    criar: results.filter((r) => r.action === 'criar').length,
    atualizar: results.filter((r) => r.action === 'atualizar').length,
    erro: results.filter((r) => r.action === 'erro').length,
  }
  if (dryRun) return e.json(200, { dry_run: true, summary: summary, results: results })

  $app.runInTransaction((tx) => {
    const categories = {}
    const categoryId = (name) => {
      if (!name) return ''
      const key = name.toLowerCase()
      if (categories[key]) return categories[key]
      const all = tx.findRecordsByFilter('categories', 'org = {:org}', '', 0, 0, { org: orgId })
      for (const c of all) {
        if (c.getString('name').toLowerCase() === key) {
          categories[key] = c.id
          return c.id
        }
      }
      const rec = new Record(tx.findCollectionByNameOrId('categories'))
      rec.set('org', orgId)
      rec.set('name', name)
      tx.save(rec)
      categories[key] = rec.id
      return rec.id
    }

    const productsCol = tx.findCollectionByNameOrId('products')
    for (const p of plan) {
      const rec = p.existing
        ? tx.findRecordById('products', p.existing.id)
        : new Record(productsCol)
      if (!p.existing) {
        rec.set('org', orgId)
        rec.set('sku', p.result.sku)
        rec.set('status', 'ativo')
        rec.set('created_by', auth.id)
      }
      rec.set('name', p.name)
      if (p.brand) rec.set('brand', p.brand)
      if (p.category) rec.set('category', categoryId(p.category))
      if (p.description) rec.set('description', p.description)
      if (p.price !== null) rec.set('sale_price', p.price)
      if (p.cost !== null) rec.set('cost_price', p.cost)
      if (p.chassi) rec.set('track_serial', p.chassi === 'sim')
      tx.save(rec)
      p.result.product = rec.id
    }

    const audit = new Record(tx.findCollectionByNameOrId('audit_logs'))
    audit.set('org', orgId)
    audit.set('entity', 'products')
    audit.set('record_id', 'importacao')
    audit.set('action', 'criacao')
    audit.set('user', auth.id)
    audit.set(
      'reason',
      'Importação de produtos por planilha: ' +
        summary.criar +
        ' criados, ' +
        summary.atualizar +
        ' atualizados, ' +
        summary.erro +
        ' com erro',
    )
    audit.set('new_values', summary)
    audit.set('ip_address', e.realIP())
    tx.save(audit)
  })

  return e.json(200, { dry_run: false, summary: summary, results: results })
})

routerAdd('POST', '/backend/v1/products/photo-from-url', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador troca a foto do produto.')
  }
  const body = e.requestInfo().body || {}
  const url = String(body.url || '').trim()
  const sources = String($os.getenv('PRODUCT_PHOTO_SOURCES') || 'https://catalagonewway.com/')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s)
  if (!sources.some((s) => url.indexOf(s) === 0) || url.indexOf('..') >= 0) {
    throw new BadRequestError('Foto só do catálogo da New Way (' + sources.join(', ') + ').')
  }
  let product = null
  try {
    product = $app.findRecordById('products', String(body.product || ''))
  } catch (_) {
    throw new NotFoundError('Produto não encontrado.')
  }
  if (product.getString('org') !== auth.getString('org'))
    throw new NotFoundError('Produto não encontrado.')

  let file = null
  try {
    file = $filesystem.fileFromURL(url, 20)
  } catch (err) {
    throw new BadRequestError('Não consegui baixar a foto: ' + String(err).slice(0, 150))
  }
  product.set('photo', file)
  $app.save(product)
  return e.json(200, { product: product.id, photo: product.getString('photo') })
})

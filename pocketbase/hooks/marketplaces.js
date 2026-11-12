/**
 * Marketplaces pelo Bling (dono, 11/11/2026), na tela Marketplaces (só o
 * administrador). A lógica fica em pocketbase/hooks/lib/marketplace.js.
 * - GET  /backend/v1/marketplaces               canais configurados e resumo
 * - GET  /backend/v1/marketplaces/discover      canais e depósitos do Bling
 * - POST /backend/v1/marketplaces/channels      cria ou altera um canal
 * - POST /backend/v1/marketplaces/channels/{id}/import  busca os pedidos agora
 * - GET  /backend/v1/marketplaces/orders        pedidos vistos (e pendências)
 * - POST /backend/v1/marketplaces/links         vincula produto do Bling ↔ sistema
 * - GET  /backend/v1/marketplaces/channels/{id}/stock   sistema × Bling
 * - POST /backend/v1/marketplaces/channels/{id}/stock   manda o estoque agora
 * - GET  /backend/v1/marketplaces/channels/{id}/check   permissões do Bling
 * - GET  /backend/v1/marketplaces/channels/{id}/listings  anúncios guardados
 * - POST /backend/v1/marketplaces/channels/{id}/listings  relê os anúncios
 * - POST /backend/v1/marketplaces/listings/{id}/{acao}    pausar | publicar
 * - cron marketplace_sync (a cada 5 minutos): pedidos de todo canal ativo e o
 *   estoque de quem ligou a sincronização.
 */
routerAdd('GET', '/backend/v1/marketplaces', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  const orgId = auth.getString('org')
  const bling = require(`${__hooks}/lib/bling.js`)
  const rec = bling.find($app, orgId)
  const channels = []
  for (const c of $app.findRecordsByFilter('sales_channels', 'org = {:org}', 'name', 0, 0, {
    org: orgId,
  })) {
    const count = (status) =>
      $app.findRecordsByFilter('marketplace_orders', 'channel = {:c} && status = {:s}', '', 0, 0, {
        c: c.id,
        s: status,
      }).length
    channels.push({
      id: c.id,
      bling_store_id: c.getString('bling_store_id'),
      name: c.getString('name'),
      kind: c.getString('kind'),
      active: c.getBool('active'),
      stock_store: c.getString('stock_store'),
      seller: c.getString('seller'),
      import_from: c.getString('import_from'),
      sync_stock: c.getBool('sync_stock'),
      bling_deposit_id: c.getString('bling_deposit_id'),
      last_import_at: c.getFloat('last_import_at'),
      last_stock_sync_at: c.getFloat('last_stock_sync_at'),
      last_error: c.getString('last_error'),
      imported: count('importado'),
      waiting: count('aguardando_vinculo'),
      errors: count('erro'),
    })
  }
  return e.json(200, { connected: !!(rec && rec.getString('refresh_token')), channels: channels })
})

routerAdd('GET', '/backend/v1/marketplaces/discover', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    return e.json(200, mk.discover($app, rec))
  } catch (err) {
    throw new BadRequestError('Não consegui ler o Bling: ' + String(err.message || err))
  }
})

routerAdd('POST', '/backend/v1/marketplaces/channels', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  const orgId = auth.getString('org')
  const body = e.requestInfo().body || {}
  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  const storeId = text(body.bling_store_id)
  if (!/^\d{1,20}$/.test(storeId)) throw new BadRequestError('Canal do Bling inválido.')
  const name = text(body.name).slice(0, 80)
  if (!name) throw new BadRequestError('Dê um nome ao canal (ex.: Mercado Livre).')
  const kinds = ['mercado_livre', 'amazon', 'shopee', 'magalu', 'outro']
  const kind = kinds.indexOf(text(body.kind)) >= 0 ? text(body.kind) : 'outro'
  const importFrom = text(body.import_from)
  if (importFrom && !/^\d{4}-\d{2}-\d{2}$/.test(importFrom)) {
    throw new BadRequestError('Data inicial inválida.')
  }
  const own = (collection, id, extra) => {
    if (!id) return ''
    try {
      const r = $app.findRecordById(collection, id)
      if (r.getString('org') !== orgId) return null
      if (extra && !extra(r)) return null
      return r.id
    } catch (_) {
      return null
    }
  }
  const stockStore = own('stores', text(body.stock_store))
  if (stockStore === null) throw new BadRequestError('Loja do estoque inválida.')
  const seller = own('users', text(body.seller), (u) => u.getString('status') === 'ativo')
  if (seller === null) throw new BadRequestError('Responsável inválido.')
  const active = body.active === true
  if (active && (!stockStore || !seller)) {
    throw new BadRequestError('Para ligar o canal, escolha a loja do estoque e o responsável.')
  }
  const syncStock = body.sync_stock === true
  const deposit = text(body.bling_deposit_id)
  if (deposit && !/^\d{1,20}$/.test(deposit)) throw new BadRequestError('Depósito inválido.')
  if (syncStock && !deposit) {
    throw new BadRequestError('Para mandar o estoque, escolha o depósito do Bling.')
  }

  const found = $app.findRecordsByFilter(
    'sales_channels',
    'org = {:org} && bling_store_id = {:id}',
    '',
    1,
    0,
    { org: orgId, id: storeId },
  )
  const rec =
    found.length > 0 ? found[0] : new Record($app.findCollectionByNameOrId('sales_channels'))
  const before = found.length > 0 ? rec.getBool('sync_stock') : false
  rec.set('org', orgId)
  rec.set('bling_store_id', storeId)
  rec.set('name', name)
  rec.set('kind', kind)
  rec.set('active', active)
  rec.set('stock_store', stockStore)
  rec.set('seller', seller)
  rec.set('import_from', importFrom)
  rec.set('sync_stock', syncStock)
  rec.set('bling_deposit_id', deposit)
  $app.save(rec)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  mk.audit(
    $app,
    orgId,
    'sales_channels',
    rec.id,
    auth.id,
    'Canal ' +
      name +
      (active ? ' ligado' : ' desligado') +
      (syncStock !== before
        ? syncStock
          ? '; estoque indo para o Bling'
          : '; estoque parou de ir para o Bling'
        : ''),
  )
  return e.json(200, { id: rec.id })
})

routerAdd('POST', '/backend/v1/marketplaces/channels/{id}/import', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  let channel = null
  try {
    channel = $app.findRecordById('sales_channels', e.request.pathValue('id'))
  } catch (_) {}
  if (!channel || channel.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Canal não encontrado.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    return e.json(200, mk.importChannel($app, rec, channel))
  } catch (err) {
    const fresh = $app.findRecordById('sales_channels', channel.id)
    fresh.set('last_error', String(err.message || err).slice(0, 400))
    $app.save(fresh)
    throw new BadRequestError('Os pedidos não vieram: ' + fresh.getString('last_error'))
  }
})

routerAdd('GET', '/backend/v1/marketplaces/orders', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  const status = String(e.request.url.query().get('status') || '')
  const statuses = ['importado', 'aguardando_vinculo', 'ignorado', 'cancelado', 'erro']
  const filter = 'org = {:org}' + (statuses.indexOf(status) >= 0 ? ' && status = {:status}' : '')
  const items = []
  for (const o of $app.findRecordsByFilter(
    'marketplace_orders',
    filter,
    '-order_date,-created',
    200,
    0,
    { org: auth.getString('org'), status: status },
  )) {
    let saleNumber = ''
    if (o.getString('sale')) {
      try {
        saleNumber = $app.findRecordById('sales', o.getString('sale')).getString('number')
      } catch (_) {}
    }
    items.push({
      id: o.id,
      channel: o.getString('channel'),
      bling_order_id: o.getString('bling_order_id'),
      external_number: o.getString('external_number'),
      order_date: o.getString('order_date'),
      total: o.getFloat('total'),
      customer_name: o.getString('customer_name'),
      status: o.getString('status'),
      sale: o.getString('sale'),
      sale_number: saleNumber,
      missing: o.get('missing'),
      note: o.getString('note'),
    })
  }
  return e.json(200, { items: items })
})

// { bling_product_id, bling_code, bling_name, product }: depois de vincular,
// os pedidos que esperavam por este produto entram na próxima busca.
routerAdd('POST', '/backend/v1/marketplaces/links', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  const orgId = auth.getString('org')
  const body = e.requestInfo().body || {}
  const blingId = String(body.bling_product_id || '').trim()
  if (!/^\d{1,20}$/.test(blingId)) throw new BadRequestError('Produto do Bling inválido.')
  let product = null
  try {
    product = $app.findRecordById('products', String(body.product || ''))
  } catch (_) {}
  if (!product || product.getString('org') !== orgId) {
    throw new BadRequestError('Escolha o produto do sistema.')
  }
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const link = mk.link($app, orgId, product.id, {
    produto: { id: blingId },
    codigo: body.bling_code,
    descricao: body.bling_name,
  })
  mk.audit(
    $app,
    orgId,
    'bling_product_links',
    link.id,
    auth.id,
    'Produto do Bling ' +
      (link.getString('bling_code') || blingId) +
      ' vinculado a ' +
      product.getString('name'),
  )
  return e.json(200, { id: link.id })
})

routerAdd('GET', '/backend/v1/marketplaces/channels/{id}/stock', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  let channel = null
  try {
    channel = $app.findRecordById('sales_channels', e.request.pathValue('id'))
  } catch (_) {}
  if (!channel || channel.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Canal não encontrado.')
  }
  if (!channel.getString('stock_store'))
    throw new BadRequestError('Escolha a loja do estoque do canal.')
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    return e.json(200, { items: mk.compareStock($app, rec, channel) })
  } catch (err) {
    throw new BadRequestError('Não consegui ler o estoque do Bling: ' + String(err.message || err))
  }
})

routerAdd('POST', '/backend/v1/marketplaces/channels/{id}/stock', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  let channel = null
  try {
    channel = $app.findRecordById('sales_channels', e.request.pathValue('id'))
  } catch (_) {}
  if (!channel || channel.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Canal não encontrado.')
  }
  if (!channel.getBool('sync_stock')) {
    throw new BadRequestError('Ligue "Mandar o estoque para o Bling" no canal antes.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    const res = mk.pushStock($app, rec, channel, true)
    mk.audit(
      $app,
      auth.getString('org'),
      'sales_channels',
      channel.id,
      auth.id,
      'Estoque mandado ao Bling: ' + res.sent + ' produto(s)',
    )
    return e.json(200, res)
  } catch (err) {
    throw new BadRequestError('O estoque não foi: ' + String(err.message || err))
  }
})

routerAdd('GET', '/backend/v1/marketplaces/channels/{id}/check', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  let channel = null
  try {
    channel = $app.findRecordById('sales_channels', e.request.pathValue('id'))
  } catch (_) {}
  if (!channel || channel.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Canal não encontrado.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    const checks = mk.checkPermissions($app, rec, channel)
    mk.audit(
      $app,
      auth.getString('org'),
      'sales_channels',
      channel.id,
      auth.id,
      'Permissões do Bling conferidas: ' +
        checks.map((c) => c.name + (c.ok ? ' ok' : ' (' + c.detail + ')')).join(', '),
    )
    return e.json(200, { items: checks })
  } catch (err) {
    throw new BadRequestError('Não consegui conferir: ' + String(err.message || err))
  }
})

routerAdd('GET', '/backend/v1/marketplaces/channels/{id}/listings', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  let channel = null
  try {
    channel = $app.findRecordById('sales_channels', e.request.pathValue('id'))
  } catch (_) {}
  if (!channel || channel.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Canal não encontrado.')
  }
  const items = []
  for (const l of $app.findRecordsByFilter(
    'marketplace_listings',
    'channel = {:ch}',
    'status,title',
    0,
    0,
    { ch: channel.id },
  )) {
    let product = null
    try {
      if (l.getString('product')) product = $app.findRecordById('products', l.getString('product'))
    } catch (_) {}
    let stock = null
    if (product && channel.getString('stock_store')) {
      stock = 0
      for (const row of $app.findRecordsByFilter(
        'stock_items',
        'store = {:store} && product = {:product}',
        '',
        0,
        0,
        { store: channel.getString('stock_store'), product: product.id },
      )) {
        stock += row.getFloat('quantity')
      }
    }
    items.push({
      id: l.id,
      listing_code: l.getString('listing_code'),
      title: l.getString('title'),
      status: l.getString('status'),
      price: l.getFloat('price'),
      promo_price: l.getFloat('promo_price'),
      product: product ? product.id : '',
      product_name: product ? product.getString('name') : '',
      sku: product ? product.getString('sku') : '',
      stock: stock,
      refreshed_at: l.getFloat('refreshed_at'),
    })
  }
  return e.json(200, { items: items })
})

routerAdd('POST', '/backend/v1/marketplaces/channels/{id}/listings', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  let channel = null
  try {
    channel = $app.findRecordById('sales_channels', e.request.pathValue('id'))
  } catch (_) {}
  if (!channel || channel.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Canal não encontrado.')
  }
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    return e.json(200, mk.refreshListings($app, rec, channel))
  } catch (err) {
    throw new BadRequestError('Os anúncios não vieram: ' + String(err.message || err))
  }
})

routerAdd('POST', '/backend/v1/marketplaces/listings/{id}/{action}', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador mexe nos marketplaces.')
  }
  const action = e.request.pathValue('action')
  if (['pausar', 'publicar'].indexOf(action) === -1) throw new NotFoundError('Ação desconhecida.')
  let listing = null
  try {
    listing = $app.findRecordById('marketplace_listings', e.request.pathValue('id'))
  } catch (_) {}
  if (!listing || listing.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Anúncio não encontrado.')
  }
  const channel = $app.findRecordById('sales_channels', listing.getString('channel'))
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  const rec = bling.find($app, auth.getString('org'))
  if (!rec || !rec.getString('refresh_token'))
    throw new BadRequestError('O Bling não está conectado.')
  try {
    mk.listingAction($app, rec, channel, listing, action)
  } catch (err) {
    const msg = String(err.message || err)
    throw new BadRequestError(msg.charAt(0).toUpperCase() + msg.slice(1) + '.')
  }
  mk.audit(
    $app,
    auth.getString('org'),
    'marketplace_listings',
    listing.id,
    auth.id,
    'Anúncio ' +
      listing.getString('listing_code') +
      (action === 'pausar' ? ' pausado' : ' publicado') +
      ' (' +
      listing.getString('title') +
      ')',
  )
  return e.json(200, { status: listing.getString('status') })
})

cronAdd('marketplace_sync', '*/5 * * * *', () => {
  const bling = require(`${__hooks}/lib/bling.js`)
  const mk = require(`${__hooks}/lib/marketplace.js`)
  for (const channel of $app.findRecordsByFilter('sales_channels', 'active = true', '', 0, 0)) {
    const rec = bling.find($app, channel.getString('org'))
    if (!rec || !rec.getString('refresh_token')) continue
    try {
      mk.importChannel($app, rec, channel)
      if (channel.getBool('sync_stock')) mk.pushStock($app, rec, channel, false)
    } catch (err) {
      try {
        const fresh = $app.findRecordById('sales_channels', channel.id)
        fresh.set('last_error', String(err.message || err).slice(0, 400))
        $app.save(fresh)
      } catch (_) {}
    }
  }
})

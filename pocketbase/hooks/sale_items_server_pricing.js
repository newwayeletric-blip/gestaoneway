/**
 * VEN-04 / D.8 cenário 8: o navegador manda só produto, variação,
 * quantidade e desconto pedido. Preço, nome, SKU, custo e total vêm do
 * catálogo. Desconto acima do limite configurado é recusado; sem limite
 * configurado, o vendedor não dá desconto (nada vem pré-preenchido).
 * A confirmação atômica da venda (VEN-01) é da Fase 1.
 */
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  const auth = e.auth
  const isAdmin = !!auth && auth.getString('profile') === 'admin'
  const round2 = (v) => Math.round(v * 100) / 100

  let product = null
  let variant = null
  const variantId = e.record.getString('variant')
  const productId = e.record.getString('product')
  if (variantId) {
    try {
      variant = $app.findRecordById('product_variants', variantId)
    } catch (_) {
      throw new BadRequestError('Variação de produto não encontrada.')
    }
    if (productId && variant.getString('product') !== productId) {
      throw new BadRequestError('A variação informada não pertence ao produto.')
    }
  }
  try {
    product = $app.findRecordById('products', variant ? variant.getString('product') : productId)
  } catch (_) {
    throw new BadRequestError('Produto não encontrado.')
  }
  if (product.getString('status') === 'inativo') {
    throw new BadRequestError('Produto inativo não pode ser vendido.')
  }

  const variantPrice = variant ? variant.getFloat('sale_price') : 0
  const price = variantPrice > 0 ? variantPrice : product.getFloat('sale_price')
  if (!(price > 0)) {
    throw new BadRequestError('Produto sem preço de venda cadastrado. Peça ao administrador.')
  }

  const qty = e.record.getFloat('quantity')
  if (!(qty > 0) || Math.floor(qty) !== qty) {
    throw new BadRequestError('Quantidade inválida.')
  }

  const gross = round2(price * qty)
  const discount = round2(e.record.getFloat('discount'))
  if (discount < 0 || discount > gross) {
    throw new BadRequestError('Desconto inválido para este item.')
  }

  if (!isAdmin && discount > 0) {
    let sale = null
    try {
      sale = $app.findRecordById('sales', e.record.getString('sale'))
    } catch (_) {
      throw new BadRequestError('Venda não encontrada.')
    }
    const method = sale.getString('payment') || 'pix'
    let limitPct = null
    // Limite configurado pela organização da venda (cada franquia tem o seu).
    const settings = $app.findRecordsByFilter(
      'settings',
      'org = {:org} && key = {:key}',
      '',
      1,
      0,
      { org: sale.getString('org'), key: 'max_discount_' + method },
    )
    if (settings.length > 0) {
      const parsed = parseFloat(settings[0].getString('value'))
      if (!isNaN(parsed) && parsed >= 0) limitPct = parsed
    }
    if (limitPct === null) {
      throw new BadRequestError(
        'Desconto não permitido: o limite de desconto para ' +
          method +
          ' não está configurado. Peça ao administrador.',
      )
    }
    const maxDiscount = round2((gross * limitPct) / 100)
    if (discount > maxDiscount) {
      throw new BadRequestError(
        'Desconto acima do permitido: máximo de ' +
          limitPct +
          '% (R$ ' +
          maxDiscount.toFixed(2) +
          ') neste item. Solicite aprovação do administrador.',
      )
    }
  }

  const variantCost = variant ? variant.getFloat('cost_price') : 0
  e.record.set('product', product.id)
  e.record.set(
    'product_name',
    variant ? product.getString('name') + ' - ' + variant.getString('name') : product.getString('name'),
  )
  e.record.set('sku', variant ? variant.getString('sku') : product.getString('sku'))
  e.record.set('sale_price', price)
  e.record.set('cost_price', variantCost > 0 ? variantCost : product.getFloat('cost_price'))
  e.record.set('discount', discount)
  e.record.set('total', round2(gross - discount))
  if (!isAdmin) {
    // Snapshots de custo/comissão serão gravados na confirmação (Fase 1).
    e.record.set('cost_price_snapshot', 0)
    e.record.set('commission_rate', 0)
    e.record.set('commission_value', 0)
    e.record.set('returned_quantity', 0)
  }
  return e.next()
}, 'sale_items')

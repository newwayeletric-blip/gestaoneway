/**
 * D.8 cenário 8: os totais da venda são a soma dos itens já precificados
 * pelo servidor (sale_items_server_pricing.js), não o que o navegador mandou.
 */
onRecordAfterCreateSuccess((e) => {
  try {
    const round2 = (v) => Math.round(v * 100) / 100
    const sale = $app.findRecordById('sales', e.record.getString('sale'))
    const items = $app.findRecordsByFilter('sale_items', 'sale = {:sale}', '', 0, 0, { sale: sale.id })
    let subtotal = 0
    let discount = 0
    for (const it of items) {
      subtotal += it.getFloat('sale_price') * it.getFloat('quantity')
      discount += it.getFloat('discount')
    }
    sale.set('subtotal', round2(subtotal))
    sale.set('total_discount', round2(discount))
    sale.set('total', round2(subtotal - discount))
    $app.saveNoValidate(sale)
  } catch (err) {
    $app.logger().error('Falha ao recalcular totais da venda', 'saleItem', e.record.id, 'error', String(err))
  } finally {
    e.next()
  }
}, 'sale_items')

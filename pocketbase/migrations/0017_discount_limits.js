// Limite de desconto (dono, 11/11/2026): um limite geral da organização
// (padrão 5%, para vendedor e gerente) e, se o administrador quiser, um limite
// próprio em cada produto, que substitui o geral para aquele produto. Sai o
// limite por forma de pagamento (as chaves max_discount_pix/... ficam
// guardadas, mas o servidor não as usa mais). Acima do limite, a venda vai
// para o administrador aprovar (hooks sales_submit.js e sales_actions.js).
migrate(
  (app) => {
    const products = app.findCollectionByNameOrId('products')
    if (!products.fields.getByName('discount_limit_custom')) {
      products.fields.add(new BoolField({ name: 'discount_limit_custom' }))
    }
    if (!products.fields.getByName('discount_limit_pct')) {
      products.fields.add(new NumberField({ name: 'discount_limit_pct', min: 0, max: 100 }))
    }
    app.save(products)

    const settings = app.findCollectionByNameOrId('settings')
    for (const org of app.findRecordsByFilter('organizations', "id != ''", '', 0, 0)) {
      const found = app.findRecordsByFilter(
        'settings',
        "org = {:org} && key = 'max_discount_general'",
        '',
        1,
        0,
        { org: org.id },
      )
      if (found.length > 0) continue
      const rec = new Record(settings)
      rec.set('org', org.id)
      rec.set('key', 'max_discount_general')
      rec.set('value', '5')
      app.save(rec)
    }
  },
  (app) => {
    for (const rec of app.findRecordsByFilter(
      'settings',
      "key = 'max_discount_general'",
      '',
      0,
      0,
    )) {
      app.delete(rec)
    }
    const products = app.findCollectionByNameOrId('products')
    for (const name of ['discount_limit_custom', 'discount_limit_pct']) {
      if (products.fields.getByName(name)) products.fields.removeByName(name)
    }
    app.save(products)
  },
)

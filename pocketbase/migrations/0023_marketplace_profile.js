// Perfil "marketplace" (dono, 24/11/2026): só a parte dos marketplaces. Na
// tela Marketplaces vê os pedidos e os anúncios, busca pedidos, vincula
// produto e pausa ou publica anúncio (hooks marketplaces.js); fora dela, só as
// vendas que vieram dos marketplaces (sales.channel preenchido). Não lança
// venda (sales_submit.js), não cadastra nem lista clientes: vê só o cliente de
// uma venda de marketplace (o comprador). Configurar canal e estoque continuam
// com o administrador.
// As regras antigas ficam como estão e ganham um "|| (...)" (o que ele passa a
// ver) ou um "(...) && ..." (o que ele deixa de ver); o down tira os dois.
migrate(
  (app) => {
    const ACTIVE = "@request.auth.id != '' && @request.auth.status = 'ativo'"
    const MARKETPLACE =
      ACTIVE + " && @request.auth.profile = 'marketplace' && org = @request.auth.org"
    const extend = (name, rules, extra) => {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of rules) {
        const key = rule + 'Rule'
        col[key] = col[key] ? '(' + col[key] + ') || (' + extra + ')' : extra
      }
      app.save(col)
    }
    const restrict = (name, rules, cond) => {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of rules) {
        const key = rule + 'Rule'
        if (col[key]) col[key] = '(' + col[key] + ') && ' + cond
      }
      app.save(col)
    }

    const users = app.findCollectionByNameOrId('users')
    const profile = users.fields.getByName('profile')
    const values = []
    for (let i = 0; i < profile.values.length; i++) values.push(profile.values[i])
    if (values.indexOf('marketplace') === -1) values.push('marketplace')
    profile.values = values
    app.save(users)

    extend('sales', ['list', 'view'], MARKETPLACE + " && channel != ''")
    for (const name of ['sale_items', 'sale_payments', 'sale_documents']) {
      extend(name, ['list', 'view'], MARKETPLACE + " && sale.channel != ''")
    }
    restrict('customers', ['list', 'create', 'update'], "@request.auth.profile != 'marketplace'")
    restrict(
      'customers',
      ['view'],
      "(@request.auth.profile != 'marketplace' || sales_via_customer.channel ?!= '')",
    )
    restrict('customer_change_requests', ['create'], "@request.auth.profile != 'marketplace'")
  },
  (app) => {
    const ACTIVE = "@request.auth.id != '' && @request.auth.status = 'ativo'"
    const MARKETPLACE =
      ACTIVE + " && @request.auth.profile = 'marketplace' && org = @request.auth.org"
    const shrink = (name, rules, extra) => {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of rules) {
        const key = rule + 'Rule'
        const tail = ') || (' + extra + ')'
        const current = col[key] || ''
        if (current === extra) col[key] = null
        else if (current.indexOf('(') === 0 && current.slice(-tail.length) === tail) {
          col[key] = current.slice(1, -tail.length)
        }
      }
      app.save(col)
    }
    const unrestrict = (name, rules, cond) => {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of rules) {
        const key = rule + 'Rule'
        const tail = ') && ' + cond
        const current = col[key] || ''
        if (current.indexOf('(') === 0 && current.slice(-tail.length) === tail) {
          col[key] = current.slice(1, -tail.length)
        }
      }
      app.save(col)
    }

    unrestrict('customer_change_requests', ['create'], "@request.auth.profile != 'marketplace'")
    unrestrict(
      'customers',
      ['view'],
      "(@request.auth.profile != 'marketplace' || sales_via_customer.channel ?!= '')",
    )
    unrestrict('customers', ['list', 'create', 'update'], "@request.auth.profile != 'marketplace'")
    for (const name of ['sale_items', 'sale_payments', 'sale_documents']) {
      shrink(name, ['list', 'view'], MARKETPLACE + " && sale.channel != ''")
    }
    shrink('sales', ['list', 'view'], MARKETPLACE + " && channel != ''")

    // Quem era Marketplace volta a vendedor, inativo: o admin decide se reativa.
    for (const u of app.findRecordsByFilter('users', "profile = 'marketplace'", '', 0, 0)) {
      u.set('profile', 'vendedor')
      u.set('status', 'inativo')
      app.saveNoValidate(u)
    }
    const users = app.findCollectionByNameOrId('users')
    const profile = users.fields.getByName('profile')
    const values = []
    for (let i = 0; i < profile.values.length; i++) {
      if (profile.values[i] !== 'marketplace') values.push(profile.values[i])
    }
    profile.values = values
    app.save(users)
  },
)

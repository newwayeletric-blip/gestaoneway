// Perfil "gerente" (dono, 11/11/2026): vende como o vendedor e, nas lojas dele
// (users.stores), vê as vendas de todos, aprova ou recusa vendas e descontos,
// corrige o chassi e anexa a NF. Não cancela venda, não lança estoque e não vê
// custo, financeiro, comissões dos outros nem configurações. As rotas de
// aprovação e de chassi conferem a loja (hooks sales_actions.js e
// sales_serials.js); aqui as regras da API passam a mostrar a ele as vendas
// das lojas dele. Cada regra antiga é mantida e ganha um "|| (...)" no fim,
// que o down remove.
// Atenção: "@request.auth.stores ~ store" (e não "?="): a relação múltipla do
// usuário chega como texto nas regras.
migrate(
  (app) => {
    const ACTIVE = "@request.auth.id != '' && @request.auth.status = 'ativo'"
    const MANAGER = ACTIVE + " && @request.auth.profile = 'gerente' && org = @request.auth.org"
    const extend = (name, rules, extra) => {
      const col = app.findCollectionByNameOrId(name)
      for (const rule of rules) {
        const key = rule + 'Rule'
        col[key] = col[key] ? '(' + col[key] + ') || (' + extra + ')' : extra
      }
      app.save(col)
    }

    const users = app.findCollectionByNameOrId('users')
    const profile = users.fields.getByName('profile')
    const values = []
    for (let i = 0; i < profile.values.length; i++) values.push(profile.values[i])
    if (values.indexOf('gerente') === -1) values.push('gerente')
    profile.values = values
    app.save(users)

    // O nome de quem vendeu aparece na lista de vendas da loja.
    extend('users', ['list', 'view'], MANAGER)
    extend('sales', ['list', 'view'], MANAGER + ' && @request.auth.stores ~ store')
    for (const name of ['sale_items', 'sale_payments', 'sale_documents']) {
      extend(name, ['list', 'view'], MANAGER + ' && @request.auth.stores ~ sale.store')
    }
    // Anexar a NF (a trava de sales_guards.js só aceita NF de venda confirmada).
    extend(
      'sale_documents',
      ['create'],
      ACTIVE +
        " && @request.auth.profile = 'gerente' && sale.org = @request.auth.org && @request.auth.stores ~ sale.store",
    )
  },
  (app) => {
    const ACTIVE = "@request.auth.id != '' && @request.auth.status = 'ativo'"
    const MANAGER = ACTIVE + " && @request.auth.profile = 'gerente' && org = @request.auth.org"
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
    shrink(
      'sale_documents',
      ['create'],
      ACTIVE +
        " && @request.auth.profile = 'gerente' && sale.org = @request.auth.org && @request.auth.stores ~ sale.store",
    )
    for (const name of ['sale_items', 'sale_payments', 'sale_documents']) {
      shrink(name, ['list', 'view'], MANAGER + ' && @request.auth.stores ~ sale.store')
    }
    shrink('sales', ['list', 'view'], MANAGER + ' && @request.auth.stores ~ store')
    shrink('users', ['list', 'view'], MANAGER)

    const managers = app.findRecordsByFilter('users', "profile = 'gerente'", '', 0, 0)
    for (const u of managers) {
      u.set('profile', 'vendedor')
      app.saveNoValidate(u)
    }
    const users = app.findCollectionByNameOrId('users')
    const profile = users.fields.getByName('profile')
    const values = []
    for (let i = 0; i < profile.values.length; i++) {
      if (profile.values[i] !== 'gerente') values.push(profile.values[i])
    }
    profile.values = values
    app.save(users)
  },
)

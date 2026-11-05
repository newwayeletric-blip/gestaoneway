// Até a v0.0.9 a tela do Financeiro gravava em `store` sempre a primeira loja
// da lista; a loja escolhida (Jockey, Cajuru ou Compartilhado) ia só para
// `store_allocation`. Aqui `store` passa a ser a escolhida, e o compartilhado
// fica sem loja, como a tela grava desde a v0.0.10. O CNPJ não muda: as duas
// lojas usam o mesmo (0010). recurring_expenses não entra: nenhuma tela grava
// nela.
// Cada correção vira uma linha na auditoria com a loja anterior; o down usa
// essas linhas para desfazer.
const REASON =
  'Correção automática: a tela antiga do Financeiro gravava a primeira loja da lista no lugar da loja escolhida.'
const REVERT_REASON =
  'Reversão da correção automática da loja do lançamento (migration 0011 desfeita).'

migrate(
  (app) => {
    // A correção é uma ação do sistema, sem usuário; a tela de auditoria já
    // mostra "Sistema" nesses casos.
    const audit = app.findCollectionByNameOrId('audit_logs')
    const userField = audit.fields.getByName('user')
    if (userField.required) {
      userField.required = false
      app.save(audit)
    }

    const slugs = { jockey: 'jockey-plaza', cajuru: 'cajuru' }
    const storeIds = {}
    const storeFor = (org, allocation) => {
      if (allocation === 'compartilhado') return ''
      const key = org + '|' + allocation
      if (!(key in storeIds)) {
        const rows = app.findRecordsByFilter('stores', 'org = {:org} && slug = {:slug}', '', 1, 0, {
          org: org,
          slug: slugs[allocation] || '',
        })
        storeIds[key] = rows.length > 0 ? rows[0].id : null
      }
      return storeIds[key]
    }
    // Só para o resumo no log: o fechamento guarda apenas a data, não valores,
    // então corrigir um mês fechado muda os relatórios dele, não o fechamento.
    const inClosedMonth = (tx) => {
      const date =
        tx.getString('payment_date') || tx.getString('competence_date') || tx.getString('due_date')
      if (date.length < 7) return false
      const rows = app.findRecordsByFilter(
        'monthly_closings',
        "org = {:org} && year = {:year} && month = {:month} && status = 'fechado'",
        '',
        1,
        0,
        {
          org: tx.getString('org'),
          year: parseInt(date.slice(0, 4), 10),
          month: parseInt(date.slice(5, 7), 10),
        },
      )
      return rows.length > 0
    }

    let fixed = 0
    let closed = 0
    let noStore = 0
    const failed = []
    let firstError = ''
    const txs = app.findRecordsByFilter(
      'financial_transactions',
      "store_allocation != ''",
      'created',
      0,
      0,
    )
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]
      const allocation = tx.getString('store_allocation')
      const target = storeFor(tx.getString('org'), allocation)
      const previous = tx.getString('store')
      if (target === null) {
        noStore++
        continue
      }
      if (target === previous) continue
      try {
        // Auditoria primeiro: se a gravação do lançamento falhar, o down vê
        // que a loja não é a da correção e não mexe nele.
        const row = new Record(audit)
        row.set('org', tx.getString('org'))
        row.set('entity', 'financial_transactions')
        row.set('record_id', tx.id)
        row.set('action', 'alteracao')
        row.set('reason', REASON)
        row.set('previous_values', { store: previous })
        row.set('new_values', { store: target, store_allocation: allocation })
        app.save(row)

        tx.set('store', target)
        app.saveNoValidate(tx)
        fixed++
        if (inClosedMonth(tx)) closed++
      } catch (err) {
        failed.push(tx.id)
        if (!firstError) firstError = String(err)
      }
    }

    app
      .logger()
      .info(
        '0011: loja dos lançamentos antigos do Financeiro corrigida',
        'corrigidos',
        fixed,
        'emMesFechado',
        closed,
        'lojaNaoEncontrada',
        noStore,
        'falhas',
        failed.join(','),
        'erro',
        firstError,
      )
  },
  (app) => {
    // Desfaz só o que ainda está como a correção deixou: se alguém trocou a
    // loja depois, fica como está. A reversão também vai para a auditoria.
    // O campo `user` da auditoria continua opcional.
    const audit = app.findCollectionByNameOrId('audit_logs')
    const parse = (text) => {
      try {
        return JSON.parse(text) || {}
      } catch (_) {
        return {}
      }
    }
    const rows = app.findRecordsByFilter(
      'audit_logs',
      "entity = 'financial_transactions' && reason = {:reason}",
      '-created',
      0,
      0,
      { reason: REASON },
    )
    const done = {}
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].getString('record_id')
      if (done[id]) continue
      done[id] = true

      let tx = null
      try {
        tx = app.findRecordById('financial_transactions', id)
      } catch (_) {
        continue
      }
      const before = parse(rows[i].getString('previous_values'))
      const after = parse(rows[i].getString('new_values'))
      if (tx.getString('store') !== (after.store || '')) continue

      const row = new Record(audit)
      row.set('org', tx.getString('org'))
      row.set('entity', 'financial_transactions')
      row.set('record_id', tx.id)
      row.set('action', 'alteracao')
      row.set('reason', REVERT_REASON)
      row.set('previous_values', { store: after.store || '' })
      row.set('new_values', { store: before.store || '' })
      app.save(row)

      tx.set('store', before.store || '')
      app.saveNoValidate(tx)
    }
  },
)

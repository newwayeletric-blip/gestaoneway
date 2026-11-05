migrate(
  (app) => {
    // CFG-04 / FIN-04: remove os dados fictícios gravados pelas migrations
    // 0003 e 0005. Só apaga ou limpa o que ainda tem exatamente o valor da
    // semente e não é referenciado por nenhum outro registro; o que já foi
    // editado ou usado fica como está.
    const findOne = (collection, filter) => {
      const rows = app.findRecordsByFilter(collection, filter, '', 1, 0)
      return rows.length > 0 ? rows[0] : null
    }
    const isReferenced = (refs, id) => {
      for (const ref of refs) {
        if (findOne(ref[0], ref[1] + " = '" + id + "'")) return true
      }
      return false
    }

    // 1. Cliente de exemplo
    const sampleCustomer = findOne(
      'customers',
      "document = '12345678909' && name = 'Rodrigo Mendes de Oliveira'",
    )
    if (
      sampleCustomer &&
      !isReferenced(
        [
          ['sales', 'customer'],
          ['payments', 'customer'],
          ['customer_change_requests', 'customer'],
        ],
        sampleCustomer.id,
      )
    ) {
      app.delete(sampleCustomer)
    }

    // 2. Descontos, parcelamento e dados de empresa pré-preenchidos
    const seededSettings = [
      ['max_discount_pix', '10'],
      ['max_discount_dinheiro', '10'],
      ['max_discount_cartao_credito', '5'],
      ['max_installments_cartao_credito', '12'],
      ['company_cnpj', '45.123.789/0001-90'],
      ['company_phone', '(41) 3216-9000'],
      ['company_whatsapp', '+5541991234567'],
    ]
    for (const s of seededSettings) {
      const rec = findOne('settings', "key = '" + s[0] + "' && value = '" + s[1] + "'")
      if (rec) app.delete(rec)
    }

    // 3. Contas com saldo inventado (R$ 500 nos caixas, R$ 15 mil no Itaú)
    const accountRefs = [
      ['sale_payments', 'financial_account'],
      ['financial_transactions', 'account'],
      ['financial_transactions', 'destination_account'],
      ['card_receivables', 'target_account'],
      ['recurring_expenses', 'preferred_account'],
      ['sale_returns', 'refund_account'],
    ]
    const seededAccounts = [
      ['Caixa Físico - Shopping Jockey Plaza', 500],
      ['Caixa Físico - Loja Rua Cajuru', 500],
      ['Banco Itaú - Conta Principal', 15000],
    ]
    for (const a of seededAccounts) {
      const acc = findOne(
        'financial_accounts',
        "name = '" + a[0] + "' && initial_balance = " + a[1] + ' && current_balance = ' + a[1],
      )
      if (acc && !isReferenced(accountRefs, acc.id)) app.delete(acc)
    }

    // 4. Rateio 50/50 pré-definido
    const allocations = app.findRecordsByFilter(
      'expense_allocations',
      "percentage = 50 && notes = 'Rateio compartilhado 50%'",
      '',
      0,
      0,
    )
    for (const alloc of allocations) app.delete(alloc)

    // 5. Telefones, WhatsApp e gerentes inventados nas lojas
    const seededStoreContacts = [
      ['jockey-plaza', '(41) 3216-9000', '+5541991234567', 'Carlos Gerente Jockey'],
      ['cajuru', '(41) 3362-8000', '+5541999887766', 'Marcos Oficina e Vendas'],
    ]
    for (const c of seededStoreContacts) {
      const store = findOne('stores', "slug = '" + c[0] + "'")
      if (!store) continue
      let changed = false
      if (store.getString('phone') === c[1]) {
        store.set('phone', '')
        changed = true
      }
      if (store.getString('whatsapp') === c[2]) {
        store.set('whatsapp', '')
        changed = true
      }
      if (store.getString('manager') === c[3]) {
        store.set('manager', '')
        changed = true
      }
      if (changed) app.save(store)
    }
  },
  (app) => {
    // Sem down: não recriamos dados fictícios.
  },
)

migrate(
  (app) => {
    const storesCol = app.findCollectionByNameOrId('stores')
    const finAccountsCol = app.findCollectionByNameOrId('financial_accounts')
    const allocationsCol = app.findCollectionByNameOrId('expense_allocations')

    let jockeyStore, cajuruStore
    try {
      jockeyStore = app.findFirstRecordByData('stores', 'slug', 'jockey-plaza')
    } catch (_) {}
    try {
      cajuruStore = app.findFirstRecordByData('stores', 'slug', 'cajuru')
    } catch (_) {}

    // 1. Seed Financial Accounts (Caixas físicos e Contas bancárias)
    if (jockeyStore) {
      try {
        app.findFirstRecordByData(
          'financial_accounts',
          'name',
          'Caixa Físico - Shopping Jockey Plaza',
        )
      } catch (_) {
        const acc = new Record(finAccountsCol)
        acc.set('name', 'Caixa Físico - Shopping Jockey Plaza')
        acc.set('type', 'caixa_fisico')
        acc.set('store', jockeyStore.id)
        acc.set('bank_name', 'Gaveta Loja Jockey')
        acc.set('initial_balance', 500)
        acc.set('initial_balance_date', '2025-01-01 00:00:00.000Z')
        acc.set('current_balance', 500)
        acc.set('active', true)
        app.save(acc)
      }
    }

    if (cajuruStore) {
      try {
        app.findFirstRecordByData('financial_accounts', 'name', 'Caixa Físico - Loja Rua Cajuru')
      } catch (_) {
        const acc = new Record(finAccountsCol)
        acc.set('name', 'Caixa Físico - Loja Rua Cajuru')
        acc.set('type', 'caixa_fisico')
        acc.set('store', cajuruStore.id)
        acc.set('bank_name', 'Gaveta Oficina Cajuru')
        acc.set('initial_balance', 500)
        acc.set('initial_balance_date', '2025-01-01 00:00:00.000Z')
        acc.set('current_balance', 500)
        acc.set('active', true)
        app.save(acc)
      }
    }

    try {
      app.findFirstRecordByData('financial_accounts', 'name', 'Banco Itaú - Conta Principal')
    } catch (_) {
      const acc = new Record(finAccountsCol)
      acc.set('name', 'Banco Itaú - Conta Principal')
      acc.set('type', 'conta_bancaria')
      acc.set('bank_name', 'Itaú Unibanco')
      acc.set('initial_balance', 15000)
      acc.set('initial_balance_date', '2025-01-01 00:00:00.000Z')
      acc.set('current_balance', 15000)
      acc.set('active', true)
      app.save(acc)
    }

    // 2. Seed default Expense Allocations (Rateio 50% Jockey / 50% Cajuru por padrão)
    if (jockeyStore) {
      try {
        app.findFirstRecordByData('expense_allocations', 'store', jockeyStore.id)
      } catch (_) {
        const alloc = new Record(allocationsCol)
        alloc.set('name', 'Rateio Padrão Shopping Jockey Plaza')
        alloc.set('store', jockeyStore.id)
        alloc.set('percentage', 50)
        alloc.set('active', true)
        alloc.set('notes', 'Rateio compartilhado 50%')
        app.save(alloc)
      }
    }

    if (cajuruStore) {
      try {
        app.findFirstRecordByData('expense_allocations', 'store', cajuruStore.id)
      } catch (_) {
        const alloc = new Record(allocationsCol)
        alloc.set('name', 'Rateio Padrão Loja Rua Cajuru')
        alloc.set('store', cajuruStore.id)
        alloc.set('percentage', 50)
        alloc.set('active', true)
        alloc.set('notes', 'Rateio compartilhado 50%')
        app.save(alloc)
      }
    }
  },
  (app) => {},
)

migrate(
  (app) => {
    const stores = app.findCollectionByNameOrId('stores')
    const storesId = stores.id
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const usersId = users.id
    const products = app.findCollectionByNameOrId('products')
    const productsId = products.id
    const productVariants = app.findCollectionByNameOrId('product_variants')
    const variantsId = productVariants.id
    const sales = app.findCollectionByNameOrId('sales')
    const salesId = sales.id
    const saleItems = app.findCollectionByNameOrId('sale_items')
    const salePayments = app.findCollectionByNameOrId('sale_payments')
    const commissions = app.findCollectionByNameOrId('commissions')
    const commissionsId = commissions.id

    // 1. Extend products with commission_rate
    if (!products.fields.getByName('commission_rate')) {
      products.fields.add(
        new NumberField({
          name: 'commission_rate',
          required: false,
        }),
      )
      app.save(products)
    }

    // 2. Extend product_variants with commission_rate
    if (!productVariants.fields.getByName('commission_rate')) {
      productVariants.fields.add(
        new NumberField({
          name: 'commission_rate',
          required: false,
        }),
      )
      app.save(productVariants)
    }

    // 3. Extend users with default_commission_rate
    if (!users.fields.getByName('default_commission_rate')) {
      users.fields.add(
        new NumberField({
          name: 'default_commission_rate',
          required: false,
        }),
      )
      app.save(users)
    }

    // 4. Extend sales:
    if (!sales.fields.getByName('payment_status')) {
      sales.fields.add(
        new SelectField({
          name: 'payment_status',
          values: ['pendente', 'parcial', 'pago'],
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!sales.fields.getByName('delivery_status')) {
      sales.fields.add(
        new SelectField({
          name: 'delivery_status',
          values: ['pendente', 'entregue'],
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!sales.fields.getByName('delivered_at')) {
      sales.fields.add(new DateField({ name: 'delivered_at' }))
    }
    if (!sales.fields.getByName('delivered_by')) {
      sales.fields.add(
        new RelationField({ name: 'delivered_by', collectionId: usersId, maxSelect: 1 }),
      )
    }
    if (!sales.fields.getByName('authorized_by')) {
      sales.fields.add(
        new RelationField({ name: 'authorized_by', collectionId: usersId, maxSelect: 1 }),
      )
    }
    if (!sales.fields.getByName('authorization_note')) {
      sales.fields.add(new TextField({ name: 'authorization_note' }))
    }
    if (!sales.fields.getByName('cancellation_reason')) {
      sales.fields.add(new TextField({ name: 'cancellation_reason' }))
    }
    if (!sales.fields.getByName('canceled_by')) {
      sales.fields.add(
        new RelationField({ name: 'canceled_by', collectionId: usersId, maxSelect: 1 }),
      )
    }
    if (!sales.fields.getByName('canceled_at')) {
      sales.fields.add(new DateField({ name: 'canceled_at' }))
    }
    if (!sales.fields.getByName('idempotency_key')) {
      sales.fields.add(new TextField({ name: 'idempotency_key' }))
    }
    app.save(sales)

    // 5. Extend sale_items:
    if (!saleItems.fields.getByName('commission_rate')) {
      saleItems.fields.add(new NumberField({ name: 'commission_rate' }))
    }
    if (!saleItems.fields.getByName('commission_value')) {
      saleItems.fields.add(new NumberField({ name: 'commission_value' }))
    }
    if (!saleItems.fields.getByName('cost_price_snapshot')) {
      saleItems.fields.add(new NumberField({ name: 'cost_price_snapshot' }))
    }
    if (!saleItems.fields.getByName('returned_quantity')) {
      saleItems.fields.add(new NumberField({ name: 'returned_quantity' }))
    }
    app.save(saleItems)

    // 6. Extend sale_payments:
    if (!salePayments.fields.getByName('received_amount')) {
      salePayments.fields.add(new NumberField({ name: 'received_amount' }))
    }
    if (!salePayments.fields.getByName('change_amount')) {
      salePayments.fields.add(new NumberField({ name: 'change_amount' }))
    }
    if (!salePayments.fields.getByName('installment_value')) {
      salePayments.fields.add(new NumberField({ name: 'installment_value' }))
    }
    if (!salePayments.fields.getByName('card_tax_rate')) {
      salePayments.fields.add(new NumberField({ name: 'card_tax_rate' }))
    }
    if (!salePayments.fields.getByName('card_tax_amount')) {
      salePayments.fields.add(new NumberField({ name: 'card_tax_amount' }))
    }
    if (!salePayments.fields.getByName('net_amount')) {
      salePayments.fields.add(new NumberField({ name: 'net_amount' }))
    }
    // Update method to include cartao_debito
    const methodField = salePayments.fields.getByName('method')
    if (methodField) {
      methodField.values = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito']
    }
    app.save(salePayments)

    // 7. Extend commissions:
    if (!commissions.fields.getByName('released_at')) {
      commissions.fields.add(new DateField({ name: 'released_at' }))
    }
    if (!commissions.fields.getByName('paid_at')) {
      commissions.fields.add(new DateField({ name: 'paid_at' }))
    }
    if (!commissions.fields.getByName('competence_date')) {
      commissions.fields.add(new DateField({ name: 'competence_date' }))
    }
    if (!commissions.fields.getByName('notes')) {
      commissions.fields.add(new TextField({ name: 'notes' }))
    }
    const commStatusField = commissions.fields.getByName('status')
    if (commStatusField) {
      commStatusField.values = ['prevista', 'liberada', 'paga', 'estornada', 'pendente']
    }
    app.save(commissions)

    // 8. Financial Accounts
    const financialAccounts = new Collection({
      name: 'financial_accounts',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'type',
          type: 'select',
          values: ['caixa_fisico', 'conta_bancaria', 'carteira_digital'],
          maxSelect: 1,
          required: true,
        },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1 },
        { name: 'bank_name', type: 'text' },
        { name: 'initial_balance', type: 'number', required: true },
        { name: 'initial_balance_date', type: 'date', required: true },
        { name: 'current_balance', type: 'number', required: true },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(financialAccounts)
    const financialAccountsId = financialAccounts.id

    // Add financial_account relation to sale_payments
    if (!salePayments.fields.getByName('financial_account')) {
      salePayments.fields.add(
        new RelationField({
          name: 'financial_account',
          collectionId: financialAccountsId,
          maxSelect: 1,
        }),
      )
      app.save(salePayments)
    }

    // 9. Financial Categories
    const financialCategories = new Collection({
      name: 'financial_categories',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'subcategory', type: 'text' },
        {
          name: 'group',
          type: 'select',
          values: [
            'ocupacao',
            'estrutura',
            'equipe',
            'marketing',
            'operacao',
            'sistemas',
            'administracao',
            'vendas',
            'tributos',
            'compra_estoque',
            'investimento',
            'emprestimo',
            'aporte',
            'retirada_socios',
            'outras',
          ],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'nature',
          type: 'select',
          values: ['despesa_operacional', 'nao_operacional', 'custo_mercadoria', 'outro'],
          maxSelect: 1,
          required: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(financialCategories)
    const financialCategoriesId = financialCategories.id

    // 10. Financial Transactions
    const financialTransactions = new Collection({
      name: 'financial_transactions',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'description', type: 'text', required: true },
        {
          name: 'type',
          type: 'select',
          values: [
            'receita_venda',
            'despesa',
            'transferencia_entre_contas',
            'aporte',
            'emprestimo',
            'retirada',
            'reembolso',
            'compra_estoque',
          ],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'category',
          type: 'relation',
          collectionId: financialCategoriesId,
          maxSelect: 1,
        },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1 },
        {
          name: 'store_allocation',
          type: 'select',
          values: ['jockey', 'cajuru', 'compartilhado'],
          maxSelect: 1,
        },
        {
          name: 'account',
          type: 'relation',
          collectionId: financialAccountsId,
          maxSelect: 1,
        },
        {
          name: 'destination_account',
          type: 'relation',
          collectionId: financialAccountsId,
          maxSelect: 1,
        },
        { name: 'amount', type: 'number', required: true },
        { name: 'competence_date', type: 'date', required: true },
        { name: 'due_date', type: 'date', required: true },
        { name: 'payment_date', type: 'date' },
        {
          name: 'status',
          type: 'select',
          values: ['previsto', 'pendente', 'parcial', 'pago', 'cancelado'],
          maxSelect: 1,
          required: true,
        },
        { name: 'paid_amount', type: 'number' },
        {
          name: 'payment_method',
          type: 'select',
          values: ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto'],
          maxSelect: 1,
        },
        { name: 'recipient_supplier', type: 'text' },
        { name: 'installment_number', type: 'number' },
        { name: 'total_installments', type: 'number' },
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1 },
        { name: 'commission', type: 'relation', collectionId: commissionsId, maxSelect: 1 },
        { name: 'notes', type: 'text' },
        { name: 'attachment', type: 'file', maxSelect: 1, maxSize: 10485760 },
        { name: 'created_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_fin_trans_date ON financial_transactions (competence_date, status)',
        'CREATE INDEX idx_fin_trans_due ON financial_transactions (due_date, status)',
      ],
    })
    app.save(financialTransactions)

    // 11. Card Receivables
    const cardReceivables = new Collection({
      name: 'card_receivables',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        { name: 'installment_number', type: 'number', required: true },
        { name: 'total_installments', type: 'number', required: true },
        { name: 'gross_amount', type: 'number', required: true },
        { name: 'fee_rate', type: 'number', required: true },
        { name: 'fee_amount', type: 'number', required: true },
        { name: 'net_amount', type: 'number', required: true },
        { name: 'expected_liquidation_date', type: 'date', required: true },
        { name: 'actual_liquidation_date', type: 'date' },
        {
          name: 'status',
          type: 'select',
          values: ['a_receber', 'liquidado', 'antecipado', 'cancelado'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'target_account',
          type: 'relation',
          collectionId: financialAccountsId,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_card_rec_status_date ON card_receivables (status, expected_liquidation_date)',
      ],
    })
    app.save(cardReceivables)

    // 12. Recurring Expenses
    const recurringExpenses = new Collection({
      name: 'recurring_expenses',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'description', type: 'text', required: true },
        {
          name: 'category',
          type: 'relation',
          collectionId: financialCategoriesId,
          maxSelect: 1,
        },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1 },
        {
          name: 'store_allocation',
          type: 'select',
          values: ['jockey', 'cajuru', 'compartilhado'],
          maxSelect: 1,
          required: true,
        },
        { name: 'amount', type: 'number', required: true },
        {
          name: 'frequency',
          type: 'select',
          values: ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual'],
          maxSelect: 1,
          required: true,
        },
        { name: 'due_day', type: 'number', required: true },
        { name: 'start_date', type: 'date', required: true },
        { name: 'end_date', type: 'date' },
        { name: 'active', type: 'bool' },
        { name: 'recipient_supplier', type: 'text' },
        {
          name: 'preferred_account',
          type: 'relation',
          collectionId: financialAccountsId,
          maxSelect: 1,
        },
        {
          name: 'preferred_method',
          type: 'select',
          values: ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(recurringExpenses)

    // 13. Expense Allocations (Rateios)
    const expenseAllocations = new Collection({
      name: 'expense_allocations',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        { name: 'percentage', type: 'number', required: true },
        { name: 'active', type: 'bool' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(expenseAllocations)

    // 14. Sale Returns
    const saleReturns = new Collection({
      name: 'sale_returns',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        {
          name: 'type',
          type: 'select',
          values: ['devolucao_total', 'devolucao_parcial', 'cancelamento'],
          maxSelect: 1,
          required: true,
        },
        { name: 'reason', type: 'text', required: true },
        { name: 'refund_amount', type: 'number', required: true },
        {
          name: 'refund_status',
          type: 'select',
          values: ['pendente', 'reembolsado', 'sem_reembolso'],
          maxSelect: 1,
          required: true,
        },
        { name: 'refund_date', type: 'date' },
        {
          name: 'refund_method',
          type: 'select',
          values: ['pix', 'dinheiro', 'estorno_cartao'],
          maxSelect: 1,
        },
        {
          name: 'refund_account',
          type: 'relation',
          collectionId: financialAccountsId,
          maxSelect: 1,
        },
        {
          name: 'product_condition',
          type: 'select',
          values: ['perfeito_retorna_venda', 'avariado_indisponivel', 'nao_entregue_liberado'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'performed_by',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
        },
        { name: 'items_detail', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(saleReturns)

    // 15. Monthly Closings
    const monthlyClosings = new Collection({
      name: 'monthly_closings',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'year', type: 'number', required: true },
        { name: 'month', type: 'number', required: true },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['fechado', 'aberto'],
          maxSelect: 1,
          required: true,
        },
        { name: 'closed_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'closed_at', type: 'date' },
        { name: 'reopened_by', type: 'relation', collectionId: usersId, maxSelect: 1 },
        { name: 'reopened_at', type: 'date' },
        { name: 'reopen_reason', type: 'text' },
        { name: 'summary', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_closing_year_month_store ON monthly_closings (year, month, store)',
      ],
    })
    app.save(monthlyClosings)

    // 16. Audit Logs
    const auditLogs = new Collection({
      name: 'audit_logs',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'entity', type: 'text', required: true },
        { name: 'record_id', type: 'text', required: true },
        {
          name: 'action',
          type: 'select',
          values: [
            'criacao',
            'alteracao',
            'cancelamento',
            'devolucao',
            'estorno',
            'reabertura',
            'ajuste',
          ],
          maxSelect: 1,
          required: true,
        },
        { name: 'user', type: 'relation', collectionId: usersId, maxSelect: 1, required: true },
        { name: 'reason', type: 'text' },
        { name: 'previous_values', type: 'json' },
        { name: 'new_values', type: 'json' },
        { name: 'ip_address', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_audit_entity_rec ON audit_logs (entity, record_id)'],
    })
    app.save(auditLogs)

    // 17. Seed initial financial categories
    const initialCategories = [
      {
        name: 'Ocupação',
        subcategory: 'Aluguel',
        group: 'ocupacao',
        nature: 'despesa_operacional',
      },
      {
        name: 'Ocupação',
        subcategory: 'Condomínio',
        group: 'ocupacao',
        nature: 'despesa_operacional',
      },
      {
        name: 'Ocupação',
        subcategory: 'Taxas do Shopping',
        group: 'ocupacao',
        nature: 'despesa_operacional',
      },
      { name: 'Ocupação', subcategory: 'IPTU', group: 'ocupacao', nature: 'despesa_operacional' },
      {
        name: 'Estrutura',
        subcategory: 'Energia Elétrica',
        group: 'estrutura',
        nature: 'despesa_operacional',
      },
      {
        name: 'Estrutura',
        subcategory: 'Água e Esgoto',
        group: 'estrutura',
        nature: 'despesa_operacional',
      },
      {
        name: 'Estrutura',
        subcategory: 'Internet e Telefone',
        group: 'estrutura',
        nature: 'despesa_operacional',
      },
      {
        name: 'Estrutura',
        subcategory: 'Limpeza e Manutenção',
        group: 'estrutura',
        nature: 'despesa_operacional',
      },
      { name: 'Equipe', subcategory: 'Salários', group: 'equipe', nature: 'despesa_operacional' },
      { name: 'Equipe', subcategory: 'Comissões', group: 'equipe', nature: 'despesa_operacional' },
      {
        name: 'Equipe',
        subcategory: 'Benefícios e Encargos',
        group: 'equipe',
        nature: 'despesa_operacional',
      },
      {
        name: 'Marketing',
        subcategory: 'Anúncios e Campanhas',
        group: 'marketing',
        nature: 'despesa_operacional',
      },
      {
        name: 'Operação',
        subcategory: 'Fretes e Entregas',
        group: 'operacao',
        nature: 'despesa_operacional',
      },
      {
        name: 'Operação',
        subcategory: 'Embalagens e Consumo',
        group: 'operacao',
        nature: 'despesa_operacional',
      },
      {
        name: 'Sistemas',
        subcategory: 'Softwares e Assinaturas',
        group: 'sistemas',
        nature: 'despesa_operacional',
      },
      {
        name: 'Administração',
        subcategory: 'Contabilidade e Tarifas',
        group: 'administracao',
        nature: 'despesa_operacional',
      },
      {
        name: 'Vendas',
        subcategory: 'Taxas de Cartão',
        group: 'vendas',
        nature: 'despesa_operacional',
      },
      {
        name: 'Tributos',
        subcategory: 'Impostos sobre Vendas',
        group: 'tributos',
        nature: 'despesa_operacional',
      },
      {
        name: 'Estoque',
        subcategory: 'Compra de Mercadorias para Revenda',
        group: 'compra_estoque',
        nature: 'custo_mercadoria',
      },
      {
        name: 'Sócios',
        subcategory: 'Aporte de Capital',
        group: 'aporte',
        nature: 'nao_operacional',
      },
      {
        name: 'Sócios',
        subcategory: 'Retirada de Pró-labore / Lucros',
        group: 'retirada_socios',
        nature: 'nao_operacional',
      },
      {
        name: 'Financeiro',
        subcategory: 'Empréstimos Bancários',
        group: 'emprestimo',
        nature: 'nao_operacional',
      },
    ]

    for (const cat of initialCategories) {
      try {
        const rec = new Record(financialCategories)
        rec.set('name', cat.name)
        rec.set('subcategory', cat.subcategory)
        rec.set('group', cat.group)
        rec.set('nature', cat.nature)
        app.save(rec)
      } catch (_) {}
    }
  },
  (app) => {},
)

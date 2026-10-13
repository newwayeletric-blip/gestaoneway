migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. stores
    const stores = new Collection({
      name: 'stores',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true },
        { name: 'address', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'whatsapp', type: 'text' },
        { name: 'manager', type: 'text' },
        { name: 'status', type: 'select', values: ['ativa', 'inativa'], maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_stores_slug ON stores (slug)'],
    })
    app.save(stores)
    const storesId = stores.id

    // Add stores relation to users now that stores collection exists
    if (!users.fields.getByName('stores')) {
      users.fields.add(
        new RelationField({
          name: 'stores',
          collectionId: storesId,
          maxSelect: 10,
          required: false,
        }),
      )
      app.save(users)
    }

    // 2. categories
    const categories = new Collection({
      name: 'categories',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_categories_name ON categories (name)'],
    })
    app.save(categories)
    const categoriesId = categories.id

    // 3. products
    const products = new Collection({
      name: 'products',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'sku', type: 'text', required: true },
        { name: 'category', type: 'relation', collectionId: categoriesId, maxSelect: 1 },
        { name: 'brand', type: 'text' },
        { name: 'model', type: 'text' },
        {
          name: 'photo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        { name: 'description', type: 'text' },
        { name: 'sale_price', type: 'number' },
        { name: 'cost_price', type: 'number' },
        { name: 'min_stock', type: 'number' },
        { name: 'status', type: 'select', values: ['ativo', 'inativo'], maxSelect: 1 },
        { name: 'track_serial', type: 'bool' },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_products_sku ON products (sku)'],
    })
    app.save(products)
    const productsId = products.id

    // 4. product_variants
    const productVariants = new Collection({
      name: 'product_variants',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        {
          name: 'product',
          type: 'relation',
          collectionId: productsId,
          maxSelect: 1,
          required: true,
        },
        { name: 'name', type: 'text', required: true },
        { name: 'sku', type: 'text', required: true },
        { name: 'sale_price', type: 'number' },
        { name: 'cost_price', type: 'number' },
        {
          name: 'photo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        { name: 'track_serial', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_variants_sku ON product_variants (sku)'],
    })
    app.save(productVariants)
    const variantsId = productVariants.id

    // 5. stock_items
    const stockItems = new Collection({
      name: 'stock_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        {
          name: 'product',
          type: 'relation',
          collectionId: productsId,
          maxSelect: 1,
          required: true,
        },
        { name: 'variant', type: 'relation', collectionId: variantsId, maxSelect: 1 },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_stock_items_store ON stock_items (store)'],
    })
    app.save(stockItems)
    const stockItemsId = stockItems.id

    // 6. stock_movements
    const stockMovements = new Collection({
      name: 'stock_movements',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        {
          name: 'type',
          type: 'select',
          values: [
            'entrada',
            'saida_venda',
            'transferencia_envio',
            'transferencia_recebimento',
            'devolucao',
            'perda',
            'avaria',
            'ajuste',
          ],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'product',
          type: 'relation',
          collectionId: productsId,
          maxSelect: 1,
          required: true,
        },
        { name: 'variant', type: 'relation', collectionId: variantsId, maxSelect: 1 },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'date', type: 'date' },
        { name: 'user', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'reason', type: 'text' },
        { name: 'source_ref', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_stock_mov_store_type ON stock_movements (store, type)'],
    })
    app.save(stockMovements)

    // 7. transfers
    const transfers = new Collection({
      name: 'transfers',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        {
          name: 'origin_store',
          type: 'relation',
          collectionId: storesId,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'destination_store',
          type: 'relation',
          collectionId: storesId,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          values: ['em_transito', 'recebida', 'cancelada'],
          maxSelect: 1,
          required: true,
        },
        { name: 'user', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'received_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'date', type: 'date' },
        { name: 'received_at', type: 'date' },
        { name: 'note', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_transfers_status ON transfers (status)'],
    })
    app.save(transfers)
    const transfersId = transfers.id

    // 8. transfer_items
    const transferItems = new Collection({
      name: 'transfer_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        {
          name: 'transfer',
          type: 'relation',
          collectionId: transfersId,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'product',
          type: 'relation',
          collectionId: productsId,
          maxSelect: 1,
          required: true,
        },
        { name: 'variant', type: 'relation', collectionId: variantsId, maxSelect: 1 },
        { name: 'quantity', type: 'number', required: true },
        { name: 'received_quantity', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(transferItems)

    // 9. customers
    const customers = new Collection({
      name: 'customers',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin' || (@request.auth.id != '')",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'phone', type: 'text', required: true },
        { name: 'document', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'address', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_customers_phone ON customers (phone)'],
    })
    app.save(customers)
    const customersId = customers.id

    // 10. sales
    const sales = new Collection({
      name: 'sales',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      createRule: "@request.auth.id != ''",
      updateRule:
        "@request.auth.profile = 'admin' || (seller = @request.auth.id && status = 'rascunho')",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'number', type: 'text', required: true },
        {
          name: 'customer',
          type: 'relation',
          collectionId: customersId,
          maxSelect: 1,
          required: true,
        },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        {
          name: 'seller',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          values: ['rascunho', 'confirmada', 'cancelada', 'devolvida'],
          maxSelect: 1,
          required: true,
        },
        { name: 'subtotal', type: 'number' },
        { name: 'total_discount', type: 'number' },
        { name: 'total', type: 'number', required: true },
        {
          name: 'payment',
          type: 'select',
          values: ['pix', 'dinheiro', 'cartao_credito'],
          maxSelect: 1,
        },
        { name: 'allow_installments', type: 'bool' },
        { name: 'installments', type: 'number' },
        { name: 'observation', type: 'text' },
        { name: 'invoice_number', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_sales_number ON sales (number)',
        'CREATE INDEX idx_sales_seller_status ON sales (seller, status)',
      ],
    })
    app.save(sales)
    const salesId = sales.id

    // 11. sale_items
    const saleItems = new Collection({
      name: 'sale_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        { name: 'product', type: 'relation', collectionId: productsId, maxSelect: 1 },
        { name: 'variant', type: 'relation', collectionId: variantsId, maxSelect: 1 },
        { name: 'product_name', type: 'text', required: true },
        { name: 'sku', type: 'text' },
        { name: 'sale_price', type: 'number', required: true },
        { name: 'cost_price', type: 'number' },
        { name: 'quantity', type: 'number', required: true },
        { name: 'discount', type: 'number' },
        { name: 'discount_rule', type: 'text' },
        { name: 'total', type: 'number', required: true },
        { name: 'serial_number', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_sale_items_sale ON sale_items (sale)'],
    })
    app.save(saleItems)

    // 12. sale_documents
    const saleDocuments = new Collection({
      name: 'sale_documents',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        { name: 'file', type: 'file', maxSelect: 1, maxSize: 10485760 },
        { name: 'label', type: 'text', required: true },
        { name: 'uploaded_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(saleDocuments)

    // 13. sale_payments
    const salePayments = new Collection({
      name: 'sale_payments',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        {
          name: 'method',
          type: 'select',
          values: ['pix', 'dinheiro', 'cartao_credito'],
          maxSelect: 1,
          required: true,
        },
        { name: 'amount', type: 'number', required: true },
        { name: 'confirmed', type: 'bool' },
        { name: 'installments', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(salePayments)

    // 14. expenses (exclusive to admin)
    const expenses = new Collection({
      name: 'expenses',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        { name: 'description', type: 'text', required: true },
        { name: 'category', type: 'text' },
        { name: 'amount', type: 'number', required: true },
        { name: 'date', type: 'date', required: true },
        {
          name: 'payment_method',
          type: 'select',
          values: ['pix', 'dinheiro', 'cartao_credito'],
          maxSelect: 1,
        },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_expenses_store_date ON expenses (store, date)'],
    })
    app.save(expenses)

    // 15. payments (financial ledger, exclusive to admin)
    const payments = new Collection({
      name: 'payments',
      type: 'base',
      listRule: "@request.auth.profile = 'admin'",
      viewRule: "@request.auth.profile = 'admin'",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        { name: 'customer', type: 'relation', collectionId: customersId, maxSelect: 1 },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        {
          name: 'method',
          type: 'select',
          values: ['pix', 'dinheiro', 'cartao_credito'],
          maxSelect: 1,
          required: true,
        },
        { name: 'amount', type: 'number', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['pendente', 'pago'],
          maxSelect: 1,
          required: true,
        },
        { name: 'due_date', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_payments_status_store ON payments (status, store)'],
    })
    app.save(payments)

    // 16. commissions
    const commissions = new Collection({
      name: 'commissions',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        {
          name: 'seller',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: true,
        },
        { name: 'sale', type: 'relation', collectionId: salesId, maxSelect: 1, required: true },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1, required: true },
        { name: 'base_amount', type: 'number', required: true },
        { name: 'rate', type: 'number', required: true },
        { name: 'value', type: 'number', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['pendente', 'paga'],
          maxSelect: 1,
          required: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_commissions_seller_status ON commissions (seller, status)'],
    })
    app.save(commissions)

    // 17. commission_rules
    const commissionRules = new Collection({
      name: 'commission_rules',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'store', type: 'relation', collectionId: storesId, maxSelect: 1 },
        { name: 'min_sale_amount', type: 'number' },
        { name: 'rate', type: 'number', required: true },
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(commissionRules)

    // 18. settings
    const settings = new Collection({
      name: 'settings',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.profile = 'admin'",
      updateRule: "@request.auth.profile = 'admin'",
      deleteRule: "@request.auth.profile = 'admin'",
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'value', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_settings_key ON settings (key)'],
    })
    app.save(settings)
  },
  (app) => {
    // down
  },
)

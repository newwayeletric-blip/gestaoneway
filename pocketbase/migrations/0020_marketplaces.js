// Marketplaces pelo Bling (dono, 11/11/2026): o Mercado Livre (e depois a
// Amazon) já está ligado ao Bling; o sistema lê os pedidos de cada canal,
// cria a venda (sem aprovação e sem emitir outra NF: o Bling emite), baixa o
// estoque da loja escolhida (a Loja de rua) e manda o estoque de volta para o
// Bling, que atualiza os anúncios. Tudo pelos hooks (sem regra de API).
// - sales_channels: um canal de venda do Bling (loja do Bling) por registro.
// - bling_product_links: produto do sistema ↔ produto do Bling (o código do
//   anúncio e do pedido aponta para o produto do Bling).
// - marketplace_orders: cada pedido do Bling visto (evita importar duas vezes
//   e guarda o que falta vincular).
// - sales: canal, número no marketplace, taxa e frete do marketplace.
// - sales.payment / sale_payments.method: 'marketplace'.
migrate(
  (app) => {
    const orgs = app.findCollectionByNameOrId('organizations')
    const stores = app.findCollectionByNameOrId('stores')
    const users = app.findCollectionByNameOrId('users')
    const products = app.findCollectionByNameOrId('products')
    const sales = app.findCollectionByNameOrId('sales')
    const base = (name, fields, indexes) =>
      new Collection({
        name: name,
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: fields.concat([
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ]),
        indexes: indexes,
      })

    const channels = base(
      'sales_channels',
      [
        { name: 'org', type: 'relation', collectionId: orgs.id, maxSelect: 1, required: true },
        { name: 'bling_store_id', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        {
          name: 'kind',
          type: 'select',
          values: ['mercado_livre', 'amazon', 'shopee', 'magalu', 'outro'],
          maxSelect: 1,
        },
        { name: 'active', type: 'bool' },
        { name: 'stock_store', type: 'relation', collectionId: stores.id, maxSelect: 1 },
        // Quem aparece como vendedor nas vendas do canal (sem comissão).
        { name: 'seller', type: 'relation', collectionId: users.id, maxSelect: 1 },
        // Só importa pedidos a partir deste dia (AAAA-MM-DD).
        { name: 'import_from', type: 'text' },
        { name: 'sync_stock', type: 'bool' },
        { name: 'bling_deposit_id', type: 'text' },
        { name: 'last_import_at', type: 'number' },
        { name: 'last_stock_sync_at', type: 'number' },
        { name: 'last_error', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_sales_channels_store ON sales_channels (org, bling_store_id)'],
    )
    app.save(channels)

    app.save(
      base(
        'bling_product_links',
        [
          { name: 'org', type: 'relation', collectionId: orgs.id, maxSelect: 1, required: true },
          {
            name: 'product',
            type: 'relation',
            collectionId: products.id,
            maxSelect: 1,
            required: true,
          },
          { name: 'bling_product_id', type: 'text', required: true },
          { name: 'bling_code', type: 'text' },
          { name: 'bling_name', type: 'text' },
          // Último saldo mandado ao Bling (-1 = nunca).
          { name: 'last_pushed_stock', type: 'number' },
          { name: 'last_pushed_at', type: 'number' },
        ],
        [
          'CREATE UNIQUE INDEX idx_bling_links_product_id ON bling_product_links (org, bling_product_id)',
          'CREATE INDEX idx_bling_links_product ON bling_product_links (product)',
        ],
      ),
    )

    app.save(
      base(
        'marketplace_orders',
        [
          { name: 'org', type: 'relation', collectionId: orgs.id, maxSelect: 1, required: true },
          { name: 'channel', type: 'relation', collectionId: channels.id, maxSelect: 1 },
          { name: 'bling_order_id', type: 'text', required: true },
          { name: 'external_number', type: 'text' },
          { name: 'order_date', type: 'text' },
          { name: 'total', type: 'number' },
          { name: 'customer_name', type: 'text' },
          {
            name: 'status',
            type: 'select',
            values: ['importado', 'aguardando_vinculo', 'ignorado', 'cancelado', 'erro'],
            maxSelect: 1,
          },
          { name: 'bling_status', type: 'text' },
          { name: 'sale', type: 'relation', collectionId: sales.id, maxSelect: 1 },
          // Itens do pedido sem produto do sistema: [{ bling_product_id, code, name }].
          { name: 'missing', type: 'json' },
          { name: 'note', type: 'text' },
        ],
        [
          'CREATE UNIQUE INDEX idx_marketplace_orders_bling ON marketplace_orders (org, bling_order_id)',
          'CREATE INDEX idx_marketplace_orders_status ON marketplace_orders (org, status)',
        ],
      ),
    )

    sales.fields.add(
      new RelationField({ name: 'channel', collectionId: channels.id, maxSelect: 1 }),
    )
    sales.fields.add(new TextField({ name: 'external_number' }))
    sales.fields.add(new NumberField({ name: 'marketplace_fee' }))
    sales.fields.add(new NumberField({ name: 'shipping_cost' }))
    const addValue = (field) => {
      if (field && field.values.indexOf('marketplace') === -1) {
        field.values = field.values.concat(['marketplace'])
      }
    }
    addValue(sales.fields.getByName('payment'))
    app.save(sales)
    const payments = app.findCollectionByNameOrId('sale_payments')
    addValue(payments.fields.getByName('method'))
    app.save(payments)
  },
  (app) => {
    const sales = app.findCollectionByNameOrId('sales')
    for (const name of ['channel', 'external_number', 'marketplace_fee', 'shipping_cost']) {
      if (sales.fields.getByName(name)) sales.fields.removeByName(name)
    }
    const dropValue = (field) => {
      if (field) field.values = field.values.filter((v) => v !== 'marketplace')
    }
    dropValue(sales.fields.getByName('payment'))
    app.save(sales)
    const payments = app.findCollectionByNameOrId('sale_payments')
    dropValue(payments.fields.getByName('method'))
    app.save(payments)
    for (const name of ['marketplace_orders', 'bling_product_links', 'sales_channels']) {
      app.delete(app.findCollectionByNameOrId(name))
    }
  },
)

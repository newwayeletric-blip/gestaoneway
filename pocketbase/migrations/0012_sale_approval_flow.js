// Fase 1 (VEN-01/03/04/06) com a regra do dono de 05/11/2026: toda venda de
// vendedor espera o administrador antes da nota fiscal. O produto fica
// reservado (o estoque baixa) quando o vendedor envia a venda e volta se ela
// for recusada.
// - sales: situações "aguardando_aprovacao" e "recusada", forma de pagamento
//   "cartao_debito" (faltava), quem e quando confirmou ou recusou, o pedido de
//   desconto acima do limite, o saldo pendente e a chave de idempotência
//   única por organização (VEN-02).
// - stores: código curto (JP, CJ) e contador para numerar as vendas por loja.
// - stock_movements: tipo "cancelamento_venda", para o estoque que volta
//   quando a venda é recusada ou cancelada.
// - stock_items: saldo zero passa a ser aceito. O campo era obrigatório, e o
//   PocketBase trata 0 como "em branco": vender a última unidade falhava.
migrate(
  (app) => {
    const withValues = (field, extra) => {
      const values = []
      for (let i = 0; i < field.values.length; i++) values.push(field.values[i])
      for (const v of extra) if (values.indexOf(v) === -1) values.push(v)
      field.values = values
    }
    const add = (collection, field) => {
      if (!collection.fields.getByName(field.name)) collection.fields.add(field)
    }

    const sales = app.findCollectionByNameOrId('sales')
    withValues(sales.fields.getByName('status'), ['aguardando_aprovacao', 'recusada'])
    withValues(sales.fields.getByName('payment'), ['cartao_debito'])
    add(sales, new DateField({ name: 'submitted_at' }))
    add(
      sales,
      new RelationField({ name: 'confirmed_by', collectionId: '_pb_users_auth_', maxSelect: 1 }),
    )
    add(sales, new DateField({ name: 'confirmed_at' }))
    add(
      sales,
      new RelationField({ name: 'rejected_by', collectionId: '_pb_users_auth_', maxSelect: 1 }),
    )
    add(sales, new DateField({ name: 'rejected_at' }))
    add(sales, new TextField({ name: 'rejection_reason' }))
    add(sales, new BoolField({ name: 'discount_over_limit' }))
    // Limite (%) da forma de pagamento principal no envio; -1 = não configurado.
    add(sales, new NumberField({ name: 'discount_limit_pct' }))
    add(sales, new TextField({ name: 'discount_reason' }))
    add(sales, new NumberField({ name: 'pending_balance' }))
    sales.addIndex(
      'idx_sales_org_idempotency',
      true,
      'org, idempotency_key',
      "idempotency_key != ''",
    )
    app.save(sales)

    const stores = app.findCollectionByNameOrId('stores')
    add(stores, new TextField({ name: 'code' }))
    add(stores, new NumberField({ name: 'sale_seq', onlyInt: true }))
    app.save(stores)

    const movements = app.findCollectionByNameOrId('stock_movements')
    withValues(movements.fields.getByName('type'), ['cancelamento_venda'])
    app.save(movements)

    const stockItems = app.findCollectionByNameOrId('stock_items')
    stockItems.fields.getByName('quantity').required = false
    app.save(stockItems)

    // Código das lojas existentes: JP e CJ para as lojas próprias; as demais
    // pelas iniciais do nome, sem repetir dentro da organização.
    const known = { 'jockey-plaza': 'JP', cajuru: 'CJ' }
    const accented = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
    const plain = 'aaaaaeeeeiiiiooooouuuucn'
    const initials = (name) => {
      const words = String(name || '')
        .toLowerCase()
        .replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (ch) => plain[accented.indexOf(ch)])
        .split(/[^a-z0-9]+/)
        .filter((w) => w && ['loja', 'de', 'da', 'do', 'das', 'dos', 'e'].indexOf(w) === -1)
      const base =
        words.length >= 2
          ? words
              .slice(0, 3)
              .map((w) => w[0])
              .join('')
          : (words[0] || 'lj').slice(0, 2)
      return base.toUpperCase()
    }
    const all = app.findRecordsByFilter('stores', "id != ''", 'created', 0, 0)
    const used = {}
    for (const st of all) {
      if (st.getString('code')) used[st.getString('org') + '|' + st.getString('code')] = true
    }
    for (const st of all) {
      if (st.getString('code')) continue
      const base = known[st.getString('slug')] || initials(st.getString('name'))
      let code = base
      for (let n = 2; used[st.getString('org') + '|' + code]; n++) code = base + n
      used[st.getString('org') + '|' + code] = true
      st.set('code', code)
      app.save(st)
    }
  },
  (app) => {
    // As situações e o tipo de movimento novos ficam: registros podem usá-los.
    const sales = app.findCollectionByNameOrId('sales')
    sales.removeIndex('idx_sales_org_idempotency')
    for (const name of [
      'submitted_at',
      'confirmed_by',
      'confirmed_at',
      'rejected_by',
      'rejected_at',
      'rejection_reason',
      'discount_over_limit',
      'discount_limit_pct',
      'discount_reason',
      'pending_balance',
    ]) {
      sales.fields.removeByName(name)
    }
    app.save(sales)
    const stores = app.findCollectionByNameOrId('stores')
    stores.fields.removeByName('code')
    stores.fields.removeByName('sale_seq')
    app.save(stores)
  },
)

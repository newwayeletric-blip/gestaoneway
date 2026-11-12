// Painel dos anúncios (dono, 11/11/2026): os anúncios do Mercado Livre que o
// Bling gerencia (GET /anuncios), guardados para a tela abrir rápido (o Bling
// aceita 3 chamadas por segundo). "Atualizar anúncios" relê tudo; pausar e
// publicar passam pelo Bling. Sem regra de API: só as rotas de
// pocketbase/hooks/marketplaces.js.
migrate(
  (app) => {
    const orgs = app.findCollectionByNameOrId('organizations')
    const channels = app.findCollectionByNameOrId('sales_channels')
    const products = app.findCollectionByNameOrId('products')
    app.save(
      new Collection({
        name: 'marketplace_listings',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'org', type: 'relation', collectionId: orgs.id, maxSelect: 1, required: true },
          {
            name: 'channel',
            type: 'relation',
            collectionId: channels.id,
            maxSelect: 1,
            required: true,
          },
          { name: 'bling_listing_id', type: 'text', required: true },
          // Código do anúncio no marketplace (ex.: MLB1234567890).
          { name: 'listing_code', type: 'text' },
          { name: 'title', type: 'text' },
          {
            name: 'status',
            type: 'select',
            values: ['publicado', 'rascunho', 'problema', 'pausado'],
            maxSelect: 1,
          },
          { name: 'price', type: 'number' },
          { name: 'promo_price', type: 'number' },
          { name: 'bling_product_id', type: 'text' },
          { name: 'product', type: 'relation', collectionId: products.id, maxSelect: 1 },
          { name: 'refreshed_at', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_marketplace_listings_bling ON marketplace_listings (org, channel, bling_listing_id)',
        ],
      }),
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('marketplace_listings'))
  },
)

migrate(
  (app) => {
    const storesCol = app.findCollectionByNameOrId('stores')
    const categoriesCol = app.findCollectionByNameOrId('categories')
    const productsCol = app.findCollectionByNameOrId('products')
    const variantsCol = app.findCollectionByNameOrId('product_variants')
    const stockItemsCol = app.findCollectionByNameOrId('stock_items')
    const stockMovementsCol = app.findCollectionByNameOrId('stock_movements')
    const customersCol = app.findCollectionByNameOrId('customers')
    const salesCol = app.findCollectionByNameOrId('sales')
    const saleItemsCol = app.findCollectionByNameOrId('sale_items')
    const salePaymentsCol = app.findCollectionByNameOrId('sale_payments')
    const paymentsCol = app.findCollectionByNameOrId('payments')
    const commissionsCol = app.findCollectionByNameOrId('commissions')
    const settingsCol = app.findCollectionByNameOrId('settings')

    // 1. Seed Stores
    let jockeyStore, cajuruStore
    try {
      jockeyStore = app.findFirstRecordByData('stores', 'slug', 'jockey-plaza')
    } catch (_) {
      jockeyStore = new Record(storesCol)
      jockeyStore.set('name', 'Shopping Jockey Plaza')
      jockeyStore.set('slug', 'jockey-plaza')
      jockeyStore.set('address', 'R. Konrad Adenauer, 370 - Tarumã, Curitiba - PR, Piso L2')
      jockeyStore.set('phone', '(41) 3216-9000')
      jockeyStore.set('whatsapp', '+5541991234567')
      jockeyStore.set('manager', 'Carlos Gerente Jockey')
      jockeyStore.set('status', 'ativa')
      app.save(jockeyStore)
    }

    try {
      cajuruStore = app.findFirstRecordByData('stores', 'slug', 'cajuru')
    } catch (_) {
      cajuruStore = new Record(storesCol)
      cajuruStore.set('name', 'Loja de rua')
      cajuruStore.set('slug', 'cajuru')
      cajuruStore.set(
        'address',
        'R. Prefeito Maurício Fruet, 1200 - Cajuru, Curitiba - PR (Oficina Home Lithium)',
      )
      cajuruStore.set('phone', '(41) 3362-8000')
      cajuruStore.set('whatsapp', '+5541999887766')
      cajuruStore.set('manager', 'Marcos Oficina e Vendas')
      cajuruStore.set('status', 'ativa')
      app.save(cajuruStore)
    }

    // 2. Seed Categories
    const categoryNames = [
      'Patinetes',
      'Bicicletas elétricas',
      'Scooters',
      'Triciclos',
      'Produtos infantis',
      'Acessórios',
    ]
    const catMap = {}
    for (const name of categoryNames) {
      try {
        catMap[name] = app.findFirstRecordByData('categories', 'name', name)
      } catch (_) {
        const cat = new Record(categoriesCol)
        cat.set('name', name)
        cat.set('description', `Linha New Way Eletric - ${name}`)
        app.save(cat)
        catMap[name] = cat
      }
    }

    // 3. Seed Products (Navee and Segway Ninebot)
    const sampleProducts = [
      {
        name: 'Patinete Elétrico Navee S65',
        sku: 'NAV-S65-01',
        category: catMap['Patinetes'].id,
        brand: 'Navee',
        model: 'S65 Dual Suspension',
        sale_price: 6490,
        cost_price: 4100,
        min_stock: 2,
        status: 'ativo',
        track_serial: true,
        description:
          'Patinete Navee S65 com motor de pico 1000W, autonomia até 65km, suspensão dianteira e traseira com engrenagem especial, pneus tubeless auto-vedantes de 10 polegadas e proteção IPX5.',
        variants: [
          {
            name: 'Cinza Espacial - Bateria 48V 12.75Ah',
            sku: 'NAV-S65-GRY',
            sale_price: 6490,
            cost_price: 4100,
            track_serial: true,
            stockJockey: 3,
            stockCajuru: 2,
          },
        ],
      },
      {
        name: 'Patinete Elétrico Segway Ninebot F30',
        sku: 'SEG-F30-01',
        category: catMap['Patinetes'].id,
        brand: 'Segway Ninebot',
        model: 'Ninebot KickScooter F30',
        sale_price: 3990,
        cost_price: 2600,
        min_stock: 2,
        status: 'ativo',
        track_serial: true,
        description:
          'Ninebot F30 com freio a disco traseiro regenerativo, autonomia de até 30km, velocidade máx de 25km/h e pneus de 10 polegadas com câmara de ar macia para conforto urbano.',
        variants: [
          {
            name: 'Preto Grafite - Bateria 36V 7.8Ah',
            sku: 'SEG-F30-BLK',
            sale_price: 3990,
            cost_price: 2600,
            track_serial: true,
            stockJockey: 4,
            stockCajuru: 3,
          },
        ],
      },
      {
        name: 'Bicicleta Elétrica Navee V40',
        sku: 'NAV-V40-01',
        category: catMap['Bicicletas elétricas'].id,
        brand: 'Navee',
        model: 'V40 Urban E-Bike',
        sale_price: 5290,
        cost_price: 3400,
        min_stock: 1,
        status: 'ativo',
        track_serial: true,
        description:
          'E-bike urbana dobrável Navee V40, motor 350W traseiro com sensor de torque, display digital integrado e suporte a AirTag/rastreamento oculto.',
        variants: [
          {
            name: 'Preto Fosco - Aro 20"',
            sku: 'NAV-V40-BLK',
            sale_price: 5290,
            cost_price: 3400,
            track_serial: true,
            stockJockey: 2,
            stockCajuru: 2,
          },
        ],
      },
      {
        name: 'Scooter Elétrica Navee ES40',
        sku: 'NAV-ES40-01',
        category: catMap['Scooters'].id,
        brand: 'Navee',
        model: 'ES40 Comfort Max',
        sale_price: 7890,
        cost_price: 5100,
        min_stock: 1,
        status: 'ativo',
        track_serial: true,
        description:
          'Scooter elétrica potente com assento ergonômico opcional, rodas de 11 polegadas, duplo amortecedor a gás e autonomia de até 75km em ciclo eco.',
        variants: [
          {
            name: 'Branco Pérola / Preto - 52V 18Ah',
            sku: 'NAV-ES40-WHT',
            sale_price: 7890,
            cost_price: 5100,
            track_serial: true,
            stockJockey: 2,
            stockCajuru: 1,
          },
        ],
      },
      {
        name: 'Capacete Urbano Smart com LED',
        sku: 'ACS-CAP-01',
        category: catMap['Acessórios'].id,
        brand: 'Segway Ninebot',
        model: 'Smart Commuter Helmet',
        sale_price: 389,
        cost_price: 190,
        min_stock: 5,
        status: 'ativo',
        track_serial: false,
        description:
          'Capacete leve com ventilação ativa, sinalizador LED traseiro recarregável USB e ajuste de precisão por catraca micrométrica.',
        variants: [
          {
            name: 'Tamanho M - Preto',
            sku: 'ACS-CAP-M-BLK',
            sale_price: 389,
            cost_price: 190,
            track_serial: false,
            stockJockey: 6,
            stockCajuru: 4,
          },
          {
            name: 'Tamanho G - Cinza Titânio',
            sku: 'ACS-CAP-G-GRY',
            sale_price: 389,
            cost_price: 190,
            track_serial: false,
            stockJockey: 5,
            stockCajuru: 3,
          },
        ],
      },
    ]

    for (const pData of sampleProducts) {
      let prodRec
      try {
        prodRec = app.findFirstRecordByData('products', 'sku', pData.sku)
      } catch (_) {
        prodRec = new Record(productsCol)
        prodRec.set('name', pData.name)
        prodRec.set('sku', pData.sku)
        prodRec.set('category', pData.category)
        prodRec.set('brand', pData.brand)
        prodRec.set('model', pData.model)
        prodRec.set('sale_price', pData.sale_price)
        prodRec.set('cost_price', pData.cost_price)
        prodRec.set('min_stock', pData.min_stock)
        prodRec.set('status', pData.status)
        prodRec.set('track_serial', pData.track_serial)
        prodRec.set('description', pData.description)
        app.save(prodRec)
      }

      for (const vData of pData.variants) {
        let varRec
        try {
          varRec = app.findFirstRecordByData('product_variants', 'sku', vData.sku)
        } catch (_) {
          varRec = new Record(variantsCol)
          varRec.set('product', prodRec.id)
          varRec.set('name', vData.name)
          varRec.set('sku', vData.sku)
          varRec.set('sale_price', vData.sale_price)
          varRec.set('cost_price', vData.cost_price)
          varRec.set('track_serial', vData.track_serial)
          app.save(varRec)
        }

        // Stock in Jockey Plaza
        try {
          app.findRecordsByFilter(
            'stock_items',
            `product = '${prodRec.id}' && variant = '${varRec.id}' && store = '${jockeyStore.id}'`,
            '',
            1,
            0,
          )
        } catch (_) {
          const stkJ = new Record(stockItemsCol)
          stkJ.set('product', prodRec.id)
          stkJ.set('variant', varRec.id)
          stkJ.set('store', jockeyStore.id)
          stkJ.set('quantity', vData.stockJockey)
          app.save(stkJ)

          const movJ = new Record(stockMovementsCol)
          movJ.set('type', 'entrada')
          movJ.set('product', prodRec.id)
          movJ.set('variant', varRec.id)
          movJ.set('store', jockeyStore.id)
          movJ.set('quantity', vData.stockJockey)
          movJ.set('reason', 'Estoque inicial de implantação')
          movJ.set('source_ref', 'INICIAL-JOCKEY')
          app.save(movJ)
        }

        // Stock in Cajuru
        try {
          app.findRecordsByFilter(
            'stock_items',
            `product = '${prodRec.id}' && variant = '${varRec.id}' && store = '${cajuruStore.id}'`,
            '',
            1,
            0,
          )
        } catch (_) {
          const stkC = new Record(stockItemsCol)
          stkC.set('product', prodRec.id)
          stkC.set('variant', varRec.id)
          stkC.set('store', cajuruStore.id)
          stkC.set('quantity', vData.stockCajuru)
          app.save(stkC)

          const movC = new Record(stockMovementsCol)
          movC.set('type', 'entrada')
          movC.set('product', prodRec.id)
          movC.set('variant', varRec.id)
          movC.set('store', cajuruStore.id)
          movC.set('quantity', vData.stockCajuru)
          movC.set('reason', 'Estoque inicial de implantação')
          movC.set('source_ref', 'INICIAL-CAJURU')
          app.save(movC)
        }
      }
    }

    // 4. Seed 1 Sample Customer
    let sampleCust
    try {
      sampleCust = app.findFirstRecordByData('customers', 'document', '12345678909')
    } catch (_) {
      sampleCust = new Record(customersCol)
      sampleCust.set('name', 'Rodrigo Mendes de Oliveira')
      sampleCust.set('phone', '+5541998765432')
      sampleCust.set('document', '12345678909')
      sampleCust.set('email', 'rodrigo.mendes@exemplo.com.br')
      sampleCust.set('address', 'Rua XV de Novembro, 1500 - Centro, Curitiba - PR')
      sampleCust.set(
        'notes',
        'Cliente realizou test-ride no Shopping Jockey Plaza. Muito interessado na garantia de 1 ano e suporte técnico da bateria na loja Cajuru.',
      )
      app.save(sampleCust)
    }

    // 5. Seed Settings (Discount and installment limits without invented commercial percentages - starting zero/empty for admin to configure)
    const defaultSettings = [
      { key: 'max_discount_pix', value: '10' },
      { key: 'max_discount_dinheiro', value: '10' },
      { key: 'max_discount_cartao_credito', value: '5' },
      { key: 'max_installments_cartao_credito', value: '12' },
      { key: 'company_name', value: 'New Way Eletric' },
      { key: 'company_cnpj', value: '45.123.789/0001-90' },
      { key: 'company_phone', value: '(41) 3216-9000' },
      { key: 'company_whatsapp', value: '+5541991234567' },
    ]

    for (const s of defaultSettings) {
      try {
        app.findFirstRecordByData('settings', 'key', s.key)
      } catch (_) {
        const settingRec = new Record(settingsCol)
        settingRec.set('key', s.key)
        settingRec.set('value', s.value)
        app.save(settingRec)
      }
    }
  },
  (app) => {},
)

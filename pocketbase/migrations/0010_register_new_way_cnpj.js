migrate(
  (app) => {
    // D.10 / CNPJ-01 / CNPJ-03: CNPJ real da New Way, informado pelo dono em
    // 03/11/2026, com os dados públicos da Receita (consulta BrasilAPI) e a
    // inscrição estadual (PR) informada por ele.
    // Hoje as duas lojas (Jockey e Cajuru) emitem NF e compram por ele. O
    // segundo CNPJ entra quando for usado; trocar o CNPJ de uma loja vale só
    // para os registros novos.
    const CNPJ = '65321600000105'
    const IE = '9120881202'

    const own = app.findRecordsByFilter('organizations', "type = 'propria'", 'created', 1, 0)
    if (own.length === 0) throw new Error('Organização própria não encontrada (migration 0007).')
    const orgId = own[0].id

    let le = null
    const existing = app.findRecordsByFilter('legal_entities', "cnpj = '" + CNPJ + "'", '', 1, 0)
    if (existing.length > 0) {
      le = existing[0]
    } else {
      le = new Record(app.findCollectionByNameOrId('legal_entities'))
      le.set('org', orgId)
      le.set('razao_social', 'NEW WAY ELETRIC LTDA')
      le.set('nome_fantasia', 'NEW WAY ELETRIC')
      le.set('cnpj', CNPJ)
      le.set('ie', IE)
      le.set('ie_isento', false)
      le.set('matriz_filial', 'matriz')
      le.set('cnae_principal', '4763603')
      le.set('cnaes_secundarios', ['4541203', '4541204'])
      le.set('regime', 'simples_nacional')
      le.set('regime_valid_from', '2026-02-25 00:00:00.000Z')
      le.set('address', {
        cep: '82900300',
        logradouro: 'RUA SANTO ANDRÉ',
        numero: '59',
        complemento: '',
        bairro: 'CAJURU',
        municipio: 'CURITIBA',
        ibge: '4106902',
        uf: 'PR',
      })
      le.set('active', true)
      app.save(le)
    }

    if (!le.getString('ie')) {
      le.set('ie', IE)
      app.save(le)
    }

    // Endereço real da loja Cajuru (o mesmo do CNPJ), no lugar do endereço
    // de exemplo da semente 0003. Não mexe se alguém já tiver editado.
    const cajuru = app.findRecordsByFilter('stores', "slug = 'cajuru'", '', 1, 0)
    if (cajuru.length > 0) {
      const current = cajuru[0].getString('address')
      if (!current || current.indexOf('Prefeito Maurício Fruet, 1200') !== -1) {
        cajuru[0].set('address', 'Rua Santo André, 59 - Cajuru, Curitiba - PR, 82900-300')
        app.save(cajuru[0])
      }
    }

    // As duas lojas usam este CNPJ hoje.
    for (const slug of ['jockey-plaza', 'cajuru']) {
      const stores = app.findRecordsByFilter('stores', "slug = '" + slug + "'", '', 1, 0)
      if (stores.length === 0) continue
      const store = stores[0]
      if (!store.getString('legal_entity')) {
        store.set('legal_entity', le.id)
        app.save(store)
      }
    }

    // Histórico: tudo o que a New Way lançou até aqui foi por este CNPJ.
    for (const name of [
      'sales',
      'sale_payments',
      'sale_returns',
      'card_receivables',
      'commissions',
      'financial_accounts',
      'financial_transactions',
      'recurring_expenses',
      'expenses',
      'payments',
    ]) {
      app
        .db()
        .newQuery(
          'UPDATE ' + name + " SET legal_entity = {:le} WHERE org = {:org} AND (legal_entity = '' OR legal_entity IS NULL)",
        )
        .bind({ le: le.id, org: orgId })
        .execute()
    }
  },
  (app) => {
    // Sem down: o CNPJ é dado real da empresa.
  },
)

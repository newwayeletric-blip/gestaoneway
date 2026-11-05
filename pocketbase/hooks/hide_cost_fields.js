/**
 * PRD-02 / CLI-06: custo nunca sai da API para quem não é admin ativo.
 * onRecordEnrich roda em list, view, expand, realtime e respostas de
 * create/update, então o campo some de todas as respostas.
 */
onRecordEnrich(
  (e) => {
    const auth = e.requestInfo ? e.requestInfo.auth : null
    const isSuperuser = !!auth && auth.collection().name === '_superusers'
    const isAdmin =
      !!auth &&
      auth.collection().name === 'users' &&
      auth.getString('profile') === 'admin' &&
      auth.getString('status') === 'ativo'

    if (!isSuperuser && !isAdmin) {
      e.record.hide('cost_price', 'cost_price_snapshot')
    }
    return e.next()
  },
  'products',
  'product_variants',
  'sale_items',
)

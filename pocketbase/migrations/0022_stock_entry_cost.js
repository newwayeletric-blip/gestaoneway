// Custo da compra na entrada de estoque (dono, 24/11/2026): o mesmo modelo
// pode ser comprado por valores diferentes. Cada entrada guarda o custo
// unitário daquela compra, e o custo do produto passa a ser a média ponderada
// (hook stock_manual.js). Só o administrador vê o campo (hide_cost_fields.js).
migrate(
  (app) => {
    const movements = app.findCollectionByNameOrId('stock_movements')
    if (!movements.fields.getByName('unit_cost')) {
      movements.fields.add(new NumberField({ name: 'unit_cost', min: 0 }))
    }
    app.save(movements)
  },
  (app) => {
    const movements = app.findCollectionByNameOrId('stock_movements')
    if (movements.fields.getByName('unit_cost')) movements.fields.removeByName('unit_cost')
    app.save(movements)
  },
)

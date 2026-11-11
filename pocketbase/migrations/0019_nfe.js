// NF-e automática pelo Bling (dono, 11/11/2026): quando o administrador
// libera a venda, o servidor cria a nota no Bling e envia direto para a
// Sefaz (pocketbase/hooks/nfe.js).
// - customers: endereço separado, como a NF-e pede (o campo address, texto
//   livre, continua para os cadastros antigos).
// - products: NCM próprio; vazio usa o NCM padrão da conexão com o Bling.
// - integrations: natureza de operação e NCM padrão das notas.
// - sales: situação da NF (aguardando_admin, emitindo, autorizada, erro), o
//   motivo do erro, o id da nota no Bling, a chave de acesso e quando saiu.
//   O número da nota vai no invoice_number, que já existia.
migrate(
  (app) => {
    const add = (name, fields) => {
      const col = app.findCollectionByNameOrId(name)
      for (const f of fields) {
        if (!col.fields.getByName(f.name)) col.fields.add(f)
      }
      app.save(col)
    }
    add('customers', [
      new TextField({ name: 'cep' }),
      new TextField({ name: 'street' }),
      new TextField({ name: 'street_number' }),
      new TextField({ name: 'complement' }),
      new TextField({ name: 'district' }),
      new TextField({ name: 'city' }),
      new TextField({ name: 'uf' }),
    ])
    add('products', [new TextField({ name: 'ncm' })])
    add('integrations', [
      new NumberField({ name: 'nfe_natureza_id' }),
      new TextField({ name: 'nfe_natureza_name' }),
      new TextField({ name: 'nfe_ncm_default' }),
    ])
    add('sales', [
      new SelectField({
        name: 'nf_status',
        values: ['aguardando_admin', 'emitindo', 'autorizada', 'erro'],
        maxSelect: 1,
      }),
      new TextField({ name: 'nf_error' }),
      new TextField({ name: 'nf_bling_id' }),
      new TextField({ name: 'nf_key' }),
      new NumberField({ name: 'nf_started_at' }),
      new DateField({ name: 'nf_issued_at' }),
    ])
  },
  (app) => {
    const drop = (name, fields) => {
      const col = app.findCollectionByNameOrId(name)
      for (const f of fields) {
        if (col.fields.getByName(f)) col.fields.removeByName(f)
      }
      app.save(col)
    }
    drop('customers', ['cep', 'street', 'street_number', 'complement', 'district', 'city', 'uf'])
    drop('products', ['ncm'])
    drop('integrations', ['nfe_natureza_id', 'nfe_natureza_name', 'nfe_ncm_default'])
    drop('sales', [
      'nf_status',
      'nf_error',
      'nf_bling_id',
      'nf_key',
      'nf_started_at',
      'nf_issued_at',
    ])
  },
)

migrate(
  (app) => {
    // 1. Atualizar regras de acesso de sale_documents para armazenamento estritamente privado
    // Vendedor só acessa documentos das suas próprias vendas (@request.auth.id != '' && (@request.auth.profile = 'admin' || sale.seller = @request.auth.id))
    // Admin acessa tudo (@request.auth.profile = 'admin')
    const saleDocs = app.findCollectionByNameOrId('sale_documents')
    saleDocs.listRule =
      "@request.auth.id != '' && (@request.auth.profile = 'admin' || sale.seller = @request.auth.id)"
    saleDocs.viewRule =
      "@request.auth.id != '' && (@request.auth.profile = 'admin' || sale.seller = @request.auth.id)"
    saleDocs.createRule = "@request.auth.id != ''"
    saleDocs.updateRule = "@request.auth.profile = 'admin'"
    saleDocs.deleteRule = "@request.auth.profile = 'admin'"

    // Adiciona doc_type e file_size se ainda não existirem no schema do PB
    if (!saleDocs.fields.getByName('doc_type')) {
      saleDocs.fields.add(
        new SelectField({
          name: 'doc_type',
          values: [
            'nota_fiscal',
            'comprovante_pagamento',
            'recibo_entrega',
            'termo_garantia',
            'outro',
          ],
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!saleDocs.fields.getByName('file_size')) {
      saleDocs.fields.add(
        new NumberField({
          name: 'file_size',
          required: false,
        }),
      )
    }
    app.save(saleDocs)

    // 2. Coleção transaction_attachments para múltiplos comprovantes vinculados a pagamentos, despesas e reembolsos
    // Apenas admin tem acesso às finanças
    const finTrans = app.findCollectionByNameOrId('financial_transactions')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!app.hasTable('transaction_attachments')) {
      const txAttachments = new Collection({
        name: 'transaction_attachments',
        type: 'base',
        listRule: "@request.auth.profile = 'admin'",
        viewRule: "@request.auth.profile = 'admin'",
        createRule: "@request.auth.profile = 'admin'",
        updateRule: "@request.auth.profile = 'admin'",
        deleteRule: "@request.auth.profile = 'admin'",
        fields: [
          {
            name: 'transaction',
            type: 'relation',
            collectionId: finTrans.id,
            maxSelect: 1,
            required: true,
          },
          {
            name: 'file',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760, // 10MB
            mimeTypes: [
              'application/pdf',
              'image/jpeg',
              'image/png',
              'image/webp',
              'text/xml',
              'application/xml',
            ],
            required: true,
          },
          { name: 'name', type: 'text', required: true },
          { name: 'file_size', type: 'number' },
          {
            name: 'uploaded_by',
            type: 'relation',
            collectionId: users.id,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_tx_att_trans ON transaction_attachments (transaction)'],
      })
      app.save(txAttachments)
    }
  },
  (app) => {
    try {
      const txAttachments = app.findCollectionByNameOrId('transaction_attachments')
      app.delete(txAttachments)
    } catch (_) {}
  },
)

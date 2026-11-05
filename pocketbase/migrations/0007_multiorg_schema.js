migrate(
  (app) => {
    // PRD v1.1 — base multiempresa (RED-01/02, PER-01, CNPJ-01/03, ARQ-02).
    // - organizations: a rede (franqueadora), a New Way ("propria") e cada franqueado.
    // - legal_entities: os CNPJs de cada organização. Cada loja aponta para um.
    // - org (e legal_entity nos registros financeiros) em todas as coleções,
    //   preenchidos pelo servidor (pocketbase/hooks/org_*.js).
    // Tudo o que já existe na base pertence à New Way.
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Organizações -------------------------------------------------------
    if (!app.hasTable('organizations')) {
      app.save(
        new Collection({
          name: 'organizations',
          type: 'base',
          // Regras definitivas na 0008.
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            { name: 'name', type: 'text', required: true },
            {
              name: 'type',
              type: 'select',
              values: ['rede', 'propria', 'franquia'],
              maxSelect: 1,
              required: true,
            },
            {
              name: 'status',
              type: 'select',
              values: ['implantacao', 'ativa', 'suspensa', 'encerrada'],
              maxSelect: 1,
              required: true,
            },
            { name: 'region', type: 'text' },
            // Consultor de campo da franqueadora responsável (D.8 cenário 26).
            { name: 'consultant', type: 'relation', collectionId: usersCol.id, maxSelect: 1 },
            // Nível de compartilhamento com a rede (ESC-06, Fase 3B).
            {
              name: 'share_level',
              type: 'select',
              values: ['basico', 'gerencial', 'completo'],
              maxSelect: 1,
            },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_organizations_type ON organizations (type)'],
        }),
      )
    }
    const orgsCol = app.findCollectionByNameOrId('organizations')

    const findOrg = (type) => {
      const rows = app.findRecordsByFilter('organizations', "type = '" + type + "'", 'created', 1, 0)
      return rows.length > 0 ? rows[0] : null
    }
    let network = findOrg('rede')
    if (!network) {
      network = new Record(orgsCol)
      network.set('name', 'Rede New Way')
      network.set('type', 'rede')
      network.set('status', 'ativa')
      app.save(network)
    }
    let own = findOrg('propria')
    if (!own) {
      own = new Record(orgsCol)
      own.set('name', 'New Way Eletric')
      own.set('type', 'propria')
      own.set('status', 'ativa')
      app.save(own)
    }

    // 2. CNPJs (legal_entities) ----------------------------------------------
    // Os CNPJs reais são cadastrados depois; aqui não entra nenhum dado inventado.
    if (!app.hasTable('legal_entities')) {
      app.save(
        new Collection({
          name: 'legal_entities',
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: [
            { name: 'org', type: 'relation', collectionId: orgsCol.id, maxSelect: 1, required: true },
            { name: 'razao_social', type: 'text', required: true },
            { name: 'nome_fantasia', type: 'text' },
            // 14 caracteres, sem pontuação. Aceita o CNPJ alfanumérico (a partir de 07/2026).
            { name: 'cnpj', type: 'text', required: true },
            { name: 'matriz_filial', type: 'select', values: ['matriz', 'filial'], maxSelect: 1 },
            { name: 'ie', type: 'text' },
            { name: 'ie_isento', type: 'bool' },
            { name: 'im', type: 'text' },
            { name: 'cnae_principal', type: 'text' },
            { name: 'cnaes_secundarios', type: 'json' },
            {
              name: 'regime',
              type: 'select',
              values: ['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real'],
              maxSelect: 1,
            },
            { name: 'regime_valid_from', type: 'date' },
            // { cep, logradouro, numero, complemento, bairro, municipio, ibge, uf }
            { name: 'address', type: 'json' },
            { name: 'accountant_contact', type: 'text' },
            { name: 'fiscal_email', type: 'text' },
            { name: 'fiscal_env', type: 'select', values: ['homologacao', 'producao'], maxSelect: 1 },
            // FIS-08: o certificado A1 fica no provedor fiscal; aqui só a referência.
            { name: 'cert_ref', type: 'text' },
            { name: 'cert_expires_at', type: 'date' },
            { name: 'active', type: 'bool' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE UNIQUE INDEX idx_legal_entities_cnpj ON legal_entities (cnpj)',
            'CREATE INDEX idx_legal_entities_org ON legal_entities (org)',
          ],
        }),
      )
    }
    const legalCol = app.findCollectionByNameOrId('legal_entities')

    // 3. org (e legal_entity) em todas as coleções ---------------------------
    // [coleção, tem legal_entity?, org obrigatório?]
    const targets = [
      ['users', false, true],
      ['stores', true, true],
      ['categories', false, true],
      ['products', false, true],
      ['product_variants', false, true],
      ['stock_items', false, true],
      ['stock_movements', false, true],
      ['transfers', false, true],
      ['transfer_items', false, true],
      ['customers', false, true],
      ['sales', true, true],
      ['sale_items', false, true],
      ['sale_documents', false, true],
      ['sale_payments', true, true],
      ['expenses', true, true],
      ['payments', true, true],
      ['commissions', true, true],
      ['commission_rules', false, true],
      ['settings', false, true],
      ['financial_accounts', true, true],
      ['financial_categories', false, true],
      ['financial_transactions', true, true],
      ['card_receivables', true, true],
      ['recurring_expenses', true, true],
      ['expense_allocations', false, true],
      ['sale_returns', true, true],
      ['monthly_closings', true, true],
      // Auditoria é gravada por hooks em qualquer situação; não pode falhar por falta de org.
      ['audit_logs', false, false],
      ['transaction_attachments', false, true],
    ]

    for (const t of targets) {
      const name = t[0]
      const col = app.findCollectionByNameOrId(name)
      if (!col.fields.getByName('org')) {
        col.fields.add(
          new RelationField({ name: 'org', collectionId: orgsCol.id, maxSelect: 1, required: false }),
        )
      }
      if (t[1] && !col.fields.getByName('legal_entity')) {
        col.fields.add(
          new RelationField({
            name: 'legal_entity',
            collectionId: legalCol.id,
            maxSelect: 1,
            required: false,
          }),
        )
      }
      col.addIndex('idx_' + name + '_org', false, 'org', '')
      app.save(col)

      app
        .db()
        .newQuery('UPDATE ' + name + " SET org = {:org} WHERE org = '' OR org IS NULL")
        .bind({ org: own.id })
        .execute()

      if (t[2]) {
        const again = app.findCollectionByNameOrId(name)
        again.fields.getByName('org').required = true
        app.save(again)
      }
    }

    // 4. Papel na rede (PER-01). O usuário pertence a uma organização; quem
    //    também trabalha na franqueadora recebe um papel de rede, sem precisar
    //    de uma segunda conta.
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('network_role')) {
      users.fields.add(
        new SelectField({
          name: 'network_role',
          values: ['admin_rede', 'financeiro_rede', 'consultor', 'catalogo'],
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(users)
    }
    // O primeiro administrador cadastrado (o dono) vira admin da rede.
    const firstAdmin = app.findRecordsByFilter('users', "profile = 'admin'", 'created', 1, 0)
    if (firstAdmin.length > 0 && !firstAdmin[0].getString('network_role')) {
      app
        .db()
        .newQuery("UPDATE users SET network_role = 'admin_rede' WHERE id = {:id}")
        .bind({ id: firstAdmin[0].id })
        .execute()
    }

    // 5. Unicidade por organização (ARQ-02) ----------------------------------
    const replaceIndex = (name, oldIndex, newIndex, columns) => {
      const col = app.findCollectionByNameOrId(name)
      col.removeIndex(oldIndex)
      col.addIndex(newIndex, true, columns, '')
      app.save(col)
    }
    replaceIndex('sales', 'idx_sales_number', 'idx_sales_org_number', 'org, number')
    replaceIndex('products', 'idx_products_sku', 'idx_products_org_sku', 'org, sku')
    replaceIndex('product_variants', 'idx_variants_sku', 'idx_variants_org_sku', 'org, sku')
    replaceIndex('categories', 'idx_categories_name', 'idx_categories_org_name', 'org, name')
    replaceIndex('settings', 'idx_settings_key', 'idx_settings_org_key', 'org, key')
    replaceIndex(
      'monthly_closings',
      'idx_closing_year_month_store',
      'idx_closing_org_year_month_store',
      'org, year, month, store',
    )

    // 6. Documento do cliente: só letras e dígitos, único por organização
    //    (o mesmo CPF pode ser cliente de duas franquias — D.8 cenário 29).
    const withDocument = app.findRecordsByFilter('customers', "document != ''", '', 0, 0)
    const seen = {}
    const duplicated = []
    for (const c of withDocument) {
      const raw = c.getString('document')
      const normalized = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
      if (normalized !== raw) {
        app
          .db()
          .newQuery('UPDATE customers SET document = {:doc} WHERE id = {:id}')
          .bind({ doc: normalized, id: c.id })
          .execute()
      }
      if (!normalized) continue
      const key = c.getString('org') + '|' + normalized
      if (seen[key]) duplicated.push(normalized)
      seen[key] = true
    }
    if (duplicated.length === 0) {
      const customers = app.findCollectionByNameOrId('customers')
      customers.addIndex('idx_customers_org_document', true, 'org, document', "document != ''")
      app.save(customers)
    } else {
      // Não apaga nem junta cadastros sozinho: o hook já bloqueia novas
      // duplicidades, e o índice entra depois que o admin unificar estes.
      console.log(
        '[0007] Índice único de documento adiado: clientes com documento repetido: ' +
          duplicated.join(', '),
      )
    }
  },
  (app) => {
    // Sem down: remover org de todas as coleções desfaria o isolamento.
  },
)

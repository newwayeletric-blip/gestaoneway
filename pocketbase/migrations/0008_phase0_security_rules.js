migrate(
  (app) => {
    // Fase 0 do PRD (D.5 + ARQ-01). Toda regra exige:
    //   - usuário logado E ativo (USR-03): desativar corta a API, não só a tela;
    //   - o registro ser da organização do usuário (isolamento entre franquias).
    // org e legal_entity são preenchidos pelo servidor (hooks org_*.js); o
    // navegador nunca escolhe a organização de um registro.
    const ACTIVE = "@request.auth.id != '' && @request.auth.status = 'ativo'"
    const IN_ORG = ACTIVE + ' && org = @request.auth.org'
    // Admin agindo sobre um registro da própria organização.
    const ADMIN = IN_ORG + " && @request.auth.profile = 'admin'"
    // Admin criando um registro: a organização vem do servidor, não do corpo.
    const ADMIN_CREATE = ACTIVE + " && @request.auth.profile = 'admin'"
    const NETWORK_ADMIN = ACTIVE + " && @request.auth.network_role = 'admin_rede'"
    const OWN_SALE = IN_ORG + " && (@request.auth.profile = 'admin' || sale.seller = @request.auth.id)"
    const any = (...parts) => parts.map((p) => '(' + p + ')').join(' || ')
    const unchanged = (...fields) => fields.map((f) => ' && @request.body.' + f + ':changed = false').join('')

    const setRules = (name, rules) => {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = rules.list
      col.viewRule = rules.view
      col.createRule = rules.create
      col.updateRule = rules.update
      col.deleteRule = rules.remove
      app.save(col)
    }

    // ---------------------------------------------------------------
    // 1. Usuários: sem cadastro público (USR-01). O primeiro admin é
    //    criado pela rota /backend/v1/setup (pocketbase/hooks/setup_first_admin.js).
    // ---------------------------------------------------------------
    // Usuários antigos sem status ficariam trancados pela nova regra.
    const noStatus = app.findRecordsByFilter('users', "status = ''", '', 0, 0)
    for (const u of noStatus) {
      u.set('status', 'ativo')
      app.saveNoValidate(u)
    }

    setRules('users', {
      list: ACTIVE + " && (id = @request.auth.id || (org = @request.auth.org && @request.auth.profile = 'admin'))",
      view: ACTIVE + " && (id = @request.auth.id || (org = @request.auth.org && @request.auth.profile = 'admin'))",
      // O admin da organização cria usuários dela; o admin da rede cria o
      // proprietário de uma franquia (PER-02).
      create: any(ADMIN_CREATE, NETWORK_ADMIN),
      update: any(
        ADMIN,
        ACTIVE +
          ' && id = @request.auth.id' +
          unchanged('profile', 'status', 'stores', 'org', 'network_role', 'default_commission_rate', 'created_by'),
      ),
      remove: ADMIN,
    })

    // ---------------------------------------------------------------
    // 2. Rede: organizações e CNPJs.
    //    Franquia nova entra pela rota /backend/v1/network/franchises.
    // ---------------------------------------------------------------
    setRules('organizations', {
      list:
        ACTIVE +
        " && (id = @request.auth.org || @request.auth.network_role = 'admin_rede' || @request.auth.network_role = 'financeiro_rede' || @request.auth.network_role = 'catalogo' || (@request.auth.network_role = 'consultor' && consultant = @request.auth.id))",
      view:
        ACTIVE +
        " && (id = @request.auth.org || @request.auth.network_role = 'admin_rede' || @request.auth.network_role = 'financeiro_rede' || @request.auth.network_role = 'catalogo' || (@request.auth.network_role = 'consultor' && consultant = @request.auth.id))",
      create: null,
      update: NETWORK_ADMIN,
      remove: null,
    })
    const networkFinance =
      ACTIVE + " && (@request.auth.network_role = 'admin_rede' || @request.auth.network_role = 'financeiro_rede')"
    setRules('legal_entities', {
      list: any(IN_ORG, networkFinance),
      view: any(IN_ORG, networkFinance),
      create: any(ADMIN_CREATE, NETWORK_ADMIN),
      update: any(ADMIN, NETWORK_ADMIN),
      remove: null,
    })
    setRules('stores', {
      list: IN_ORG,
      view: IN_ORG,
      create: NETWORK_ADMIN,
      update: any(ADMIN, NETWORK_ADMIN),
      remove: null,
    })

    // ---------------------------------------------------------------
    // 3. Cadastros da organização: leitura para quem está ativo nela,
    //    escrita só do admin dela.
    // ---------------------------------------------------------------
    for (const name of ['categories', 'products', 'product_variants', 'commission_rules', 'settings']) {
      setRules(name, { list: IN_ORG, view: IN_ORG, create: ADMIN_CREATE, update: ADMIN, remove: ADMIN })
    }

    // ---------------------------------------------------------------
    // 4. Estoque (EST-02). Vendedor não escreve. O admin mantém a escrita
    //    direta só até as rotas de servidor da Fase 1 (EST-01) existirem.
    // ---------------------------------------------------------------
    const adminInStore = ADMIN_CREATE + ' && store.org = @request.auth.org'
    setRules('stock_items', { list: IN_ORG, view: IN_ORG, create: adminInStore, update: ADMIN, remove: null })
    setRules('stock_movements', { list: IN_ORG, view: IN_ORG, create: adminInStore, update: null, remove: null })
    setRules('transfers', {
      list: IN_ORG,
      view: IN_ORG,
      create:
        ADMIN_CREATE +
        ' && origin_store.org = @request.auth.org && destination_store.org = @request.auth.org',
      update: ADMIN,
      remove: null,
    })
    setRules('transfer_items', {
      list: IN_ORG,
      view: IN_ORG,
      create: ADMIN_CREATE + ' && transfer.org = @request.auth.org',
      update: ADMIN,
      remove: null,
    })

    // ---------------------------------------------------------------
    // 5. Clientes (CLI-04): a base é da organização. O vendedor cria e
    //    edita só endereço e observações. Nome, telefone, documento e
    //    e-mail mudam por solicitação aprovada pelo admin.
    // ---------------------------------------------------------------
    setRules('customers', {
      list: IN_ORG,
      view: IN_ORG,
      create: ACTIVE,
      update: any(ADMIN, IN_ORG + unchanged('name', 'phone', 'document', 'email', 'created_by')),
      remove: ADMIN,
    })

    const customersId = app.findCollectionByNameOrId('customers').id
    const orgsId = app.findCollectionByNameOrId('organizations').id
    if (!app.hasTable('customer_change_requests')) {
      app.save(
        new Collection({
          name: 'customer_change_requests',
          type: 'base',
          listRule: IN_ORG + " && (@request.auth.profile = 'admin' || requested_by = @request.auth.id)",
          viewRule: IN_ORG + " && (@request.auth.profile = 'admin' || requested_by = @request.auth.id)",
          createRule:
            ACTIVE +
            " && requested_by = @request.auth.id && status = 'pendente' && customer.org = @request.auth.org",
          updateRule: ADMIN,
          deleteRule: null,
          fields: [
            { name: 'org', type: 'relation', collectionId: orgsId, maxSelect: 1, required: true },
            {
              name: 'customer',
              type: 'relation',
              collectionId: customersId,
              maxSelect: 1,
              required: true,
            },
            {
              name: 'requested_by',
              type: 'relation',
              collectionId: '_pb_users_auth_',
              maxSelect: 1,
              required: true,
            },
            // Ex.: { "document": "12345678909", "phone": "+5541999990000" }
            { name: 'changes', type: 'json', required: true },
            { name: 'previous_values', type: 'json' },
            { name: 'reason', type: 'text' },
            {
              name: 'status',
              type: 'select',
              values: ['pendente', 'aprovada', 'rejeitada'],
              maxSelect: 1,
              required: true,
            },
            { name: 'reviewed_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'reviewed_at', type: 'date' },
            { name: 'review_note', type: 'text' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: [
            'CREATE INDEX idx_customer_change_requests_org ON customer_change_requests (org)',
            'CREATE INDEX idx_cust_change_status ON customer_change_requests (status)',
            'CREATE INDEX idx_cust_change_customer ON customer_change_requests (customer)',
          ],
        }),
      )
    }

    // ---------------------------------------------------------------
    // 6. Vendas: o vendedor só vende nas lojas autorizadas e só mexe no
    //    próprio rascunho, sem trocar status, loja, vendedor ou totais.
    // ---------------------------------------------------------------
    setRules('sales', {
      list: IN_ORG + " && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      view: IN_ORG + " && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      create: any(
        ADMIN_CREATE + ' && store.org = @request.auth.org',
        // "~" e não "?=": nas regras, a relação múltipla @request.auth.stores
        // chega como texto JSON (["id1","id2"]). Os ids têm tamanho fixo,
        // então "contém" só casa com uma loja realmente autorizada.
        ACTIVE +
          " && seller = @request.auth.id && status = 'rascunho' && store.org = @request.auth.org && @request.auth.stores ~ store",
      ),
      update: any(
        ADMIN,
        IN_ORG +
          " && seller = @request.auth.id && status = 'rascunho'" +
          unchanged('status', 'seller', 'store', 'subtotal', 'total_discount', 'total', 'authorized_by'),
      ),
      remove: ADMIN,
    })

    const draftOfMine = any(
      ADMIN_CREATE + ' && sale.org = @request.auth.org',
      ACTIVE + " && sale.seller = @request.auth.id && sale.status = 'rascunho'",
    )
    setRules('sale_items', { list: OWN_SALE, view: OWN_SALE, create: draftOfMine, update: ADMIN, remove: ADMIN })
    setRules('sale_payments', { list: OWN_SALE, view: OWN_SALE, create: draftOfMine, update: ADMIN, remove: ADMIN })
    setRules('sale_documents', {
      list: OWN_SALE,
      view: OWN_SALE,
      create: any(ADMIN_CREATE + ' && sale.org = @request.auth.org', ACTIVE + ' && sale.seller = @request.auth.id'),
      update: ADMIN,
      remove: ADMIN,
    })

    // ---------------------------------------------------------------
    // 7. Comissões (COM-04): ninguém cria pela API. O admin mantém a
    //    atualização (pagamento/estorno) até o fechamento da Fase 2.
    // ---------------------------------------------------------------
    setRules('commissions', {
      list: IN_ORG + " && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      view: IN_ORG + " && (@request.auth.profile = 'admin' || seller = @request.auth.id)",
      create: null,
      update: ADMIN,
      remove: null,
    })

    // ---------------------------------------------------------------
    // 8. Financeiro: só o admin da organização. Recebíveis não são
    //    criados nem apagados pela API; fechamento mensal não é apagado.
    // ---------------------------------------------------------------
    for (const name of [
      'expenses',
      'payments',
      'financial_accounts',
      'financial_categories',
      'financial_transactions',
      'recurring_expenses',
      'expense_allocations',
      'transaction_attachments',
    ]) {
      setRules(name, { list: ADMIN, view: ADMIN, create: ADMIN_CREATE, update: ADMIN, remove: ADMIN })
    }
    setRules('card_receivables', { list: ADMIN, view: ADMIN, create: null, update: ADMIN, remove: null })
    setRules('sale_returns', {
      list: ADMIN,
      view: ADMIN,
      create: ADMIN_CREATE + ' && sale.org = @request.auth.org',
      update: ADMIN,
      remove: null,
    })
    setRules('monthly_closings', { list: ADMIN, view: ADMIN, create: ADMIN_CREATE, update: ADMIN, remove: null })

    // ---------------------------------------------------------------
    // 9. Auditoria: só o servidor escreve (hooks usam app.save, que
    //    ignora as regras). Nenhum perfil cria, edita ou apaga.
    // ---------------------------------------------------------------
    setRules('audit_logs', { list: ADMIN, view: ADMIN, create: null, update: null, remove: null })

    // ---------------------------------------------------------------
    // 10. Arquivos (DOC-01): protegidos (exigem token temporário),
    //     com tipos e tamanho restritos.
    // ---------------------------------------------------------------
    const DOC_MIMES = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/xml',
      'application/xml',
    ]
    const IMG_MIMES = ['image/jpeg', 'image/png', 'image/webp']
    const TEN_MB = 10485760
    const FIVE_MB = 5242880

    const protectFile = (collectionName, fieldName, mimeTypes, maxSize) => {
      const col = app.findCollectionByNameOrId(collectionName)
      const field = col.fields.getByName(fieldName)
      if (!field) return
      field.protected = true
      field.mimeTypes = mimeTypes
      field.maxSize = maxSize
      app.save(col)
    }

    protectFile('sale_documents', 'file', DOC_MIMES, TEN_MB)
    protectFile('transaction_attachments', 'file', DOC_MIMES, TEN_MB)
    protectFile('financial_transactions', 'attachment', DOC_MIMES, TEN_MB)
    protectFile('products', 'photo', IMG_MIMES, FIVE_MB)
    protectFile('product_variants', 'photo', IMG_MIMES, FIVE_MB)
    protectFile('users', 'avatar', IMG_MIMES, FIVE_MB)
  },
  (app) => {
    // As regras antigas eram inseguras e não são restauradas no down.
    try {
      app.delete(app.findCollectionByNameOrId('customer_change_requests'))
    } catch (_) {}
  },
)

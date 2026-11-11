// Integrações externas por organização (dono, 11/11/2026): começa pelo Bling
// (NF-e). Guarda as chaves do aplicativo do Bling (client_id/secret, coladas
// pelo administrador em Configurações → Bling) e os tokens OAuth. Nenhuma
// regra de API: só os hooks do servidor (pocketbase/hooks/bling.js) leem e
// gravam; nada disso vai para o navegador. Datas em milissegundos (Unix).
migrate(
  (app) => {
    const orgs = app.findCollectionByNameOrId('organizations')
    const users = app.findCollectionByNameOrId('users')
    const col = new Collection({
      name: 'integrations',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'org', type: 'relation', collectionId: orgs.id, maxSelect: 1, required: true },
        { name: 'provider', type: 'select', values: ['bling'], maxSelect: 1, required: true },
        { name: 'client_id', type: 'text' },
        { name: 'client_secret', type: 'text' },
        { name: 'access_token', type: 'text' },
        { name: 'refresh_token', type: 'text' },
        { name: 'token_expires_at', type: 'number' },
        { name: 'oauth_state', type: 'text' },
        { name: 'oauth_state_expires_at', type: 'number' },
        { name: 'connected_at', type: 'number' },
        // Quem clicou em "Conectar ao Bling" (para a auditoria da volta do Bling).
        { name: 'connected_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
        { name: 'last_refresh_at', type: 'number' },
        { name: 'company_name', type: 'text' },
        { name: 'company_cnpj', type: 'text' },
        { name: 'last_error', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_integrations_org_provider ON integrations (org, provider)',
        'CREATE INDEX idx_integrations_state ON integrations (oauth_state)',
      ],
    })
    app.save(col)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('integrations'))
  },
)

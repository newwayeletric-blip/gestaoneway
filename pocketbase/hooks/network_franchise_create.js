/**
 * FRQ-01 (passos 1, 2, 3 e 6) / PER-02: o admin da rede cadastra uma
 * franquia nova numa única transação: organização, CNPJ, lojas e o usuário
 * proprietário. Se qualquer parte falhar, nada é gravado.
 * Contrato, catálogo e convite por e-mail entram depois (Fase 3B / USR-02);
 * até lá a senha inicial é definida aqui e o proprietário deve trocá-la.
 *
 * Corpo:
 * {
 *   "organization": { "name": "Silva Mobilidade", "region": "Curitiba" },
 *   "legal_entity": { "razao_social": "...", "cnpj": "...", "nome_fantasia": "...",
 *                     "matriz_filial": "matriz", "regime": "simples_nacional" },
 *   "stores": [{ "name": "Loja Batel", "slug": "batel", "address": "...", "phone": "..." }],
 *   "owner": { "name": "...", "email": "...", "password": "..." }
 * }
 */
routerAdd('POST', '/backend/v1/network/franchises', (e) => {
  const auth = e.auth
  const isNetworkAdmin =
    e.hasSuperuserAuth() ||
    (!!auth &&
      auth.collection().name === 'users' &&
      auth.getString('status') === 'ativo' &&
      auth.getString('network_role') === 'admin_rede')
  if (!isNetworkAdmin) {
    throw new ForbiddenError('Apenas o admin da rede cadastra franquias.')
  }

  const body = e.requestInfo().body || {}
  const organization = body.organization || {}
  const legalEntity = body.legal_entity || {}
  const stores = []
  const rawStores = body.stores
  if (rawStores && typeof rawStores === 'object' && rawStores.length) {
    for (let i = 0; i < rawStores.length; i++) stores.push(rawStores[i] || {})
  }
  const owner = body.owner || {}
  const text = (v) => String(v || '').trim()

  if (!text(organization.name)) throw new BadRequestError('Informe o nome da franquia.')
  if (!text(legalEntity.razao_social) || !text(legalEntity.cnpj)) {
    throw new BadRequestError('Informe a razão social e o CNPJ.')
  }
  if (stores.length === 0) throw new BadRequestError('Informe ao menos uma loja.')
  for (const s of stores) {
    if (!text(s.name) || !text(s.slug)) throw new BadRequestError('Cada loja precisa de nome e identificador (slug).')
  }
  if (!text(owner.name) || text(owner.email).indexOf('@') < 1) {
    throw new BadRequestError('Informe nome e e-mail do proprietário.')
  }
  if (String(owner.password || '').length < 10) {
    throw new BadRequestError('A senha inicial do proprietário deve ter no mínimo 10 caracteres.')
  }

  const result = {}
  $app.runInTransaction((txApp) => {
    const org = new Record(txApp.findCollectionByNameOrId('organizations'))
    org.set('name', text(organization.name))
    org.set('type', 'franquia')
    org.set('status', 'implantacao')
    org.set('region', text(organization.region))
    txApp.save(org)

    const le = new Record(txApp.findCollectionByNameOrId('legal_entities'))
    le.set('org', org.id)
    le.set('razao_social', text(legalEntity.razao_social))
    le.set('nome_fantasia', text(legalEntity.nome_fantasia))
    le.set('cnpj', text(legalEntity.cnpj))
    le.set('matriz_filial', text(legalEntity.matriz_filial) || 'matriz')
    if (text(legalEntity.regime)) le.set('regime', text(legalEntity.regime))
    le.set('active', true)
    txApp.save(le)

    const storeIds = []
    const storesCol = txApp.findCollectionByNameOrId('stores')
    for (const s of stores) {
      const st = new Record(storesCol)
      st.set('org', org.id)
      st.set('legal_entity', le.id)
      st.set('name', text(s.name))
      st.set('slug', text(s.slug))
      st.set('address', text(s.address))
      st.set('phone', text(s.phone))
      st.set('status', 'ativa')
      txApp.save(st)
      storeIds.push(st.id)
    }

    const user = new Record(txApp.findCollectionByNameOrId('users'))
    user.set('org', org.id)
    user.set('name', text(owner.name))
    user.setEmail(text(owner.email))
    user.setPassword(String(owner.password))
    user.setVerified(true)
    user.set('profile', 'admin')
    user.set('status', 'ativo')
    user.set('stores', storeIds)
    if (auth && auth.collection().name === 'users') user.set('created_by', auth.id)
    txApp.save(user)

    if (auth && auth.collection().name === 'users') {
      const audit = new Record(txApp.findCollectionByNameOrId('audit_logs'))
      audit.set('entity', 'organizations')
      audit.set('record_id', org.id)
      audit.set('action', 'criacao')
      audit.set('user', auth.id)
      audit.set('reason', 'Cadastro de franquia: ' + text(organization.name))
      audit.set('new_values', {
        organization: org.id,
        legal_entity: le.id,
        stores: storeIds,
        owner: user.id,
      })
      audit.set('ip_address', e.realIP())
      txApp.save(audit)
    }

    result.organization = org.id
    result.legal_entity = le.id
    result.stores = storeIds
    result.owner = user.id
  })

  return e.json(201, result)
})

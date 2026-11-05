/**
 * FRQ-01 (passos 1, 2, 3 e 6) / PER-02: o admin da rede cadastra uma
 * franquia nova numa única transação: organização, CNPJ, lojas e o usuário
 * proprietário. Se qualquer parte falhar, nada é gravado.
 * Contrato, catálogo e convite por e-mail entram depois (Fase 3B / USR-02);
 * até lá a senha inicial é definida aqui e o proprietário deve trocá-la.
 * Os erros de preenchimento dizem o campo (data.<campo>), para a tela voltar
 * ao passo certo do cadastro.
 *
 * Corpo:
 * {
 *   "organization": { "name": "Silva Mobilidade", "region": "Curitiba" },
 *   "legal_entity": { "razao_social": "...", "cnpj": "...", "nome_fantasia": "...",
 *                     "matriz_filial": "matriz", "regime": "simples_nacional",
 *                     "ie": "...", "ie_isento": false, "fiscal_email": "...",
 *                     "accountant_contact": "...",
 *                     "address": { "cep": "...", "logradouro": "...", "numero": "...",
 *                                  "complemento": "...", "bairro": "...",
 *                                  "municipio": "...", "uf": "PR" } },
 *   "stores": [{ "name": "Loja Batel", "address": "...", "phone": "...", "whatsapp": "..." }],
 *   "owner": { "name": "...", "email": "...", "password": "..." }
 * }
 * O identificador da loja (slug) é opcional: sem ele, o servidor gera um a
 * partir do nome (pocketbase/hooks/stores_defaults.js).
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
  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  const fail = (field, message) => {
    const data = {}
    data[field] = new ValidationError('validation_franchise_' + field, message)
    throw new BadRequestError(message, data)
  }

  // 1. Franquia
  const orgName = text(organization.name)
  if (!orgName) fail('name', 'Informe o nome da franquia.')
  const sameName = $app.findRecordsByFilter('organizations', "id != ''", '', 0, 0)
  for (const o of sameName) {
    if (o.getString('name').trim().toLowerCase() === orgName.toLowerCase()) {
      fail(
        'name',
        'Já existe uma organização chamada "' +
          orgName +
          '". Use outro nome, por exemplo com a cidade.',
      )
    }
  }

  // 2. CNPJ (o dígito verificador é conferido em legal_entities_validate.js)
  const cnpj = text(legalEntity.cnpj)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
  if (!cnpj) fail('cnpj', 'Informe o CNPJ.')
  if (!text(legalEntity.razao_social)) fail('razao_social', 'Informe a razão social.')
  const sameCnpj = $app.findRecordsByFilter('legal_entities', 'cnpj = {:cnpj}', '', 1, 0, {
    cnpj: cnpj,
  })
  if (sameCnpj.length > 0) {
    let where = ''
    try {
      where = $app.findRecordById('organizations', sameCnpj[0].getString('org')).getString('name')
    } catch (_) {}
    fail('cnpj', 'Este CNPJ já está cadastrado' + (where ? ' em ' + where : '') + '.')
  }
  const regime = text(legalEntity.regime)
  if (
    regime &&
    ['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real'].indexOf(regime) === -1
  ) {
    fail('regime', 'Regime tributário inválido.')
  }
  const matrizFilial = text(legalEntity.matriz_filial) || 'matriz'
  if (['matriz', 'filial'].indexOf(matrizFilial) === -1)
    fail('matriz_filial', 'Informe se o CNPJ é matriz ou filial.')
  const fiscalEmail = text(legalEntity.fiscal_email)
  if (fiscalEmail && fiscalEmail.indexOf('@') < 1) fail('fiscal_email', 'E-mail fiscal inválido.')
  const ieExempt = legalEntity.ie_isento === true
  const rawAddress = legalEntity.address || {}
  const address = {}
  let hasAddress = false
  for (const key of ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf']) {
    address[key] = text(rawAddress[key])
    if (address[key]) hasAddress = true
  }
  address.cep = address.cep.replace(/\D/g, '')
  address.uf = address.uf.toUpperCase()
  if (address.cep && address.cep.length !== 8) fail('cep', 'O CEP precisa ter 8 dígitos.')
  const ufs =
    'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
  if (address.uf && ufs.indexOf(address.uf) === -1) fail('uf', 'UF inválida.')

  // 3. Lojas
  if (stores.length === 0) fail('stores', 'Informe ao menos uma loja.')
  const slugs = {}
  for (const s of stores) {
    if (!text(s.name)) fail('store_name', 'Cada loja precisa de um nome.')
    const slug = text(s.slug)
    if (!slug) continue
    if (
      slugs[slug] ||
      $app.findRecordsByFilter('stores', 'slug = {:slug}', '', 1, 0, { slug: slug }).length > 0
    ) {
      fail('slug', 'O identificador de loja "' + slug + '" já está em uso.')
    }
    slugs[slug] = true
  }

  // 4. Proprietário
  const ownerEmail = text(owner.email).toLowerCase()
  if (!text(owner.name)) fail('owner_name', 'Informe o nome do proprietário.')
  if (ownerEmail.indexOf('@') < 1 || ownerEmail.indexOf('.', ownerEmail.indexOf('@')) === -1) {
    fail('email', 'Informe um e-mail válido para o proprietário.')
  }
  let emailInUse = false
  try {
    $app.findAuthRecordByEmail('users', ownerEmail)
    emailInUse = true
  } catch (_) {}
  if (emailInUse) fail('email', 'Já existe um usuário com o e-mail ' + ownerEmail + '.')
  if (String(owner.password || '').length < 10) {
    fail('password', 'A senha inicial do proprietário deve ter no mínimo 10 caracteres.')
  }

  const result = {}
  $app.runInTransaction((txApp) => {
    const org = new Record(txApp.findCollectionByNameOrId('organizations'))
    org.set('name', orgName)
    org.set('type', 'franquia')
    org.set('status', 'implantacao')
    org.set('region', text(organization.region))
    txApp.save(org)

    const le = new Record(txApp.findCollectionByNameOrId('legal_entities'))
    le.set('org', org.id)
    le.set('razao_social', text(legalEntity.razao_social))
    le.set('nome_fantasia', text(legalEntity.nome_fantasia))
    le.set('cnpj', cnpj)
    le.set('matriz_filial', matrizFilial)
    if (regime) le.set('regime', regime)
    le.set('ie_isento', ieExempt)
    le.set('ie', ieExempt ? '' : text(legalEntity.ie))
    if (hasAddress) le.set('address', address)
    le.set('fiscal_email', fiscalEmail)
    le.set('accountant_contact', text(legalEntity.accountant_contact))
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
      st.set('whatsapp', text(s.whatsapp))
      st.set('status', 'ativa')
      txApp.save(st)
      storeIds.push(st.id)
    }

    const user = new Record(txApp.findCollectionByNameOrId('users'))
    user.set('org', org.id)
    user.set('name', text(owner.name))
    user.setEmail(ownerEmail)
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
      audit.set('reason', 'Cadastro de franquia: ' + orgName)
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

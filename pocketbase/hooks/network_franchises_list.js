/**
 * FRQ / ARQ-01: lista das franquias para o admin da rede, com o cadastro de
 * cada uma: empresas (CNPJs), lojas e administradores. As regras da API
 * isolam cada organização, então a rede não lê lojas e usuários das
 * franquias pela API comum; esta rota devolve só o cadastro, nunca vendas,
 * clientes ou financeiro (R.2).
 */
routerAdd('GET', '/backend/v1/network/franchises', (e) => {
  const auth = e.auth
  const isNetworkAdmin =
    e.hasSuperuserAuth() ||
    (!!auth &&
      auth.collection().name === 'users' &&
      auth.getString('status') === 'ativo' &&
      auth.getString('network_role') === 'admin_rede')
  if (!isNetworkAdmin) {
    throw new ForbiddenError('Apenas o admin da rede vê as franquias.')
  }

  const parse = (text) => {
    try {
      return JSON.parse(text) || null
    } catch (_) {
      return null
    }
  }

  const items = []
  const orgs = $app.findRecordsByFilter('organizations', "type = 'franquia'", 'name', 0, 0)
  for (const org of orgs) {
    const params = { org: org.id }
    const legalEntities = []
    for (const le of $app.findRecordsByFilter(
      'legal_entities',
      'org = {:org}',
      'created',
      0,
      0,
      params,
    )) {
      legalEntities.push({
        id: le.id,
        razao_social: le.getString('razao_social'),
        nome_fantasia: le.getString('nome_fantasia'),
        cnpj: le.getString('cnpj'),
        matriz_filial: le.getString('matriz_filial'),
        regime: le.getString('regime'),
        ie: le.getString('ie'),
        ie_isento: le.getBool('ie_isento'),
        address: parse(le.getString('address')),
        fiscal_email: le.getString('fiscal_email'),
        accountant_contact: le.getString('accountant_contact'),
        active: le.getBool('active'),
      })
    }
    const stores = []
    for (const st of $app.findRecordsByFilter('stores', 'org = {:org}', 'name', 0, 0, params)) {
      stores.push({
        id: st.id,
        name: st.getString('name'),
        slug: st.getString('slug'),
        address: st.getString('address'),
        phone: st.getString('phone'),
        whatsapp: st.getString('whatsapp'),
        status: st.getString('status'),
        legal_entity: st.getString('legal_entity'),
      })
    }
    const admins = []
    for (const u of $app.findRecordsByFilter(
      'users',
      "org = {:org} && profile = 'admin'",
      'created',
      0,
      0,
      params,
    )) {
      admins.push({
        id: u.id,
        name: u.getString('name'),
        email: u.email(),
        status: u.getString('status'),
      })
    }
    items.push({
      id: org.id,
      name: org.getString('name'),
      status: org.getString('status'),
      region: org.getString('region'),
      created: org.getString('created'),
      legal_entities: legalEntities,
      stores: stores,
      admins: admins,
    })
  }

  return e.json(200, { items: items })
})

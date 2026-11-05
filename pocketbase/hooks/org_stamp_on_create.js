/**
 * RED-01 / ARQ-01 / ESC-01: a organização de um registro é decidida pelo
 * servidor, nunca pelo navegador.
 * - org vem do registro "pai" (loja, venda, transferência, lançamento,
 *   produto, cliente) ou, sem pai, da organização de quem pede.
 * - legal_entity (CNPJ) vem da venda ou da loja no momento da criação. Se a
 *   loja trocar de CNPJ depois, os registros antigos guardam o CNPJ antigo.
 * - Toda relação do registro precisa apontar para a mesma organização.
 * Só o admin da rede cadastra lojas, CNPJs e usuários em outra organização.
 * Vale para todas as coleções que têm o campo org.
 */
onRecordCreateRequest((e) => {
  const collection = e.record.collection()
  const fields = collection.fields
  if (!fields.getByName('org')) return e.next()

  const parents = [
    ['sale', 'sales'],
    ['transfer', 'transfers'],
    ['transaction', 'financial_transactions'],
    ['store', 'stores'],
    ['origin_store', 'stores'],
    ['product', 'products'],
    ['customer', 'customers'],
  ]
  let parentOrg = ''
  for (const p of parents) {
    const id = fields.getByName(p[0]) ? e.record.getString(p[0]) : ''
    if (!id) continue
    try {
      parentOrg = $app.findRecordById(p[1], id).getString('org')
    } catch (_) {
      throw new BadRequestError('Registro relacionado não encontrado (' + p[0] + ').')
    }
    break
  }

  const deriveLegalEntity = () => {
    if (!fields.getByName('legal_entity') || collection.name === 'stores') return
    const saleId = e.record.getString('sale')
    const storeId = e.record.getString('store')
    const accountId = fields.getByName('account') ? e.record.getString('account') : ''
    let le = ''
    if (saleId) le = $app.findRecordById('sales', saleId).getString('legal_entity')
    else if (storeId) le = $app.findRecordById('stores', storeId).getString('legal_entity')
    else if (accountId) le = $app.findRecordById('financial_accounts', accountId).getString('legal_entity')
    if (le) e.record.set('legal_entity', le)
  }

  if (e.hasSuperuserAuth()) {
    // Painel do Skip / scripts: só completa o que faltar.
    if (!e.record.getString('org') && parentOrg) e.record.set('org', parentOrg)
    deriveLegalEntity()
    return e.next()
  }

  const auth = e.auth
  if (!auth || auth.collection().name !== 'users') {
    throw new ForbiddenError('Faça login para continuar.')
  }
  const authOrg = auth.getString('org')
  const isNetworkAdmin =
    auth.getString('network_role') === 'admin_rede' && auth.getString('status') === 'ativo'
  const networkManaged = ['users', 'stores', 'legal_entities'].indexOf(collection.name) !== -1

  let org = parentOrg
  if (!org) {
    const requested = e.record.getString('org')
    if (requested && isNetworkAdmin && networkManaged) {
      try {
        $app.findRecordById('organizations', requested)
      } catch (_) {
        throw new BadRequestError('Organização não encontrada.')
      }
      org = requested
    } else {
      org = authOrg
    }
  }
  if (!org) throw new ForbiddenError('Usuário sem organização definida.')
  if (org !== authOrg && !(isNetworkAdmin && networkManaged)) {
    throw new ForbiddenError('Este registro pertence a outra organização.')
  }
  e.record.set('org', org)
  deriveLegalEntity()

  // Relações só com registros da mesma organização (o próprio usuário
  // pode aparecer como autor, ex.: created_by do admin da rede).
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]
    if (f.type() !== 'relation') continue
    const fieldName = f.getName()
    if (fieldName === 'org') continue
    const ids = e.record.getStringSlice(fieldName)
    if (ids.length === 0) continue
    const target = $app.findCollectionByNameOrId(f.collectionId)
    if (!target.fields.getByName('org')) continue
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j]
      if (id === auth.id) continue
      let rel = null
      try {
        rel = $app.findRecordById(target.id, id)
      } catch (_) {
        throw new BadRequestError('Registro relacionado não encontrado (' + fieldName + ').')
      }
      if (rel.getString('org') !== org) {
        throw new ForbiddenError('O campo ' + fieldName + ' aponta para um registro de outra organização.')
      }
    }
  }
  return e.next()
})

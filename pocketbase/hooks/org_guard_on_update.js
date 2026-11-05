/**
 * ARQ-01: a organização de um registro não muda depois de criado, e o CNPJ
 * de um lançamento também não. O CNPJ só muda na loja (vale para os
 * registros novos dali em diante) e na conta financeira. Relações alteradas
 * continuam dentro da mesma organização.
 */
onRecordUpdateRequest((e) => {
  const collection = e.record.collection()
  const fields = collection.fields
  if (!fields.getByName('org') || e.hasSuperuserAuth()) return e.next()

  const original = e.record.original()
  const org = original.getString('org')
  if (e.record.getString('org') !== org) {
    throw new ForbiddenError('A organização de um registro não pode ser alterada.')
  }
  const legalEntityEditable = ['stores', 'financial_accounts'].indexOf(collection.name) !== -1
  if (
    fields.getByName('legal_entity') &&
    !legalEntityEditable &&
    e.record.getString('legal_entity') !== original.getString('legal_entity')
  ) {
    throw new ForbiddenError('O CNPJ de um lançamento não pode ser alterado.')
  }

  const asText = (slice) => {
    const out = []
    for (let k = 0; k < slice.length; k++) out.push(slice[k])
    return out.join(',')
  }
  const authId = e.auth ? e.auth.id : ''
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]
    if (f.type() !== 'relation') continue
    const fieldName = f.getName()
    if (fieldName === 'org') continue
    const ids = e.record.getStringSlice(fieldName)
    if (asText(ids) === asText(original.getStringSlice(fieldName))) continue
    const target = $app.findCollectionByNameOrId(f.collectionId)
    if (!target.fields.getByName('org')) continue
    for (let j = 0; j < ids.length; j++) {
      if (ids[j] === authId) continue
      let rel = null
      try {
        rel = $app.findRecordById(target.id, ids[j])
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

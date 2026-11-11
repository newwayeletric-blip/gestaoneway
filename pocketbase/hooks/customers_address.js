/**
 * Endereço do cliente para a NF-e (dono, 11/11/2026): CEP só com os 8
 * números, UF em maiúsculas e de verdade; os outros campos sem espaços
 * sobrando. Endereço incompleto é aceito no cadastro: a nota é que avisa o
 * que falta (pocketbase/hooks/lib/nfe.js).
 */
onRecordValidate((e) => {
  const r = e.record
  if (!r.collection().fields.getByName('cep')) return e.next()
  const fail = (field, message) => {
    const data = {}
    data[field] = new ValidationError('validation_customer_' + field, message)
    throw new BadRequestError(message, data)
  }
  const cep = r.getString('cep').replace(/\D/g, '')
  if (cep && cep.length !== 8) fail('cep', 'O CEP tem 8 números.')
  r.set('cep', cep)
  const uf = r.getString('uf').trim().toUpperCase()
  const UFS =
    'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
  if (uf && UFS.indexOf(uf) === -1) fail('uf', 'UF inválida (ex.: PR).')
  r.set('uf', uf)
  for (const f of ['street', 'street_number', 'complement', 'district', 'city']) {
    r.set(f, r.getString(f).trim().replace(/\s+/g, ' '))
  }
  return e.next()
}, 'customers')

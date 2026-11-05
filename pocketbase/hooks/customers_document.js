/**
 * CLI-01 / ARQ-02: documento do cliente guardado sem pontuação, com dígito
 * verificador conferido e único por organização. O mesmo CPF pode ser
 * cliente de duas franquias diferentes (D.8 cenário 29).
 * Cadastros antigos só são conferidos quando o documento for alterado.
 */
onRecordValidate((e) => {
  const raw = e.record.getString('document')
  const doc = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (doc !== raw) e.record.set('document', doc)

  const changed = e.record.isNew() || doc !== e.record.original().getString('document')
  if (!doc || !changed) return e.next()

  const validCpf = (c) => {
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false
    const dv = (len) => {
      let sum = 0
      for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i)
      const rest = (sum * 10) % 11
      return rest === 10 ? 0 : rest
    }
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
  }
  const validCnpj = (c) => {
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false
    const dv = (base, weights) => {
      let sum = 0
      for (let i = 0; i < weights.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i]
      const rest = sum % 11
      return rest < 2 ? 0 : 11 - rest
    }
    const base = c.slice(0, 12)
    const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    const d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return c[12] === String(d1) && c[13] === String(d2)
  }
  if (!(doc.length === 11 ? validCpf(doc) : validCnpj(doc))) {
    throw new BadRequestError('CPF/CNPJ inválido. Confira os números.', {
      document: new ValidationError('validation_invalid_document', 'CPF/CNPJ inválido.'),
    })
  }

  // Hooks também rodam durante as migrations; antes da 0007 não existe org.
  const hasOrg = !!e.record.collection().fields.getByName('org')
  const same = e.app.findRecordsByFilter(
    'customers',
    (hasOrg ? 'org = {:org} && ' : '') + 'document = {:doc} && id != {:id}',
    '',
    1,
    0,
    { org: e.record.getString('org'), doc: doc, id: e.record.id },
  )
  if (same.length > 0) {
    throw new BadRequestError('Já existe um cliente com este CPF/CNPJ.', {
      document: new ValidationError('validation_not_unique', 'Já existe um cliente com este CPF/CNPJ.'),
    })
  }
  return e.next()
}, 'customers')

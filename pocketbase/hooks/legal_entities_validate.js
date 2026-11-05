/**
 * CNPJ-01: CNPJ guardado sem pontuação e com dígito verificador conferido.
 * Aceita o CNPJ alfanumérico (Receita Federal, a partir de 07/2026): as 12
 * primeiras posições podem ter letras, que valem (código ASCII − 48) no
 * cálculo; os 2 dígitos verificadores continuam numéricos.
 * Hook de modelo: vale para a API, para rotas e para o painel.
 */
onRecordValidate((e) => {
  const cnpj = e.record.getString('cnpj').toUpperCase().replace(/[^0-9A-Z]/g, '')

  const value = (ch) => ch.charCodeAt(0) - 48
  const checkDigit = (base, weights) => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) sum += value(base[i]) * weights[i]
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  let valid = /^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) && !/^(\d)\1{13}$/.test(cnpj)
  if (valid) {
    const base = cnpj.slice(0, 12)
    const d1 = checkDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    const d2 = checkDigit(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    valid = cnpj[12] === String(d1) && cnpj[13] === String(d2)
  }
  if (!valid) {
    throw new BadRequestError('CNPJ inválido. Confira os números.', {
      cnpj: new ValidationError('validation_invalid_cnpj', 'CNPJ inválido.'),
    })
  }
  e.record.set('cnpj', cnpj)
  // Inscrição estadual sem pontuação (o formato e o dígito variam por UF).
  e.record.set('ie', e.record.getString('ie').toUpperCase().replace(/[^0-9A-Z]/g, ''))
  return e.next()
}, 'legal_entities')

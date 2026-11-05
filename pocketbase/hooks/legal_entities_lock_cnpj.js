/**
 * CNPJ-03: vendas, pagamentos, contas e lançamentos guardam a empresa (CNPJ)
 * em que foram feitos. Depois que a empresa tem algum desses registros, o
 * número do CNPJ não muda, porque mudaria o CNPJ de documentos já emitidos.
 * Para usar outro CNPJ, cadastra-se uma empresa nova e liga-se a loja a ela
 * (vale para os registros novos). Razão social, endereço e os demais dados
 * continuam editáveis. Erro de digitação numa empresa sem movimento pode ser
 * corrigido.
 */
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const normalize = (v) =>
    String(v || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
  if (normalize(e.record.getString('cnpj')) === normalize(e.record.original().getString('cnpj'))) {
    return e.next()
  }
  const withLegalEntity = [
    'sales',
    'sale_payments',
    'sale_returns',
    'card_receivables',
    'commissions',
    'financial_accounts',
    'financial_transactions',
    'recurring_expenses',
    'expenses',
    'payments',
    'monthly_closings',
  ]
  for (const name of withLegalEntity) {
    const used = $app.findRecordsByFilter(name, 'legal_entity = {:le}', '', 1, 0, {
      le: e.record.id,
    })
    if (used.length > 0) {
      const message =
        'Esta empresa já tem vendas ou lançamentos, então o número do CNPJ não pode mudar. Para usar outro CNPJ, cadastre uma empresa nova e ligue a loja a ela.'
      throw new BadRequestError(message, {
        cnpj: new ValidationError('validation_cnpj_in_use', message),
      })
    }
  }
  return e.next()
}, 'legal_entities')

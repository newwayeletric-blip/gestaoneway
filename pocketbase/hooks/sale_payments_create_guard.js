/**
 * O vendedor registra a intenção de pagamento no rascunho. Confirmação e
 * taxas não vêm do navegador: a taxa real da maquininha é calculada pelo
 * servidor a partir da tabela cadastrada (MAQ-06, Fase 2).
 */
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const auth = e.auth
  if (!auth || auth.getString('profile') !== 'admin') {
    e.record.set('confirmed', false)
    e.record.set('card_tax_rate', 0)
    e.record.set('card_tax_amount', 0)
    e.record.set('net_amount', 0)
  }
  return e.next()
}, 'sale_payments')

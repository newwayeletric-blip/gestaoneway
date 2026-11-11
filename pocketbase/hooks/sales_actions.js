/**
 * Fase 1 com a regra do dono (05/11/2026): o administrador da organização
 * decide a venda enviada por pocketbase/hooks/sales_submit.js.
 * - approve: "aguardando_aprovacao" vira "confirmada", e isso libera a NF.
 *   Grava o custo e a comissão de cada item (COM-01/02: variação > produto >
 *   padrão do vendedor), cria a comissão do vendedor (liberada se a venda
 *   está paga, prevista se ficou saldo) e marca os pagamentos como
 *   recebidos. Saldo pendente exige justificativa (VEN-06).
 * - reject: a venda fica "recusada" com o motivo, e o estoque reservado
 *   volta. O vendedor lança uma venda nova.
 * - cancel (DEV-01): venda confirmada e ainda não entregue vira
 *   "cancelada" com o motivo. O estoque volta, a comissão é estornada (se já
 *   foi paga, vira débito a compensar) e o reembolso fica pendente. Venda
 *   entregue volta por devolução.
 */
routerAdd('POST', '/backend/v1/sales/{id}/{action}', (e) => {
  const action = e.request.pathValue('action')
  if (['approve', 'reject', 'cancel'].indexOf(action) === -1) {
    throw new NotFoundError('Ação desconhecida.')
  }
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador aprova, recusa ou cancela vendas.')
  }
  let sale = null
  try {
    sale = $app.findRecordById('sales', e.request.pathValue('id'))
  } catch (_) {
    throw new NotFoundError('Venda não encontrada.')
  }
  if (sale.getString('org') !== auth.getString('org'))
    throw new NotFoundError('Venda não encontrada.')

  const body = e.requestInfo().body || {}
  const text = (v) => String(v === undefined || v === null ? '' : v).trim()
  const round2 = (v) => Math.round(v * 100) / 100
  const fail = (field, message) => {
    const data = {}
    data[field] = new ValidationError('validation_sale_' + field, message)
    throw new BadRequestError(message, data)
  }
  const status = sale.getString('status')
  const number = sale.getString('number')
  const audit = (tx, auditAction, reason, previous, next) => {
    const rec = new Record(tx.findCollectionByNameOrId('audit_logs'))
    rec.set('org', sale.getString('org'))
    rec.set('entity', 'sales')
    rec.set('record_id', sale.id)
    rec.set('action', auditAction)
    rec.set('user', auth.id)
    rec.set('reason', reason)
    rec.set('previous_values', previous)
    rec.set('new_values', next)
    rec.set('ip_address', e.realIP())
    tx.save(rec)
  }
  // Devolve ao estoque da loja o que a venda reservou ou baixou.
  const returnStock = (tx, reason) => {
    const movementsCol = tx.findCollectionByNameOrId('stock_movements')
    const items = tx.findRecordsByFilter('sale_items', 'sale = {:sale}', '', 0, 0, {
      sale: sale.id,
    })
    for (const it of items) {
      const qty = it.getFloat('quantity') - it.getFloat('returned_quantity')
      if (!(qty > 0) || !it.getString('product')) continue
      const filter = {
        store: sale.getString('store'),
        product: it.getString('product'),
        variant: it.getString('variant'),
      }
      // Parâmetro vazio não casa com campo vazio: o "sem variação" vai escrito.
      const rows = tx.findRecordsByFilter(
        'stock_items',
        'store = {:store} && product = {:product} && ' +
          (filter.variant ? 'variant = {:variant}' : "variant = ''"),
        '',
        1,
        0,
        filter,
      )
      let row = rows.length > 0 ? rows[0] : null
      if (!row) {
        row = new Record(tx.findCollectionByNameOrId('stock_items'))
        row.set('org', sale.getString('org'))
        row.set('store', filter.store)
        row.set('product', filter.product)
        row.set('variant', filter.variant)
        row.set('quantity', 0)
      }
      row.set('quantity', row.getFloat('quantity') + qty)
      tx.save(row)
      const mv = new Record(movementsCol)
      mv.set('org', sale.getString('org'))
      mv.set('type', 'cancelamento_venda')
      mv.set('product', filter.product)
      mv.set('variant', filter.variant)
      mv.set('store', filter.store)
      mv.set('quantity', qty)
      mv.set('date', new DateTime())
      mv.set('user', auth.id)
      mv.set('reason', reason)
      mv.set('source_ref', sale.id)
      tx.save(mv)
    }
  }
  const lockedStatus = (tx, expected) => {
    const fresh = tx.findRecordById('sales', sale.id)
    if (fresh.getString('status') !== expected) {
      throw new BadRequestError('A venda mudou de situação enquanto você decidia. Atualize a tela.')
    }
    return fresh
  }

  if (action === 'approve') {
    if (status !== 'aguardando_aprovacao')
      fail('status', 'Esta venda não está aguardando aprovação.')
    const note = text(body.note)
    const pending = sale.getFloat('pending_balance')
    if (pending > 0 && note.length < 5) {
      fail('note', 'Explique por que a venda pode ser aprovada com saldo pendente.')
    }
    $app.runInTransaction((tx) => {
      const s = lockedStatus(tx, 'aguardando_aprovacao')
      let seller = null
      try {
        seller = tx.findRecordById('users', s.getString('seller'))
      } catch (_) {}
      const eligible = !!seller && seller.getBool('cs_available')
      let base = 0
      let value = 0
      for (const it of tx.findRecordsByFilter('sale_items', 'sale = {:sale}', '', 0, 0, {
        sale: s.id,
      })) {
        let product = null
        let variant = null
        try {
          product = tx.findRecordById('products', it.getString('product'))
        } catch (_) {}
        try {
          if (it.getString('variant'))
            variant = tx.findRecordById('product_variants', it.getString('variant'))
        } catch (_) {}
        const variantCost = variant ? variant.getFloat('cost_price') : 0
        const cost = variantCost > 0 ? variantCost : product ? product.getFloat('cost_price') : 0
        let rate = 0
        if (eligible) {
          for (const r of [
            variant ? variant.getFloat('commission_rate') : 0,
            product ? product.getFloat('commission_rate') : 0,
            seller.getFloat('default_commission_rate'),
          ]) {
            if (r > 0) {
              rate = r
              break
            }
          }
        }
        const itemValue = round2((it.getFloat('total') * rate) / 100)
        it.set('cost_price', cost)
        it.set('cost_price_snapshot', cost)
        it.set('commission_rate', rate)
        it.set('commission_value', itemValue)
        tx.save(it)
        if (itemValue > 0) {
          base += it.getFloat('total')
          value += itemValue
        }
      }
      for (const p of tx.findRecordsByFilter('sale_payments', 'sale = {:sale}', '', 0, 0, {
        sale: s.id,
      })) {
        p.set('confirmed', true)
        tx.save(p)
      }

      const fullyPaid = !(pending > 0)
      s.set('status', 'confirmada')
      s.set('payment_status', fullyPaid ? 'pago' : 'parcial')
      s.set('confirmed_by', auth.id)
      s.set('confirmed_at', new DateTime())
      if (note) s.set('authorization_note', note)
      if (!fullyPaid) s.set('authorized_by', auth.id)
      tx.save(s)

      if (value > 0) {
        const c = new Record(tx.findCollectionByNameOrId('commissions'))
        c.set('org', s.getString('org'))
        c.set('legal_entity', s.getString('legal_entity'))
        c.set('seller', s.getString('seller'))
        c.set('sale', s.id)
        c.set('store', s.getString('store'))
        c.set('base_amount', round2(base))
        c.set('rate', Math.round((value / base) * 10000) / 100)
        c.set('value', round2(value))
        c.set('status', fullyPaid ? 'liberada' : 'prevista')
        c.set('competence_date', new DateTime())
        if (fullyPaid) c.set('released_at', new DateTime())
        tx.save(c)
      }

      const details = []
      if (s.getBool('discount_over_limit')) {
        const limit = s.getFloat('discount_limit_pct')
        details.push(
          'desconto de R$ ' +
            s.getFloat('total_discount').toFixed(2) +
            (limit >= 0 ? ' acima do limite de ' + limit + '%' : ' sem limite configurado'),
        )
      }
      if (!fullyPaid) details.push('saldo pendente de R$ ' + pending.toFixed(2))
      if (note) details.push('observação: ' + note)
      audit(
        tx,
        'alteracao',
        'Venda ' +
          number +
          ' aprovada pelo administrador' +
          (details.length ? ' (' + details.join('; ') + ')' : ''),
        { status: 'aguardando_aprovacao' },
        { status: 'confirmada', payment_status: fullyPaid ? 'pago' : 'parcial' },
      )
    })
    return e.json(200, { id: sale.id, number: number, status: 'confirmada' })
  }

  const reason = text(body.reason)
  if (reason.length < 5) fail('reason', 'Informe o motivo (mínimo de 5 caracteres).')

  if (action === 'reject') {
    if (status !== 'aguardando_aprovacao')
      fail('status', 'Só uma venda aguardando aprovação pode ser recusada.')
    $app.runInTransaction((tx) => {
      const s = lockedStatus(tx, 'aguardando_aprovacao')
      returnStock(tx, 'Venda ' + number + ' recusada: ' + reason)
      s.set('status', 'recusada')
      s.set('rejected_by', auth.id)
      s.set('rejected_at', new DateTime())
      s.set('rejection_reason', reason)
      tx.save(s)
      audit(
        tx,
        'cancelamento',
        'Venda ' + number + ' recusada: ' + reason,
        { status: status },
        { status: 'recusada' },
      )
    })
    return e.json(200, { id: sale.id, number: number, status: 'recusada' })
  }

  // cancel
  if (status !== 'confirmada') {
    fail(
      'status',
      'Só uma venda confirmada pode ser cancelada. Venda aguardando aprovação é recusada.',
    )
  }
  if (sale.getString('delivery_status') === 'entregue') {
    fail('status', 'Esta venda já foi entregue: registre uma devolução em vez de cancelar.')
  }
  // Datas do PocketBase vêm como "2026-11-05 20:00:00.000Z".
  const confirmedAt = new Date(
    (sale.getString('confirmed_at') || sale.getString('created')).replace(' ', 'T'),
  )
  if (!isNaN(confirmedAt.getTime())) {
    const brt = new Date(confirmedAt.getTime() - 3 * 3600 * 1000)
    const closed = $app.findRecordsByFilter(
      'monthly_closings',
      "org = {:org} && year = {:year} && month = {:month} && status = 'fechado' && (store = '' || store = {:store})",
      '',
      1,
      0,
      {
        org: sale.getString('org'),
        year: brt.getUTCFullYear(),
        month: brt.getUTCMonth() + 1,
        store: sale.getString('store'),
      },
    )
    if (closed.length > 0) {
      fail(
        'status',
        'A venda é de um mês fechado no Financeiro. Reabra o mês ou registre uma devolução.',
      )
    }
  }
  $app.runInTransaction((tx) => {
    const s = lockedStatus(tx, 'confirmada')
    returnStock(tx, 'Venda ' + number + ' cancelada: ' + reason)
    for (const c of tx.findRecordsByFilter('commissions', 'sale = {:sale}', '', 0, 0, {
      sale: s.id,
    })) {
      const st = c.getString('status')
      if (st === 'estornada') continue
      if (st === 'paga') {
        const debit = new Record(tx.findCollectionByNameOrId('commissions'))
        debit.set('org', c.getString('org'))
        debit.set('legal_entity', c.getString('legal_entity'))
        debit.set('seller', c.getString('seller'))
        debit.set('sale', s.id)
        debit.set('store', c.getString('store'))
        debit.set('base_amount', -c.getFloat('base_amount'))
        debit.set('rate', c.getFloat('rate'))
        debit.set('value', -c.getFloat('value'))
        debit.set('status', 'liberada')
        debit.set('competence_date', new DateTime())
        debit.set('released_at', new DateTime())
        debit.set(
          'notes',
          'Débito a compensar: venda ' + number + ' cancelada depois da comissão paga.',
        )
        tx.save(debit)
      } else {
        c.set('status', 'estornada')
        c.set('notes', 'Estornada: venda ' + number + ' cancelada (' + reason + ')')
        tx.save(c)
      }
    }
    const received = round2(s.getFloat('total') - s.getFloat('pending_balance'))
    const refund = new Record(tx.findCollectionByNameOrId('sale_returns'))
    refund.set('org', s.getString('org'))
    refund.set('legal_entity', s.getString('legal_entity'))
    refund.set('sale', s.id)
    refund.set('store', s.getString('store'))
    refund.set('type', 'cancelamento')
    refund.set('reason', reason)
    refund.set('refund_amount', received)
    refund.set('refund_status', received > 0 ? 'pendente' : 'sem_reembolso')
    refund.set('product_condition', 'nao_entregue_liberado')
    refund.set('performed_by', auth.id)
    // Sem valor recebido, o reembolso é zero (o campo obrigatório recusaria zero).
    if (received > 0) tx.save(refund)
    else tx.saveNoValidate(refund)
    s.set('status', 'cancelada')
    s.set('cancellation_reason', reason)
    s.set('canceled_by', auth.id)
    s.set('canceled_at', new DateTime())
    tx.save(s)
    audit(
      tx,
      'cancelamento',
      'Venda ' + number + ' cancelada: ' + reason,
      { status: 'confirmada' },
      { status: 'cancelada' },
    )
  })
  return e.json(200, { id: sale.id, number: number, status: 'cancelada' })
})

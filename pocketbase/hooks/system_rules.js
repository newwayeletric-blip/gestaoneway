/**
 * PocketBase server hooks for NEW WAY ELETRIC:
 * - Trava de Fechamento Mensal Administrativo (bloqueia alterações e retroativos em mês fechado)
 * - Trilha de Auditoria (audit_log para alterações de preços, custos, estoque, vendas, pagamentos, permissões)
 * - Proteção de integridade: bloqueio de exclusão física de registros com movimentação
 *
 * All functions are strictly inlined inside hook callbacks per JSVM requirements.
 */

// ==========================================
// A. BLOQUEIO DE FECHAMENTO MENSAL
// ==========================================

// Bloqueio de vendas em período fechado (Criação)
onRecordCreateRequest((e) => {
  const dateStr = e.record.get('date') || new Date().toISOString()
  const storeId = e.record.get('store')
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    let filter = `year = ${year} && month = ${month} && status = 'fechado'`
    if (storeId) {
      filter += ` && (store = '${storeId}' || store = '' || store = null)`
    }
    const closings = e.app.findRecordsByFilter('monthly_closings', filter, '-created', 1, 0)
    if (closings && closings.length > 0) {
      throw new BadRequestError(
        'Operação bloqueada: o período (mês/ano) desta venda já se encontra encerrado no Fechamento Mensal Administrativo.',
      )
    }
  }
  return e.next()
}, 'sales')

// Bloqueio de vendas em período fechado (Atualização)
onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('sales', e.record.id)
  const oldDateStr = original.get('date')
  const newDateStr = e.record.get('date') || oldDateStr
  const storeId = e.record.get('store') || original.get('store')

  const datesToCheck = [oldDateStr, newDateStr].filter(Boolean)
  for (let i = 0; i < datesToCheck.length; i++) {
    const d = new Date(datesToCheck[i])
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear()
      const month = d.getUTCMonth() + 1
      let filter = `year = ${year} && month = ${month} && status = 'fechado'`
      if (storeId) {
        filter += ` && (store = '${storeId}' || store = '' || store = null)`
      }
      const closings = e.app.findRecordsByFilter('monthly_closings', filter, '-created', 1, 0)
      if (closings && closings.length > 0) {
        throw new BadRequestError(
          'Operação bloqueada: não é permitido alterar vendas em mês com Fechamento Administrativo encerrado.',
        )
      }
    }
  }
  return e.next()
}, 'sales')

// Bloqueio de pagamentos em período fechado
onRecordCreateRequest((e) => {
  const saleId = e.record.get('sale')
  let storeId = null
  let saleDate = new Date().toISOString()
  try {
    const sale = e.app.findRecordById('sales', saleId)
    storeId = sale.get('store')
    saleDate = sale.get('date')
  } catch (_) {}

  const d = new Date(saleDate)
  if (!isNaN(d.getTime())) {
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    let filter = `year = ${year} && month = ${month} && status = 'fechado'`
    if (storeId) {
      filter += ` && (store = '${storeId}' || store = '' || store = null)`
    }
    const closings = e.app.findRecordsByFilter('monthly_closings', filter, '-created', 1, 0)
    if (closings && closings.length > 0) {
      throw new BadRequestError(
        'Operação bloqueada: não é permitido lançar pagamentos em vendas de período encerrado no Fechamento Mensal.',
      )
    }
  }
  return e.next()
}, 'sale_payments')

// Bloqueio de movimentações financeiras em período fechado (Criação)
onRecordCreateRequest((e) => {
  const dateStr =
    e.record.get('payment_date') ||
    e.record.get('competence_date') ||
    e.record.get('due_date') ||
    new Date().toISOString()
  const storeId = e.record.get('store')
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    let filter = `year = ${year} && month = ${month} && status = 'fechado'`
    if (storeId) {
      filter += ` && (store = '${storeId}' || store = '' || store = null)`
    }
    const closings = e.app.findRecordsByFilter('monthly_closings', filter, '-created', 1, 0)
    if (closings && closings.length > 0) {
      throw new BadRequestError(
        'Operação bloqueada: a data desta movimentação financeira pertence a um período com Fechamento Mensal encerrado.',
      )
    }
  }
  return e.next()
}, 'financial_transactions')

// Bloqueio de movimentações financeiras em período fechado (Atualização)
onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('financial_transactions', e.record.id)
  const oldDateStr =
    original.get('payment_date') || original.get('competence_date') || original.get('due_date')
  const newDateStr =
    e.record.get('payment_date') ||
    e.record.get('competence_date') ||
    e.record.get('due_date') ||
    oldDateStr
  const storeId = e.record.get('store') || original.get('store')

  const datesToCheck = [oldDateStr, newDateStr].filter(Boolean)
  for (let i = 0; i < datesToCheck.length; i++) {
    const d = new Date(datesToCheck[i])
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear()
      const month = d.getUTCMonth() + 1
      let filter = `year = ${year} && month = ${month} && status = 'fechado'`
      if (storeId) {
        filter += ` && (store = '${storeId}' || store = '' || store = null)`
      }
      const closings = e.app.findRecordsByFilter('monthly_closings', filter, '-created', 1, 0)
      if (closings && closings.length > 0) {
        throw new BadRequestError(
          'Operação bloqueada: não é permitido modificar lançamentos financeiros em período encerrado no Fechamento Mensal.',
        )
      }
    }
  }
  return e.next()
}, 'financial_transactions')

// Bloqueio de movimentações de estoque em período fechado
onRecordCreateRequest((e) => {
  const dateStr = e.record.get('date') || new Date().toISOString()
  const storeId = e.record.get('store')
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    let filter = `year = ${year} && month = ${month} && status = 'fechado'`
    if (storeId) {
      filter += ` && (store = '${storeId}' || store = '' || store = null)`
    }
    const closings = e.app.findRecordsByFilter('monthly_closings', filter, '-created', 1, 0)
    if (closings && closings.length > 0) {
      throw new BadRequestError(
        'Operação bloqueada: não é permitido lançar movimentações de estoque em mês encerrado pelo Fechamento Mensal.',
      )
    }
  }
  return e.next()
}, 'stock_movements')

// ==========================================
// B. REABERTURA DE FECHAMENTO MENSAL EXIGE JUSTIFICATIVA
// ==========================================
onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('monthly_closings', e.record.id)
  const prevStatus = original.getString('status')
  const newStatus = e.record.getString('status')

  if (newStatus === 'aberto' || (prevStatus === 'fechado' && newStatus !== 'fechado')) {
    const auth = e.auth
    if (!auth || auth.getString('profile') !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem reabrir um período encerrado.')
    }
    const reason = e.record.getString('reopen_reason')
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError(
        'Justificativa obrigatória para reabertura de fechamento mensal (mínimo 5 caracteres).',
      )
    }
    e.record.set('reopened_by', auth.id)
    e.record.set('reopened_at', new Date().toISOString())

    // Auditoria de reabertura
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'monthly_closings')
      rec.set('record_id', e.record.id)
      rec.set('action', 'reabertura')
      rec.set('user', auth.id)
      rec.set('reason', reason)
      rec.set('previous_values', { status: 'fechado' })
      rec.set('new_values', { status: 'aberto', reopen_reason: reason })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'monthly_closings')

// ==========================================
// C. BLOQUEIO DE EXCLUSÃO DEFINITIVA COM MOVIMENTAÇÃO
// ==========================================
onRecordDeleteRequest((e) => {
  const status = e.record.getString('status')
  if (status !== 'orcamento' && status !== 'cancelada') {
    throw new BadRequestError(
      'Vendas registradas não podem ser excluídas fisicamente do banco de dados. Utilize a opção de Cancelamento/Devolução com justificativa.',
    )
  }
  return e.next()
}, 'sales')

onRecordDeleteRequest((e) => {
  const status = e.record.getString('status')
  if (status === 'pago') {
    throw new BadRequestError(
      'Transações financeiras quitadas não podem ser excluídas. Utilize o estorno/cancelamento com registro de auditoria.',
    )
  }
  return e.next()
}, 'financial_transactions')

onRecordDeleteRequest((e) => {
  const prodId = e.record.id
  try {
    const stockItems = e.app.findRecordsByFilter(
      'stock_items',
      `product = '${prodId}' && quantity > 0`,
      '',
      1,
      0,
    )
    if (stockItems && stockItems.length > 0) {
      throw new BadRequestError(
        'Não é permitido excluir produto que possui unidades em estoque. Inative o produto ou zere o estoque antes.',
      )
    }
    const sales = e.app.findRecordsByFilter('sale_items', `product = '${prodId}'`, '', 1, 0)
    if (sales && sales.length > 0) {
      throw new BadRequestError(
        'Não é permitido excluir produto com histórico de vendas. Altere o status para inativo.',
      )
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err
  }
  return e.next()
}, 'products')

// ==========================================
// D. TRILHA DE AUDITORIA AUTOMÁTICA
// ==========================================

// 1. Auditoria de Preços e Custos em Produtos
onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('products', e.record.id)
  const oldPrice = original.get('sale_price')
  const newPrice = e.record.get('sale_price')
  const oldCost = original.get('cost_price')
  const newCost = e.record.get('cost_price')

  if (oldPrice !== newPrice || oldCost !== newCost) {
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'products')
      rec.set('record_id', e.record.id)
      rec.set('action', 'alteracao')
      rec.set('user', e.auth ? e.auth.id : null)
      rec.set('reason', 'Alteração de preço de venda / custo')
      rec.set('previous_values', { sale_price: oldPrice, cost_price: oldCost })
      rec.set('new_values', { sale_price: newPrice, cost_price: newCost })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'products')

// 2. Auditoria de Usuários / Permissões
onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('users', e.record.id)
  const oldProfile = original.get('profile')
  const newProfile = e.record.get('profile')
  const oldStatus = original.get('status')
  const newStatus = e.record.get('status')
  const oldRate = original.get('default_commission_rate')
  const newRate = e.record.get('default_commission_rate')

  if (oldProfile !== newProfile || oldStatus !== newStatus || oldRate !== newRate) {
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'users')
      rec.set('record_id', e.record.id)
      rec.set('action', 'alteracao')
      rec.set('user', e.auth ? e.auth.id : null)
      rec.set('reason', 'Alteração de perfil, status ou taxa de comissão padrão')
      rec.set('previous_values', {
        profile: oldProfile,
        status: oldStatus,
        default_commission_rate: oldRate,
      })
      rec.set('new_values', {
        profile: newProfile,
        status: newStatus,
        default_commission_rate: newRate,
      })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'users')

// 3. Auditoria de Estoque (Ajustes Manuais)
onRecordCreateRequest((e) => {
  const type = e.record.getString('type')
  if (type === 'ajuste' || type === 'entrada_manual') {
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'stock_movements')
      rec.set('record_id', e.record.id || 'new')
      rec.set('action', 'ajuste')
      rec.set('user', e.auth ? e.auth.id : null)
      rec.set('reason', e.record.getString('reason') || 'Ajuste manual de estoque')
      rec.set('new_values', {
        product: e.record.get('product'),
        variant: e.record.get('variant'),
        quantity: e.record.get('quantity'),
        type: type,
      })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'stock_movements')

// 4. Auditoria de Cancelamento e Devolução de Vendas
onRecordCreateRequest((e) => {
  try {
    const auditCol = e.app.findCollectionByNameOrId('audit_logs')
    const rec = new Record(auditCol)
    rec.set('entity', 'sale_returns')
    rec.set('record_id', e.record.id || 'new')
    rec.set('action', 'devolucao')
    rec.set('user', e.auth ? e.auth.id : null)
    rec.set('reason', e.record.getString('reason'))
    rec.set('new_values', {
      sale: e.record.get('sale'),
      type: e.record.get('type'),
      refund_amount: e.record.get('refund_amount'),
      product_condition: e.record.get('product_condition'),
    })
    e.app.save(rec)
  } catch (_) {}
  return e.next()
}, 'sale_returns')

// 5. Auditoria de Despesas e Contas a Pagar
onRecordCreateRequest((e) => {
  if (e.record.getString('type') === 'despesa') {
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'financial_transactions')
      rec.set('record_id', e.record.id || 'new')
      rec.set('action', 'criacao')
      rec.set('user', e.auth ? e.auth.id : null)
      rec.set('reason', 'Lançamento de despesa')
      rec.set('new_values', {
        description: e.record.getString('description'),
        amount: e.record.get('amount'),
        due_date: e.record.get('due_date'),
        status: e.record.get('status'),
      })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'financial_transactions')

onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('financial_transactions', e.record.id)
  const oldStatus = original.get('status')
  const newStatus = e.record.get('status')
  const oldAmount = original.get('amount')
  const newAmount = e.record.get('amount')

  if (oldStatus !== newStatus || oldAmount !== newAmount) {
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'financial_transactions')
      rec.set('record_id', e.record.id)
      rec.set('action', newStatus === 'cancelado' ? 'cancelamento' : 'alteracao')
      rec.set('user', e.auth ? e.auth.id : null)
      rec.set('reason', 'Atualização de status ou valor financeiro')
      rec.set('previous_values', { status: oldStatus, amount: oldAmount })
      rec.set('new_values', { status: newStatus, amount: newAmount })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'financial_transactions')

// 6. Auditoria de Comissões
onRecordUpdateRequest((e) => {
  const original = e.app.findRecordById('commissions', e.record.id)
  const oldStatus = original.get('status')
  const newStatus = e.record.getString('status')

  if (oldStatus !== newStatus) {
    try {
      const auditCol = e.app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(auditCol)
      rec.set('entity', 'commissions')
      rec.set('record_id', e.record.id)
      rec.set('action', newStatus === 'estornada' ? 'estorno' : 'alteracao')
      rec.set('user', e.auth ? e.auth.id : null)
      rec.set('reason', e.record.getString('notes') || `Comissão alterada para ${newStatus}`)
      rec.set('previous_values', { status: oldStatus, value: original.get('commission_value') })
      rec.set('new_values', { status: newStatus, value: e.record.get('commission_value') })
      e.app.save(rec)
    } catch (_) {}
  }
  return e.next()
}, 'commissions')

// ==========================================
// E. VALIDAÇÃO DE ARQUIVOS E PRIVACIDADE DE DOCUMENTOS
// ==========================================

// Validação estrita de upload em sale_documents
onRecordCreateRequest((e) => {
  const auth = e.auth
  if (!auth) {
    throw new ForbiddenError('Apenas usuários autenticados podem anexar documentos.')
  }

  const saleId = e.record.getString('sale')
  if (!saleId) {
    throw new BadRequestError('Venda vinculada é obrigatória para anexar documento.')
  }

  // Se o usuário for vendedor, verificar se a venda pertence a ele
  if (auth.getString('profile') === 'vendedor') {
    try {
      const sale = e.app.findRecordById('sales', saleId)
      if (sale.getString('seller') !== auth.id) {
        throw new ForbiddenError(
          'Vendedor só tem permissão para anexar documentos em suas próprias vendas.',
        )
      }
    } catch (err) {
      if (err instanceof ForbiddenError) throw err
      throw new BadRequestError('Venda informada não foi encontrada.')
    }
  }

  e.record.set('uploaded_by', auth.id)
  return e.next()
}, 'sale_documents')

// Vendedor não pode visualizar nem listar comprovantes financeiros ou auditoria
// Validação no servidor de tamanho e tipos de arquivo permitidos (PDF, imagens, XML)
onRecordCreateRequest((e) => {
  const auth = e.auth
  if (!auth || auth.getString('profile') !== 'admin') {
    throw new ForbiddenError(
      'Apenas administradores podem anexar comprovantes a lançamentos financeiros.',
    )
  }

  const txId = e.record.getString('transaction')
  if (!txId) {
    throw new BadRequestError('Lançamento financeiro vinculado é obrigatório.')
  }

  // Validar se o lançamento financeiro existe
  try {
    e.app.findRecordById('financial_transactions', txId)
  } catch (_) {
    throw new BadRequestError('Lançamento financeiro informado não foi encontrado.')
  }

  // Validação de tipo de arquivo (PDF, imagens, XML)
  const fileField = e.record.getString('file')
  if (fileField) {
    const ext = fileField.toLowerCase().split('.').pop() || ''
    const allowedExtensions = ['pdf', 'xml', 'jpg', 'jpeg', 'png', 'webp']
    if (!allowedExtensions.includes(ext)) {
      throw new BadRequestError(
        'Tipo de arquivo inválido. Apenas PDF, imagens (JPG, PNG, WEBP) e XML são permitidos.',
      )
    }
  }

  e.record.set('uploaded_by', auth.id)
  return e.next()
}, 'transaction_attachments')

import pb from '@/lib/pocketbase/client'
export { pb }
import type {
  StoreRecord,
  ProductRecord,
  ProductVariantRecord,
  CategoryRecord,
  CustomerRecord,
  StockItemRecord,
  StockMovementRecord,
  TransferRecord,
  TransferItemRecord,
  SaleRecord,
  SaleItemRecord,
  SalePaymentRecord,
  SaleDocumentRecord,
  CommissionRecord,
  CommissionRuleRecord,
  SettingRecord,
  FinancialAccountRecord,
  FinancialCategoryRecord,
  FinancialTransactionRecord,
  CardReceivableRecord,
  RecurringExpenseRecord,
  ExpenseAllocationRecord,
  SaleReturnRecord,
  MonthlyClosingRecord,
  AuditLogRecord,
} from '@/types'

export const StoresService = {
  async list(): Promise<StoreRecord[]> {
    return await pb.collection('stores').getFullList<StoreRecord>({
      sort: 'name',
    })
  },

  async getAll(): Promise<StoreRecord[]> {
    return this.list()
  },

  async getById(id: string): Promise<StoreRecord> {
    return await pb.collection('stores').getOne<StoreRecord>(id)
  },

  async update(id: string, data: Partial<StoreRecord>): Promise<StoreRecord> {
    return await pb.collection('stores').update<StoreRecord>(id, data)
  },
}

export const ProductsService = {
  async list(filter = ''): Promise<ProductRecord[]> {
    return await pb.collection('products').getFullList<ProductRecord>({
      filter,
      sort: 'name',
      expand: 'category',
    })
  },

  async getAll(filter = ''): Promise<ProductRecord[]> {
    return this.list(filter)
  },

  async getById(id: string): Promise<ProductRecord> {
    return await pb.collection('products').getOne<ProductRecord>(id, {
      expand: 'category',
    })
  },

  async listCategories(): Promise<CategoryRecord[]> {
    return await pb.collection('categories').getFullList<CategoryRecord>({
      sort: 'name',
    })
  },

  async getCategories(): Promise<CategoryRecord[]> {
    return this.listCategories()
  },

  async createCategory(data: Partial<CategoryRecord> | string): Promise<CategoryRecord> {
    const payload = typeof data === 'string' ? { name: data } : data
    return await pb.collection('categories').create<CategoryRecord>(payload)
  },

  async listVariants(productId: string): Promise<ProductVariantRecord[]> {
    return await pb.collection('product_variants').getFullList<ProductVariantRecord>({
      filter: `product = '${productId}'`,
      sort: 'name',
    })
  },

  async create(data: Partial<ProductRecord>): Promise<ProductRecord> {
    return await pb.collection('products').create<ProductRecord>(data)
  },

  async update(id: string, data: Partial<ProductRecord>): Promise<ProductRecord> {
    return await pb.collection('products').update<ProductRecord>(id, data)
  },

  async createVariant(data: Partial<ProductVariantRecord>): Promise<ProductVariantRecord> {
    return await pb.collection('product_variants').create<ProductVariantRecord>(data)
  },

  async updateVariant(
    id: string,
    data: Partial<ProductVariantRecord>,
  ): Promise<ProductVariantRecord> {
    return await pb.collection('product_variants').update<ProductVariantRecord>(id, data)
  },
}

export const CustomersService = {
  async list(search = '', page = 1, perPage = 20) {
    let filter = ''
    if (search.trim()) {
      const q = search.trim()
      filter = `name ~ '${q}' || document ~ '${q}' || phone ~ '${q}' || email ~ '${q}'`
    }
    return await pb.collection('customers').getList<CustomerRecord>(page, perPage, {
      filter,
      sort: '-created',
    })
  },

  async getAll(search = ''): Promise<CustomerRecord[]> {
    let filter = ''
    if (search.trim()) {
      const q = search.trim()
      filter = `name ~ '${q}' || document ~ '${q}' || phone ~ '${q}' || email ~ '${q}'`
    }
    return await pb.collection('customers').getFullList<CustomerRecord>({
      filter,
      sort: 'name',
    })
  },

  async checkDuplicate(
    field: string,
    value: string,
    excludeId?: string,
  ): Promise<CustomerRecord[]> {
    if (!value || !value.trim()) return []
    try {
      let filter = `${field} = '${value.trim()}'`
      if (excludeId) {
        filter += ` && id != '${excludeId}'`
      }
      return await pb.collection('customers').getFullList<CustomerRecord>({ filter })
    } catch {
      return []
    }
  },

  async getById(id: string): Promise<CustomerRecord> {
    return await pb.collection('customers').getOne<CustomerRecord>(id)
  },

  async create(data: Partial<CustomerRecord>): Promise<CustomerRecord> {
    return await pb.collection('customers').create<CustomerRecord>(data)
  },

  async update(id: string, data: Partial<CustomerRecord>): Promise<CustomerRecord> {
    return await pb.collection('customers').update<CustomerRecord>(id, data)
  },
}

export const StockService = {
  async listByStore(storeId: string): Promise<StockItemRecord[]> {
    return await pb.collection('stock_items').getFullList<StockItemRecord>({
      filter: `store = '${storeId}'`,
      expand: 'product,variant,store',
    })
  },

  async getStockItems(storeId?: string): Promise<StockItemRecord[]> {
    const filter = storeId ? `store = '${storeId}'` : ''
    return await pb.collection('stock_items').getFullList<StockItemRecord>({
      filter,
      expand: 'product,variant,store',
    })
  },

  async getLowStockCount(threshold = 2): Promise<number> {
    try {
      const items = await pb.collection('stock_items').getFullList<StockItemRecord>({
        filter: `quantity <= ${threshold}`,
      })
      return items.length
    } catch {
      return 0
    }
  },

  async listMovements(filter = '', page = 1, perPage = 30) {
    return await pb.collection('stock_movements').getList<StockMovementRecord>(page, perPage, {
      filter,
      sort: '-date,-created',
      expand: 'product,variant,store,user',
    })
  },

  async createMovement(data: Partial<StockMovementRecord>): Promise<StockMovementRecord> {
    return await pb.collection('stock_movements').create<StockMovementRecord>(data)
  },

  async adjustStock(
    storeId: string,
    productId: string,
    variantId: string | undefined,
    newQuantity: number,
    userId: string,
    reason: string,
  ) {
    let filter = `store = '${storeId}' && product = '${productId}'`
    if (variantId) {
      filter += ` && variant = '${variantId}'`
    } else {
      filter += ` && (variant = '' || variant = null)`
    }

    const items = await pb.collection('stock_items').getFullList<StockItemRecord>({ filter })
    let diff = newQuantity

    if (items.length > 0) {
      const current = items[0].quantity
      diff = newQuantity - current
      await pb.collection('stock_items').update(items[0].id, { quantity: newQuantity })
    } else {
      await pb.collection('stock_items').create({
        store: storeId,
        product: productId,
        variant: variantId || null,
        quantity: newQuantity,
      })
    }

    if (diff !== 0) {
      await pb.collection('stock_movements').create({
        store: storeId,
        product: productId,
        variant: variantId || null,
        type: 'ajuste',
        quantity: diff,
        date: new Date().toISOString(),
        user: userId,
        reason,
      })
    }
  },

  async listTransfers(page = 1, perPage = 20) {
    return await pb.collection('transfers').getList<TransferRecord>(page, perPage, {
      sort: '-date,-created',
      expand: 'origin_store,destination_store,user,received_by',
    })
  },

  async getTransferItems(transferId: string): Promise<TransferItemRecord[]> {
    return await pb.collection('transfer_items').getFullList<TransferItemRecord>({
      filter: `transfer = '${transferId}'`,
      expand: 'product,variant',
    })
  },

  async getTransfers(page = 1, perPage = 50): Promise<TransferRecord[]> {
    const res = await this.listTransfers(page, perPage)
    return res.items
  },

  async getMovements(storeId?: string, perPage = 30) {
    const filter = storeId ? `store = '${storeId}'` : ''
    return await this.listMovements(filter, 1, perPage)
  },

  async recordMovement(data: Partial<StockMovementRecord>): Promise<StockMovementRecord> {
    return await this.createMovement(data)
  },

  async cancelTransfer(transferId: string) {
    const transfer = await pb.collection('transfers').getOne<TransferRecord>(transferId)
    if (transfer.status !== 'em_transito') {
      throw new Error('Apenas transferências em trânsito podem ser canceladas.')
    }
    const items = await this.getTransferItems(transferId)

    // Devolve para a origem
    for (const item of items) {
      let filter = `store = '${transfer.origin_store}' && product = '${item.product}'`
      if (item.variant) {
        filter += ` && variant = '${item.variant}'`
      } else {
        filter += ` && (variant = '' || variant = null)`
      }
      const existing = await pb.collection('stock_items').getFullList<StockItemRecord>({ filter })
      if (existing.length > 0) {
        await pb.collection('stock_items').update(existing[0].id, {
          quantity: existing[0].quantity + item.quantity,
        })
      }
      await pb.collection('stock_movements').create({
        store: transfer.origin_store,
        product: item.product,
        variant: item.variant || null,
        type: 'ajuste',
        quantity: item.quantity,
        date: new Date().toISOString(),
        user: pb.authStore.record?.id || '',
        reason: `Cancelamento de transferência #${transfer.id.slice(0, 8)} (estorno para origem)`,
        source_ref: transfer.id,
      })
    }

    return await pb.collection('transfers').update<TransferRecord>(transferId, {
      status: 'cancelada',
    })
  },

  async createTransfer(
    originStoreOrData:
      | string
      | {
          origin_store: string
          destination_store: string
          user?: string
          note?: string
        },
    destStoreOrItems:
      | string
      | Array<{
          product: string
          variant?: string
          quantity: number
        }>,
    itemsOrNote?:
      | Array<{
          product: string
          variant?: string
          quantity: number
        }>
      | string,
    optionalNote?: string,
  ) {
    let origin_store = ''
    let destination_store = ''
    let user = pb.authStore.record?.id || ''
    let note = ''
    let items: Array<{ product: string; variant?: string; quantity: number }> = []

    if (typeof originStoreOrData === 'object') {
      origin_store = originStoreOrData.origin_store
      destination_store = originStoreOrData.destination_store
      user = originStoreOrData.user || user
      note = originStoreOrData.note || ''
      items = destStoreOrItems as Array<{ product: string; variant?: string; quantity: number }>
    } else {
      origin_store = originStoreOrData
      destination_store = destStoreOrItems as string
      items = itemsOrNote as Array<{ product: string; variant?: string; quantity: number }>
      note = optionalNote || ''
    }
    const transfer = await pb.collection('transfers').create<TransferRecord>({
      origin_store,
      destination_store,
      user,
      note,
      status: 'em_transito',
      date: new Date().toISOString(),
    })

    for (const item of items) {
      await pb.collection('transfer_items').create({
        transfer: transfer.id,
        product: item.product,
        variant: item.variant || null,
        quantity: item.quantity,
      })

      let filter = `store = '${origin_store}' && product = '${item.product}'`
      if (item.variant) {
        filter += ` && variant = '${item.variant}'`
      } else {
        filter += ` && (variant = '' || variant = null)`
      }

      const existing = await pb.collection('stock_items').getFullList<StockItemRecord>({ filter })
      if (existing.length > 0) {
        const newQty = Math.max(0, existing[0].quantity - item.quantity)
        await pb.collection('stock_items').update(existing[0].id, { quantity: newQty })
      }

      await pb.collection('stock_movements').create({
        store: origin_store,
        product: item.product,
        variant: item.variant || null,
        type: 'transferencia_envio',
        quantity: -item.quantity,
        date: new Date().toISOString(),
        user: user,
        reason: `Transferência #${transfer.id.slice(0, 8)} para outra unidade`,
        source_ref: transfer.id,
      })
    }

    return transfer
  },

  async receiveTransfer(transferId: string, receivedByUserId?: string) {
    const userId = receivedByUserId || pb.authStore.record?.id || ''
    const transfer = await pb.collection('transfers').getOne<TransferRecord>(transferId)
    if (transfer.status !== 'em_transito') {
      throw new Error('Transferência não está em trânsito')
    }

    const items = await this.getTransferItems(transferId)

    for (const item of items) {
      let filter = `store = '${transfer.destination_store}' && product = '${item.product}'`
      if (item.variant) {
        filter += ` && variant = '${item.variant}'`
      } else {
        filter += ` && (variant = '' || variant = null)`
      }

      const existing = await pb.collection('stock_items').getFullList<StockItemRecord>({ filter })
      if (existing.length > 0) {
        await pb.collection('stock_items').update(existing[0].id, {
          quantity: existing[0].quantity + item.quantity,
        })
      } else {
        await pb.collection('stock_items').create({
          store: transfer.destination_store,
          product: item.product,
          variant: item.variant || null,
          quantity: item.quantity,
        })
      }

      await pb.collection('stock_movements').create({
        store: transfer.destination_store,
        product: item.product,
        variant: item.variant || null,
        type: 'transferencia_recebimento',
        quantity: item.quantity,
        date: new Date().toISOString(),
        user: userId,
        reason: `Recebimento Transferência #${transfer.id.slice(0, 8)}`,
        source_ref: transfer.id,
      })
    }

    return await pb.collection('transfers').update<TransferRecord>(transferId, {
      status: 'recebida',
      received_by: userId,
      received_at: new Date().toISOString(),
    })
  },
}

export const SettingsService = {
  async get(key: string, defaultValue = ''): Promise<string> {
    try {
      const rec = await pb.collection('settings').getFirstListItem<SettingRecord>(`key = '${key}'`)
      return rec.value
    } catch {
      return defaultValue
    }
  },

  async set(key: string, value: string): Promise<SettingRecord> {
    try {
      const rec = await pb.collection('settings').getFirstListItem<SettingRecord>(`key = '${key}'`)
      return await pb.collection('settings').update<SettingRecord>(rec.id, { value })
    } catch {
      return await pb.collection('settings').create<SettingRecord>({ key, value })
    }
  },

  async getAll(): Promise<Record<string, string>> {
    const list = await pb.collection('settings').getFullList<SettingRecord>()
    const map: Record<string, string> = {}
    for (const item of list) {
      map[item.key] = item.value
    }
    return map
  },
}

export const SalesService = {
  async list(filter = '', page = 1, perPage = 20) {
    return await pb.collection('sales').getList<SaleRecord>(page, perPage, {
      filter,
      sort: '-created',
      expand: 'customer,store,seller,authorized_by,canceled_by,delivered_by',
    })
  },

  async getAll(filter = ''): Promise<SaleRecord[]> {
    return await pb.collection('sales').getFullList<SaleRecord>({
      filter,
      sort: '-created',
      expand: 'customer,store,seller,authorized_by,canceled_by,delivered_by',
    })
  },

  async cancelOrReturnSale(saleId: string, reason: string, adminUserId: string) {
    return this.cancelSale(saleId, reason, adminUserId)
  },

  async getById(id: string): Promise<SaleRecord> {
    return await pb.collection('sales').getOne<SaleRecord>(id, {
      expand: 'customer,store,seller,authorized_by,canceled_by,delivered_by',
    })
  },

  async getItems(saleId: string): Promise<SaleItemRecord[]> {
    return await pb.collection('sale_items').getFullList<SaleItemRecord>({
      filter: `sale = '${saleId}'`,
    })
  },

  async getPayments(saleId: string): Promise<SalePaymentRecord[]> {
    return await pb.collection('sale_payments').getFullList<SalePaymentRecord>({
      filter: `sale = '${saleId}'`,
      expand: 'financial_account',
    })
  },

  async getDocuments(saleId: string): Promise<SaleDocumentRecord[]> {
    return await pb.collection('sale_documents').getFullList<SaleDocumentRecord>({
      filter: `sale = '${saleId}'`,
      sort: '-created',
      expand: 'uploaded_by',
    })
  },

  async uploadDocument(
    saleId: string,
    file: File,
    label: string,
    docType:
      | 'nota_fiscal'
      | 'comprovante_pagamento'
      | 'recibo_entrega'
      | 'termo_garantia'
      | 'outro' = 'nota_fiscal',
  ): Promise<SaleDocumentRecord> {
    const formData = new FormData()
    formData.append('sale', saleId)
    formData.append('file', file)
    formData.append('label', label)
    formData.append('doc_type', docType)
    formData.append('file_size', String(file.size))
    if (pb.authStore.record?.id) {
      formData.append('uploaded_by', pb.authStore.record.id)
    }

    return await pb.collection('sale_documents').create<SaleDocumentRecord>(formData)
  },

  async deleteDocument(docId: string): Promise<boolean> {
    return await pb.collection('sale_documents').delete(docId)
  },

  async generateNextNumber(): Promise<string> {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const prefix = `VEN-${yyyy}${mm}-`

    const lastSales = await pb.collection('sales').getList<SaleRecord>(1, 1, {
      filter: `number ~ '${prefix}'`,
      sort: '-number',
    })

    if (lastSales.items.length === 0) {
      return `${prefix}0001`
    }

    const lastNum = lastSales.items[0].number
    const sequencePart = parseInt(lastNum.replace(prefix, ''), 10) || 0
    return `${prefix}${String(sequencePart + 1).padStart(4, '0')}`
  },

  async createDraftSale(
    saleData: Partial<SaleRecord>,
    items: Array<Partial<SaleItemRecord>>,
    payments: Array<Partial<SalePaymentRecord>>,
  ): Promise<SaleRecord> {
    const number = await this.generateNextNumber()
    const sale = await pb.collection('sales').create<SaleRecord>({
      ...saleData,
      number,
      status: 'rascunho',
      delivery_status: 'pendente',
    })

    for (const item of items) {
      await pb.collection('sale_items').create({
        ...item,
        sale: sale.id,
      })
    }

    for (const p of payments) {
      await pb.collection('sale_payments').create({
        ...p,
        sale: sale.id,
        confirmed: false,
      })
    }

    return sale
  },

  async confirmSale(saleId: string) {
    // Calls our atomic server endpoint which enforces:
    // - transaction consistency
    // - monthly closed period check
    // - exact payment coverage or admin authorization
    // - concurrency check on stock
    // - stock decrements and movements
    // - commission calculation item by item
    // - audit logging
    const res = await pb.send<{ success: boolean; saleId: string; number: string }>(
      '/backend/v1/nwe/confirm-sale',
      {
        method: 'POST',
        body: { saleId },
      },
    )
    return res
  },

  async registerDelivery(saleId: string, deliveredByUserId: string) {
    const sale = await pb.collection('sales').getOne<SaleRecord>(saleId)
    if (sale.status !== 'confirmada') {
      throw new Error('Apenas vendas confirmadas podem ser marcadas como entregues.')
    }
    if (sale.delivery_status === 'entregue') {
      throw new Error('Esta venda já foi entregue anteriormente.')
    }

    // Notice: Delivery DOES NOT generate another stock decrement. Stock is decremented on confirmation only.
    const updated = await pb.collection('sales').update<SaleRecord>(saleId, {
      delivery_status: 'entregue',
      delivered_at: new Date().toISOString(),
      delivered_by: deliveredByUserId,
    })

    // Audit log
    await pb.collection('audit_logs').create({
      entity: 'sales',
      record_id: saleId,
      action: 'alteracao',
      user: deliveredByUserId,
      reason: 'Registro de entrega do produto ao cliente',
      new_values: { delivery_status: 'entregue', delivered_at: new Date().toISOString() },
    })

    return updated
  },

  async cancelSale(saleId: string, reason: string, adminUserId: string) {
    const sale = await pb.collection('sales').getOne<SaleRecord>(saleId)
    if (sale.status === 'cancelada') {
      throw new Error('Esta venda já está cancelada.')
    }

    const items = await pb.collection('sale_items').getFullList<SaleItemRecord>({
      filter: `sale = '${saleId}'`,
    })

    // If sale was confirmed and NOT delivered yet, return stock once
    if (sale.status === 'confirmada' && sale.delivery_status !== 'entregue') {
      for (const item of items) {
        if (!item.product) continue
        let stockFilter = `store = '${sale.store}' && product = '${item.product}'`
        if (item.variant) {
          stockFilter += ` && variant = '${item.variant}'`
        } else {
          stockFilter += ` && (variant = '' || variant = null)`
        }
        const existingStock = await pb.collection('stock_items').getFullList<StockItemRecord>({
          filter: stockFilter,
        })
        if (existingStock.length > 0) {
          await pb.collection('stock_items').update(existingStock[0].id, {
            quantity: existingStock[0].quantity + item.quantity,
          })
        }
        await pb.collection('stock_movements').create({
          store: sale.store,
          product: item.product,
          variant: item.variant || null,
          type: 'devolucao',
          quantity: item.quantity,
          date: new Date().toISOString(),
          user: adminUserId,
          reason: `Cancelamento de venda #${sale.number} (antes da entrega)`,
          source_ref: saleId,
        })
      }
    }

    // Cancel / reverse commissions
    const comms = await pb.collection('commissions').getFullList<CommissionRecord>({
      filter: `sale = '${saleId}'`,
    })
    for (const c of comms) {
      await pb.collection('commissions').update(c.id, {
        status: 'estornada',
        notes: `Estorno automático por cancelamento da venda #${sale.number}. Motivo: ${reason}`,
      })
    }

    // Update sale record
    const updated = await pb.collection('sales').update<SaleRecord>(saleId, {
      status: 'cancelada',
      cancellation_reason: reason,
      canceled_by: adminUserId,
      canceled_at: new Date().toISOString(),
    })

    // Register sale_returns record
    await pb.collection('sale_returns').create({
      sale: saleId,
      store: sale.store,
      type: 'cancelamento',
      reason,
      refund_amount: sale.total,
      refund_status: 'sem_reembolso',
      product_condition:
        sale.delivery_status === 'entregue' ? 'avariado_indisponivel' : 'nao_entregue_liberado',
      performed_by: adminUserId,
    })

    // Audit log
    await pb.collection('audit_logs').create({
      entity: 'sales',
      record_id: saleId,
      action: 'cancelamento',
      user: adminUserId,
      reason,
      previous_values: { status: sale.status },
      new_values: { status: 'cancelada', cancellation_reason: reason },
    })

    return updated
  },

  async registerReturn(
    saleId: string,
    data: {
      type: 'devolucao_total' | 'devolucao_parcial'
      reason: string
      refund_amount: number
      refund_status: 'pendente' | 'reembolsado' | 'sem_reembolso'
      refund_date?: string
      refund_method?: 'pix' | 'dinheiro' | 'estorno_cartao'
      refund_account?: string
      product_condition:
        | 'perfeito_retorna_venda'
        | 'avariado_indisponivel'
        | 'nao_entregue_liberado'
      performed_by: string
      items: Array<{
        sale_item_id: string
        product_id: string
        variant_id?: string
        product_name: string
        quantity: number
        unit_price: number
        cost_price: number
        condition: string
      }>
    },
  ) {
    const sale = await pb.collection('sales').getOne<SaleRecord>(saleId)

    // Create sale_return record
    const returnRec = await pb.collection('sale_returns').create<SaleReturnRecord>({
      sale: saleId,
      store: sale.store,
      type: data.type,
      reason: data.reason,
      refund_amount: data.refund_amount,
      refund_status: data.refund_status,
      refund_date: data.refund_date || new Date().toISOString(),
      refund_method: data.refund_method,
      refund_account: data.refund_account,
      product_condition: data.product_condition,
      performed_by: data.performed_by,
      items_detail: data.items,
    })

    // Return stock ONLY IF condition is 'perfeito_retorna_venda' or 'nao_entregue_liberado'
    // If 'avariado_indisponivel', it stays unavailable for sale until administrative decision
    if (
      data.product_condition === 'perfeito_retorna_venda' ||
      data.product_condition === 'nao_entregue_liberado'
    ) {
      for (const it of data.items) {
        if (!it.product_id) continue
        let stockFilter = `store = '${sale.store}' && product = '${it.product_id}'`
        if (it.variant_id) {
          stockFilter += ` && variant = '${it.variant_id}'`
        } else {
          stockFilter += ` && (variant = '' || variant = null)`
        }
        const existingStock = await pb.collection('stock_items').getFullList<StockItemRecord>({
          filter: stockFilter,
        })
        if (existingStock.length > 0) {
          await pb.collection('stock_items').update(existingStock[0].id, {
            quantity: existingStock[0].quantity + it.quantity,
          })
        }
        await pb.collection('stock_movements').create({
          store: sale.store,
          product: it.product_id,
          variant: it.variant_id || null,
          type: 'devolucao',
          quantity: it.quantity,
          date: new Date().toISOString(),
          user: data.performed_by,
          reason: `Devolução venda #${sale.number} - Condição: ${data.product_condition}`,
          source_ref: returnRec.id,
        })
      }
    } else {
      // Record movement as avaria
      for (const it of data.items) {
        if (!it.product_id) continue
        await pb.collection('stock_movements').create({
          store: sale.store,
          product: it.product_id,
          variant: it.variant_id || null,
          type: 'avaria',
          quantity: it.quantity,
          date: new Date().toISOString(),
          user: data.performed_by,
          reason: `Produto avariado retornado na devolução #${sale.number} (indisponível para venda)`,
          source_ref: returnRec.id,
        })
      }
    }

    // Update returned_quantity in sale_items
    for (const it of data.items) {
      if (it.sale_item_id) {
        try {
          const sItem = await pb.collection('sale_items').getOne<SaleItemRecord>(it.sale_item_id)
          await pb.collection('sale_items').update(it.sale_item_id, {
            returned_quantity: (sItem.returned_quantity || 0) + it.quantity,
          })
        } catch {
          /* intentionally ignored */
        }
      }
    }

    // Proportional commission adjustment
    const comms = await pb.collection('commissions').getFullList<CommissionRecord>({
      filter: `sale = '${saleId}'`,
    })
    for (const c of comms) {
      if (data.type === 'devolucao_total') {
        await pb.collection('commissions').update(c.id, {
          status: 'estornada',
          notes: `Estornada por devolução total #${sale.number}. Ajuste de R$ ${c.value.toFixed(2)}`,
        })
      } else {
        const proportion = sale.total > 0 ? (sale.total - data.refund_amount) / sale.total : 0
        const adjustedVal = Math.max(0, c.value * proportion)
        await pb.collection('commissions').update(c.id, {
          value: adjustedVal,
          notes: `Ajuste parcial por devolução. Valor anterior: R$ ${c.value.toFixed(2)}, novo: R$ ${adjustedVal.toFixed(2)}`,
        })
      }
    }

    // If refund was processed via a financial account, create a financial_transaction (reembolso)
    if (data.refund_status === 'reembolsado' && data.refund_amount > 0) {
      await pb.collection('financial_transactions').create({
        description: `Reembolso devolução Venda #${sale.number}`,
        type: 'reembolso',
        store: sale.store,
        account: data.refund_account || null,
        amount: data.refund_amount,
        competence_date: data.refund_date || new Date().toISOString(),
        due_date: data.refund_date || new Date().toISOString(),
        payment_date: data.refund_date || new Date().toISOString(),
        status: 'pago',
        paid_amount: data.refund_amount,
        payment_method: data.refund_method || 'pix',
        recipient_supplier: `Cliente da Venda #${sale.number}`,
        sale: saleId,
        notes: data.reason,
        created_by: data.performed_by,
      })

      // Update account current balance if account provided
      if (data.refund_account) {
        try {
          const acc = await pb
            .collection('financial_accounts')
            .getOne<FinancialAccountRecord>(data.refund_account)
          await pb.collection('financial_accounts').update(data.refund_account, {
            current_balance: acc.current_balance - data.refund_amount,
          })
        } catch {
          /* intentionally ignored */
        }
      }
    }

    // Audit log
    await pb.collection('audit_logs').create({
      entity: 'sales',
      record_id: saleId,
      action: 'devolucao',
      user: data.performed_by,
      reason: data.reason,
      new_values: { return_id: returnRec.id, refund_amount: data.refund_amount, type: data.type },
    })

    return returnRec
  },
}

export const CommissionsService = {
  async list(filter = '', page = 1, perPage = 30) {
    return await pb.collection('commissions').getList<CommissionRecord>(page, perPage, {
      filter,
      sort: '-created',
      expand: 'seller,sale,store',
    })
  },

  async getAll(filter = '', storeId?: string): Promise<CommissionRecord[]> {
    let finalFilter = filter
    if (storeId) {
      finalFilter = finalFilter
        ? `store = '${storeId}' && (${finalFilter})`
        : `store = '${storeId}'`
    }
    return await pb.collection('commissions').getFullList<CommissionRecord>({
      filter: finalFilter,
      sort: '-created',
      expand: 'seller,sale,store',
    })
  },

  async updateStatus(
    id: string,
    status: 'prevista' | 'liberada' | 'paga' | 'estornada' | 'pendente',
    notes?: string,
  ): Promise<CommissionRecord> {
    const updateData: Partial<CommissionRecord> = { status }
    if (notes) updateData.notes = notes
    if (status === 'liberada') updateData.released_at = new Date().toISOString()
    if (status === 'paga') updateData.paid_at = new Date().toISOString()
    return await pb.collection('commissions').update<CommissionRecord>(id, updateData)
  },

  async payCommission(
    commissionId: string,
    accountId: string,
    paymentMethod: string,
    adminUserId: string,
  ) {
    const comm = await pb.collection('commissions').getOne<CommissionRecord>(commissionId, {
      expand: 'seller,sale',
    })

    if (comm.status === 'paga') {
      throw new Error('Esta comissão já está marcada como paga.')
    }

    // Update commission to 'paga'
    const updatedComm = await pb.collection('commissions').update<CommissionRecord>(commissionId, {
      status: 'paga',
      paid_at: new Date().toISOString(),
    })

    // Register financial transaction linked to commission and origin sale
    await pb.collection('financial_transactions').create({
      description: `Pagamento de comissão - ${comm.expand?.seller?.name || 'Vendedor'} (Venda #${comm.expand?.sale?.number || ''})`,
      type: 'despesa',
      store: comm.store,
      account: accountId,
      amount: comm.value,
      competence_date: comm.competence_date || comm.created,
      due_date: new Date().toISOString(),
      payment_date: new Date().toISOString(),
      status: 'pago',
      paid_amount: comm.value,
      payment_method: paymentMethod as any,
      recipient_supplier: comm.expand?.seller?.name,
      sale: comm.sale,
      commission: commissionId,
      created_by: adminUserId,
    })

    // Update account balance
    if (accountId) {
      try {
        const acc = await pb
          .collection('financial_accounts')
          .getOne<FinancialAccountRecord>(accountId)
        await pb.collection('financial_accounts').update(accountId, {
          current_balance: acc.current_balance - comm.value,
        })
      } catch {
        /* intentionally ignored */
      }
    }

    // Audit log
    await pb.collection('audit_logs').create({
      entity: 'commissions',
      record_id: commissionId,
      action: 'alteracao',
      user: adminUserId,
      reason: `Pagamento de comissão no valor de R$ ${comm.value.toFixed(2)}`,
      previous_values: { status: comm.status },
      new_values: { status: 'paga', paid_at: new Date().toISOString(), account: accountId },
    })

    return updatedComm
  },
}

export const FinancialService = {
  // Accounts
  async listAccounts(): Promise<FinancialAccountRecord[]> {
    return await pb.collection('financial_accounts').getFullList<FinancialAccountRecord>({
      sort: 'name',
      expand: 'store',
    })
  },

  async createAccount(data: Partial<FinancialAccountRecord>): Promise<FinancialAccountRecord> {
    return await pb.collection('financial_accounts').create<FinancialAccountRecord>({
      ...data,
      current_balance: data.initial_balance || 0,
    })
  },

  async updateAccount(
    id: string,
    data: Partial<FinancialAccountRecord>,
  ): Promise<FinancialAccountRecord> {
    return await pb.collection('financial_accounts').update<FinancialAccountRecord>(id, data)
  },

  // Categories
  async listCategories(): Promise<FinancialCategoryRecord[]> {
    return await pb.collection('financial_categories').getFullList<FinancialCategoryRecord>({
      sort: 'group,name,subcategory',
    })
  },

  async createCategory(data: Partial<FinancialCategoryRecord>): Promise<FinancialCategoryRecord> {
    return await pb.collection('financial_categories').create<FinancialCategoryRecord>(data)
  },

  // Transactions
  async listTransactions(filter = '', page = 1, perPage = 30) {
    return await pb
      .collection('financial_transactions')
      .getList<FinancialTransactionRecord>(page, perPage, {
        filter,
        sort: '-due_date,-created',
        expand: 'category,store,account,destination_account,sale,commission,created_by',
      })
  },

  async createTransaction(
    data: Partial<FinancialTransactionRecord>,
  ): Promise<FinancialTransactionRecord> {
    return await pb.collection('financial_transactions').create<FinancialTransactionRecord>(data)
  },

  async updateTransaction(
    id: string,
    data: Partial<FinancialTransactionRecord>,
  ): Promise<FinancialTransactionRecord> {
    return await pb
      .collection('financial_transactions')
      .update<FinancialTransactionRecord>(id, data)
  },

  async getExpenses(filter = ''): Promise<FinancialTransactionRecord[]> {
    const fullFilter = filter ? `type = 'despesa' && (${filter})` : `type = 'despesa'`
    return await pb.collection('financial_transactions').getFullList<FinancialTransactionRecord>({
      filter: fullFilter,
      sort: '-due_date,-created',
      expand: 'category,store,account',
    })
  },

  async transferBetweenAccounts(
    sourceAccountId: string,
    destAccountId: string,
    amount: number,
    date: string,
    description: string,
    userId: string,
  ) {
    const source = await pb
      .collection('financial_accounts')
      .getOne<FinancialAccountRecord>(sourceAccountId)
    const dest = await pb
      .collection('financial_accounts')
      .getOne<FinancialAccountRecord>(destAccountId)

    // Note: transfers between own accounts are NOT revenue or expense
    const trans = await pb.collection('financial_transactions').create<FinancialTransactionRecord>({
      description: description || `Transferência entre contas: ${source.name} -> ${dest.name}`,
      type: 'transferencia_entre_contas',
      account: sourceAccountId,
      destination_account: destAccountId,
      amount,
      competence_date: date,
      due_date: date,
      payment_date: date,
      status: 'pago',
      paid_amount: amount,
      payment_method: 'transferencia',
      created_by: userId,
    })

    // Update balances
    await pb.collection('financial_accounts').update(sourceAccountId, {
      current_balance: source.current_balance - amount,
    })
    await pb.collection('financial_accounts').update(destAccountId, {
      current_balance: dest.current_balance + amount,
    })

    return trans
  },

  // Card Receivables
  async listCardReceivables(filter = '', page = 1, perPage = 30) {
    return await pb.collection('card_receivables').getList<CardReceivableRecord>(page, perPage, {
      filter,
      sort: 'expected_liquidation_date',
      expand: 'sale,store,target_account',
    })
  },

  async liquidateCardReceivable(id: string, targetAccountId: string, actualDate: string) {
    const rec = await pb.collection('card_receivables').getOne<CardReceivableRecord>(id)
    const updated = await pb.collection('card_receivables').update<CardReceivableRecord>(id, {
      status: 'liquidado',
      target_account: targetAccountId,
      actual_liquidation_date: actualDate,
    })

    // Update account balance with net amount
    if (targetAccountId) {
      try {
        const acc = await pb
          .collection('financial_accounts')
          .getOne<FinancialAccountRecord>(targetAccountId)
        await pb.collection('financial_accounts').update(targetAccountId, {
          current_balance: acc.current_balance + rec.net_amount,
        })
      } catch {
        /* intentionally ignored */
      }
    }

    return updated
  },

  // Recurring Expenses
  async listRecurringExpenses(): Promise<RecurringExpenseRecord[]> {
    return await pb.collection('recurring_expenses').getFullList<RecurringExpenseRecord>({
      sort: 'description',
      expand: 'category,store,preferred_account',
    })
  },

  async createRecurringExpense(
    data: Partial<RecurringExpenseRecord>,
  ): Promise<RecurringExpenseRecord> {
    return await pb.collection('recurring_expenses').create<RecurringExpenseRecord>(data)
  },

  async updateRecurringExpense(
    id: string,
    data: Partial<RecurringExpenseRecord>,
  ): Promise<RecurringExpenseRecord> {
    return await pb.collection('recurring_expenses').update<RecurringExpenseRecord>(id, data)
  },

  // Allocations (Rateios)
  async listAllocations(): Promise<ExpenseAllocationRecord[]> {
    return await pb.collection('expense_allocations').getFullList<ExpenseAllocationRecord>({
      sort: 'name',
      expand: 'store',
    })
  },

  async updateAllocation(
    id: string,
    data: Partial<ExpenseAllocationRecord>,
  ): Promise<ExpenseAllocationRecord> {
    return await pb.collection('expense_allocations').update<ExpenseAllocationRecord>(id, data)
  },

  // Monthly Closings
  async listClosings(year?: number): Promise<MonthlyClosingRecord[]> {
    const filter = year ? `year = ${year}` : ''
    return await pb.collection('monthly_closings').getFullList<MonthlyClosingRecord>({
      filter,
      sort: '-year,-month',
      expand: 'store,closed_by,reopened_by',
    })
  },

  async closeMonth(
    year: number,
    month: number,
    storeId: string | null,
    userId: string,
    summary: any,
  ) {
    const existing = await pb.collection('monthly_closings').getFullList<MonthlyClosingRecord>({
      filter: `year = ${year} && month = ${month} && ${storeId ? `store = '${storeId}'` : `(store = '' || store = null)`}`,
    })

    if (existing.length > 0) {
      return await pb.collection('monthly_closings').update(existing[0].id, {
        status: 'fechado',
        closed_by: userId,
        closed_at: new Date().toISOString(),
        summary,
      })
    }

    return await pb.collection('monthly_closings').create({
      year,
      month,
      store: storeId || null,
      status: 'fechado',
      closed_by: userId,
      closed_at: new Date().toISOString(),
      summary,
    })
  },

  async reopenMonth(closingId: string, reason: string, userId: string) {
    const closing = await pb.collection('monthly_closings').getOne<MonthlyClosingRecord>(closingId)
    const updated = await pb.collection('monthly_closings').update(closingId, {
      status: 'aberto',
      reopened_by: userId,
      reopened_at: new Date().toISOString(),
      reopen_reason: reason,
    })

    await pb.collection('audit_logs').create({
      entity: 'monthly_closings',
      record_id: closingId,
      action: 'reabertura',
      user: userId,
      reason,
      previous_values: { status: 'fechado', year: closing.year, month: closing.month },
      new_values: { status: 'aberto' },
    })

    return updated
  },

  // Audit Logs
  async listAuditLogs(filter = '', page = 1, perPage = 50) {
    return await pb.collection('audit_logs').getList<AuditLogRecord>(page, perPage, {
      filter,
      sort: '-created',
      expand: 'user',
    })
  },
}

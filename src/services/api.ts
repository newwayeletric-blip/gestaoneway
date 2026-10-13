import pb from '@/lib/pocketbase/client'
import type {
  StoreRecord,
  ProductRecord,
  CustomerRecord,
  SaleRecord,
  CommissionRuleRecord,
  SettingRecord,
  CategoryRecord,
  TransferRecord,
  CommissionRecord,
  ExpenseRecord,
  PaymentLedgerRecord,
} from '@/types'

export const StoresService = {
  async getAll() {
    return pb.collection<StoreRecord>('stores').getFullList({ sort: 'name' })
  },
  async getById(id: string) {
    return pb.collection<StoreRecord>('stores').getOne(id)
  },
  async update(id: string, data: Partial<StoreRecord>) {
    return pb.collection<StoreRecord>('stores').update(id, data)
  },
  async create(data: Partial<StoreRecord>) {
    return pb.collection<StoreRecord>('stores').create(data)
  },
}

export const ProductsService = {
  async getAll(filter = '') {
    return pb.collection<ProductRecord>('products').getFullList({
      filter,
      sort: 'name',
      expand: 'category',
    })
  },
  async getById(id: string) {
    return pb.collection<ProductRecord>('products').getOne(id, {
      expand: 'category',
    })
  },
  async getVariants(productId: string) {
    return pb.collection('product_variants').getFullList({
      filter: `product = '${productId}'`,
      sort: 'name',
    })
  },
  async create(data: FormData | Partial<ProductRecord>) {
    return pb.collection<ProductRecord>('products').create(data)
  },
  async update(id: string, data: FormData | Partial<ProductRecord>) {
    return pb.collection<ProductRecord>('products').update(id, data)
  },
  async createVariant(data: any) {
    return pb.collection('product_variants').create(data)
  },
  async updateVariant(id: string, data: any) {
    return pb.collection('product_variants').update(id, data)
  },
  async getCategories(): Promise<CategoryRecord[]> {
    return pb.collection<CategoryRecord>('categories').getFullList({ sort: 'name' })
  },
  async createCategory(name: string, description = '') {
    return pb.collection('categories').create({ name, description })
  },
}

export const CustomersService = {
  async getAll(search = '') {
    let filter = ''
    if (search.trim()) {
      const q = search.trim()
      filter = `name ~ "${q}" || phone ~ "${q}" || document ~ "${q}"`
    }
    return pb.collection<CustomerRecord>('customers').getFullList({
      filter,
      sort: '-created',
    })
  },
  async getById(id: string) {
    return pb.collection<CustomerRecord>('customers').getOne(id, {
      expand: 'created_by',
    })
  },
  async create(data: Partial<CustomerRecord>) {
    return pb.collection<CustomerRecord>('customers').create(data)
  },
  async update(id: string, data: Partial<CustomerRecord>) {
    return pb.collection<CustomerRecord>('customers').update(id, data)
  },
  async checkDuplicate(phone: string, document = '', currentId = '') {
    const filters: string[] = []
    if (phone) filters.push(`phone = "${phone}"`)
    if (document) filters.push(`document = "${document}"`)
    if (filters.length === 0) return []

    let query = filters.join(' || ')
    if (currentId) {
      query = `(${query}) && id != "${currentId}"`
    }
    return pb.collection<CustomerRecord>('customers').getFullList({ filter: query })
  },
}

export const StockService = {
  async getStockItems(storeId = '', productId = '') {
    const filters: string[] = []
    if (storeId) filters.push(`store = "${storeId}"`)
    if (productId) filters.push(`product = "${productId}"`)

    return pb.collection('stock_items').getFullList({
      filter: filters.join(' && '),
      expand: 'product,variant,store',
    })
  },
  async getLowStockCount() {
    // Get all stock items and products to check min_stock
    const [stocks, products] = await Promise.all([
      pb.collection('stock_items').getFullList(),
      pb.collection<ProductRecord>('products').getFullList({ filter: "status = 'ativo'" }),
    ])
    const prodMap = new Map(products.map((p) => [p.id, p.min_stock || 0]))

    let lowCount = 0
    for (const item of stocks) {
      const min = prodMap.get(item.product) || 0
      if (min > 0 && item.quantity <= min) {
        lowCount++
      }
    }
    return lowCount
  },
  async getMovements(storeId = '', limit = 50) {
    const filter = storeId ? `store = "${storeId}"` : ''
    return pb.collection('stock_movements').getList(1, limit, {
      filter,
      sort: '-created',
      expand: 'product,variant,store,user',
    })
  },
  async recordMovement(data: {
    type: string
    product: string
    variant?: string
    store: string
    quantity: number
    reason?: string
    source_ref?: string
    user?: string
  }) {
    // Find or create stock_item
    let filter = `product = "${data.product}" && store = "${data.store}"`
    if (data.variant) {
      filter += ` && variant = "${data.variant}"`
    }
    const existing = await pb.collection('stock_items').getFullList({ filter })
    let currentQty = 0
    let stockItemId = ''

    if (existing.length > 0) {
      currentQty = existing[0].quantity
      stockItemId = existing[0].id
    }

    let newQty = currentQty
    if (['entrada', 'transferencia_recebimento', 'devolucao'].includes(data.type)) {
      newQty = currentQty + data.quantity
    } else {
      // subtraction
      if (currentQty < data.quantity) {
        throw new Error(
          `Estoque insuficiente! Saldo atual: ${currentQty}, solicitado: ${data.quantity}`,
        )
      }
      newQty = currentQty - data.quantity
    }

    if (stockItemId) {
      await pb.collection('stock_items').update(stockItemId, { quantity: newQty })
    } else {
      await pb.collection('stock_items').create({
        product: data.product,
        variant: data.variant || null,
        store: data.store,
        quantity: newQty,
      })
    }

    return pb.collection('stock_movements').create({
      type: data.type,
      product: data.product,
      variant: data.variant || null,
      store: data.store,
      quantity: data.quantity,
      date: new Date().toISOString(),
      user: data.user || pb.authStore.record?.id,
      reason: data.reason || '',
      source_ref: data.source_ref || '',
    })
  },
  async getTransfers(): Promise<TransferRecord[]> {
    return pb.collection<TransferRecord>('transfers').getFullList({
      sort: '-created',
      expand: 'origin_store,destination_store,user,received_by',
    })
  },
  async getTransferItems(transferId: string) {
    return pb.collection('transfer_items').getFullList({
      filter: `transfer = "${transferId}"`,
      expand: 'product,variant',
    })
  },
  async createTransfer(
    originStore: string,
    destStore: string,
    items: Array<{ product: string; variant?: string; quantity: number }>,
    note = '',
  ) {
    if (originStore === destStore) {
      throw new Error('A loja de origem não pode ser igual à loja de destino.')
    }
    // Verify availability first
    for (const item of items) {
      let filter = `product = "${item.product}" && store = "${originStore}"`
      if (item.variant) filter += ` && variant = "${item.variant}"`
      const stocks = await pb.collection('stock_items').getFullList({ filter })
      const current = stocks.length > 0 ? stocks[0].quantity : 0
      if (current < item.quantity) {
        throw new Error(`Estoque insuficiente para transferência na loja de origem.`)
      }
    }

    // 1. Create transfer record
    const transfer = await pb.collection('transfers').create({
      origin_store: originStore,
      destination_store: destStore,
      status: 'em_transito',
      user: pb.authStore.record?.id,
      date: new Date().toISOString(),
      note,
    })

    // 2. Subtract from origin and create transfer_items
    for (const item of items) {
      await pb.collection('transfer_items').create({
        transfer: transfer.id,
        product: item.product,
        variant: item.variant || null,
        quantity: item.quantity,
      })

      await this.recordMovement({
        type: 'transferencia_envio',
        product: item.product,
        variant: item.variant,
        store: originStore,
        quantity: item.quantity,
        reason: `Envio transferência #${transfer.id}`,
        source_ref: transfer.id,
      })
    }

    return transfer
  },
  async receiveTransfer(transferId: string) {
    const transfer = await pb.collection('transfers').getOne(transferId)
    if (transfer.status !== 'em_transito') {
      throw new Error('Apenas transferências "em trânsito" podem ser recebidas.')
    }
    const items = await pb
      .collection('transfer_items')
      .getFullList({ filter: `transfer = "${transferId}"` })

    for (const item of items) {
      await this.recordMovement({
        type: 'transferencia_recebimento',
        product: item.product,
        variant: item.variant,
        store: transfer.destination_store,
        quantity: item.quantity,
        reason: `Recebimento transferência #${transfer.id}`,
        source_ref: transfer.id,
      })
    }

    return pb.collection('transfers').update(transferId, {
      status: 'recebida',
      received_by: pb.authStore.record?.id,
      received_at: new Date().toISOString(),
    })
  },
  async cancelTransfer(transferId: string) {
    const transfer = await pb.collection('transfers').getOne(transferId)
    if (transfer.status !== 'em_transito') {
      throw new Error('Apenas transferências "em trânsito" podem ser canceladas.')
    }
    const items = await pb
      .collection('transfer_items')
      .getFullList({ filter: `transfer = "${transferId}"` })

    // Return stock to origin
    for (const item of items) {
      await this.recordMovement({
        type: 'entrada',
        product: item.product,
        variant: item.variant,
        store: transfer.origin_store,
        quantity: item.quantity,
        reason: `Cancelamento de envio de transferência #${transfer.id}`,
        source_ref: transfer.id,
      })
    }

    return pb.collection('transfers').update(transferId, {
      status: 'cancelada',
    })
  },
}

export const SettingsService = {
  async getAll(): Promise<Record<string, string>> {
    const list = await pb.collection<SettingRecord>('settings').getFullList()
    const map: Record<string, string> = {}
    for (const item of list) {
      map[item.key] = item.value
    }
    return map
  },
  async set(key: string, value: string) {
    try {
      const existing = await pb
        .collection<SettingRecord>('settings')
        .getFirstListItem(`key = "${key}"`)
      return pb.collection<SettingRecord>('settings').update(existing.id, { value })
    } catch {
      return pb.collection<SettingRecord>('settings').create({ key, value })
    }
  },
}

export const SalesService = {
  async getAll(filter = '', sort = '-created') {
    return pb.collection<SaleRecord>('sales').getFullList({
      filter,
      sort,
      expand: 'customer,store,seller',
    })
  },
  async getById(id: string) {
    return pb.collection<SaleRecord>('sales').getOne(id, {
      expand: 'customer,store,seller',
    })
  },
  async getItems(saleId: string) {
    return pb.collection('sale_items').getFullList({
      filter: `sale = "${saleId}"`,
    })
  },
  async getPayments(saleId: string) {
    return pb.collection('sale_payments').getFullList({
      filter: `sale = "${saleId}"`,
    })
  },
  async getDocuments(saleId: string) {
    return pb.collection('sale_documents').getFullList({
      filter: `sale = "${saleId}"`,
      expand: 'uploaded_by',
    })
  },
  async createSale(data: {
    customer: string
    store: string
    seller: string
    items: Array<{
      product: string
      variant?: string
      product_name: string
      sku: string
      sale_price: number
      cost_price?: number
      quantity: number
      discount: number
      discount_rule?: string
      total: number
      serial_number?: string
    }>
    subtotal: number
    total_discount: number
    total: number
    payment: 'pix' | 'dinheiro' | 'cartao_credito'
    allow_installments?: boolean
    installments?: number
    observation?: string
    isDraft?: boolean
  }) {
    // 1. Generate unique sale number: NWE-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    const saleNumber = `NWE-${dateStr}-${randomSuffix}`

    // 2. If confirming (not draft), revalidate stock availability for each item in the specified store
    if (!data.isDraft) {
      for (const item of data.items) {
        let filter = `product = "${item.product}" && store = "${data.store}"`
        if (item.variant) filter += ` && variant = "${item.variant}"`
        const stocks = await pb.collection('stock_items').getFullList({ filter })
        const available = stocks.length > 0 ? stocks[0].quantity : 0
        if (available < item.quantity) {
          throw new Error(
            `Estoque insuficiente para o produto "${item.product_name}". Disponível na loja: ${available}, solicitado: ${item.quantity}.`,
          )
        }
      }
    }

    // 3. Create Sale Record
    const saleStatus = data.isDraft ? 'rascunho' : 'confirmada'
    const sale = await pb.collection<SaleRecord>('sales').create({
      number: saleNumber,
      customer: data.customer,
      store: data.store,
      seller: data.seller,
      status: saleStatus,
      subtotal: data.subtotal,
      total_discount: data.total_discount,
      total: data.total,
      payment: data.payment,
      allow_installments: data.allow_installments || false,
      installments: data.installments || 1,
      observation: data.observation || '',
    })

    // 4. Create Sale Items snapshots
    for (const item of data.items) {
      await pb.collection('sale_items').create({
        sale: sale.id,
        product: item.product,
        variant: item.variant || null,
        product_name: item.product_name,
        sku: item.sku,
        sale_price: item.sale_price,
        cost_price: item.cost_price || 0,
        quantity: item.quantity,
        discount: item.discount,
        discount_rule: item.discount_rule || '',
        total: item.total,
        serial_number: item.serial_number || '',
      })

      // 5. If confirmed, register stock movement: saida_venda
      if (!data.isDraft) {
        await StockService.recordMovement({
          type: 'saida_venda',
          product: item.product,
          variant: item.variant,
          store: data.store,
          quantity: item.quantity,
          reason: `Venda ${saleNumber}`,
          source_ref: sale.id,
          user: data.seller,
        })
      }
    }

    // 6. Record payment
    await pb.collection('sale_payments').create({
      sale: sale.id,
      method: data.payment,
      amount: data.total,
      confirmed: !data.isDraft,
      installments: data.installments || 1,
    })

    // 7. If confirmed, record payment ledger & calculate commission
    if (!data.isDraft) {
      await pb.collection('payments').create({
        sale: sale.id,
        customer: data.customer,
        store: data.store,
        method: data.payment,
        amount: data.total,
        status: 'pago',
      })

      // Commission calculation
      await CommissionsService.calculateAndCreateForSale(
        sale.id,
        data.seller,
        data.store,
        data.total,
      )
    }

    return sale
  },

  async cancelOrReturnSale(saleId: string, action: 'cancelada' | 'devolvida', reason = '') {
    const sale = await pb.collection<SaleRecord>('sales').getOne(saleId)
    if (sale.status === action) return

    const items = await pb.collection('sale_items').getFullList({ filter: `sale = "${saleId}"` })

    // If devolution, return items to origin store stock
    if (action === 'devolvida') {
      for (const it of items) {
        if (it.product) {
          await StockService.recordMovement({
            type: 'devolucao',
            product: it.product,
            variant: it.variant,
            store: sale.store,
            quantity: it.quantity,
            reason: `Devolução da Venda ${sale.number} - Motivo: ${reason}`,
            source_ref: sale.id,
          })
        }
      }
    }

    // Update sale status
    await pb.collection('sales').update(saleId, { status: action })

    // If commissions were created, mark them as canceled/void
    const commissions = await pb
      .collection('commissions')
      .getFullList({ filter: `sale = "${saleId}"` })
    for (const c of commissions) {
      await pb.collection('commissions').delete(c.id)
    }
  },
}

export const CommissionsService = {
  async getRules() {
    return pb.collection<CommissionRuleRecord>('commission_rules').getFullList({ sort: '-rate' })
  },
  async createRule(data: Partial<CommissionRuleRecord>) {
    return pb.collection('commission_rules').create(data)
  },
  async updateRule(id: string, data: Partial<CommissionRuleRecord>) {
    return pb.collection('commission_rules').update(id, data)
  },
  async deleteRule(id: string) {
    return pb.collection('commission_rules').delete(id)
  },
  async calculateAndCreateForSale(
    saleId: string,
    sellerId: string,
    storeId: string,
    saleTotal: number,
  ) {
    // Check if seller has cs_available !== false
    try {
      const seller = await pb.collection('users').getOne(sellerId)
      if (seller.cs_available === false) {
        return // Seller disabled for commissions
      }
    } catch {
      // ignore
    }

    // Look for matching rule (store specific first, or general)
    const rules = await pb.collection<CommissionRuleRecord>('commission_rules').getFullList({
      filter: 'active = true',
      sort: '-rate',
    })

    let matchedRule = rules.find(
      (r) => r.store === storeId && (!r.min_sale_amount || saleTotal >= r.min_sale_amount),
    )
    if (!matchedRule) {
      matchedRule = rules.find(
        (r) => !r.store && (!r.min_sale_amount || saleTotal >= r.min_sale_amount),
      )
    }

    const rate = matchedRule ? matchedRule.rate : 0
    const value = (saleTotal * rate) / 100

    if (value > 0 || rate > 0) {
      await pb.collection('commissions').create({
        seller: sellerId,
        sale: saleId,
        store: storeId,
        base_amount: saleTotal,
        rate: rate,
        value: value,
        status: 'pendente',
      })
    }
  },
  async getAll(sellerId = '', storeId = ''): Promise<CommissionRecord[]> {
    const filters: string[] = []
    if (sellerId) filters.push(`seller = "${sellerId}"`)
    if (storeId) filters.push(`store = "${storeId}"`)
    return pb.collection<CommissionRecord>('commissions').getFullList({
      filter: filters.join(' && '),
      sort: '-created',
      expand: 'seller,sale,store',
    })
  },
  async markAsPaid(id: string) {
    return pb.collection('commissions').update(id, { status: 'paga' })
  },
}

export const FinancialService = {
  async getExpenses(storeId = '', startDate = '', endDate = ''): Promise<ExpenseRecord[]> {
    const filters: string[] = []
    if (storeId) filters.push(`store = "${storeId}"`)
    if (startDate) filters.push(`date >= "${startDate}"`)
    if (endDate) filters.push(`date <= "${endDate}"`)

    return pb.collection<ExpenseRecord>('expenses').getFullList({
      filter: filters.join(' && '),
      sort: '-date',
      expand: 'store,created_by',
    })
  },
  async createExpense(data: any) {
    return pb.collection('expenses').create(data)
  },
  async deleteExpense(id: string) {
    return pb.collection('expenses').delete(id)
  },
  async getPayments(storeId = ''): Promise<PaymentLedgerRecord[]> {
    const filter = storeId ? `store = "${storeId}"` : ''
    return pb.collection<PaymentLedgerRecord>('payments').getFullList({
      filter,
      sort: '-created',
      expand: 'sale,customer,store',
    })
  },
}

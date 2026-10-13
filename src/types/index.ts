export type UserProfile = 'admin' | 'vendedor'
export type UserStatus = 'ativo' | 'inativo'

export interface UserRecord {
  id: string
  email: string
  name: string
  avatar?: string
  profile: UserProfile
  cpf?: string
  status: UserStatus
  stores?: string[] // Store IDs authorized for seller
  cs_available?: boolean
  created_by?: string
  verified?: boolean
  created: string
  updated: string
}

export interface StoreRecord {
  id: string
  name: string
  slug: string
  address?: string
  phone?: string
  whatsapp?: string
  manager?: string
  status?: 'ativa' | 'inativa'
  created: string
  updated: string
}

export interface CategoryRecord {
  id: string
  name: string
  description?: string
  created: string
  updated: string
}

export interface ProductRecord {
  id: string
  name: string
  sku: string
  category?: string
  brand?: string
  model?: string
  photo?: string
  description?: string
  sale_price: number
  cost_price?: number // Only for admin
  min_stock: number
  status: 'ativo' | 'inativo'
  track_serial: boolean
  created_by?: string
  created: string
  updated: string
  expand?: {
    category?: CategoryRecord
  }
}

export interface ProductVariantRecord {
  id: string
  product: string
  name: string
  sku: string
  sale_price: number
  cost_price?: number
  photo?: string
  track_serial: boolean
  created: string
  updated: string
}

export interface StockItemRecord {
  id: string
  product: string
  variant?: string
  store: string
  quantity: number
  created: string
  updated: string
  expand?: {
    product?: ProductRecord
    variant?: ProductVariantRecord
    store?: StoreRecord
  }
}

export type MovementType =
  | 'entrada'
  | 'saida_venda'
  | 'transferencia_envio'
  | 'transferencia_recebimento'
  | 'devolucao'
  | 'perda'
  | 'avaria'
  | 'ajuste'

export interface StockMovementRecord {
  id: string
  type: MovementType
  product: string
  variant?: string
  store: string
  quantity: number
  date: string
  user?: string
  reason?: string
  source_ref?: string
  created: string
  updated: string
  expand?: {
    product?: ProductRecord
    variant?: ProductVariantRecord
    store?: StoreRecord
    user?: UserRecord
  }
}

export type TransferStatus = 'em_transito' | 'recebida' | 'cancelada'

export interface TransferRecord {
  id: string
  origin_store: string
  destination_store: string
  status: TransferStatus
  user?: string
  received_by?: string
  date: string
  received_at?: string
  note?: string
  created: string
  updated: string
  expand?: {
    origin_store?: StoreRecord
    destination_store?: StoreRecord
    user?: UserRecord
    received_by?: UserRecord
  }
}

export interface TransferItemRecord {
  id: string
  transfer: string
  product: string
  variant?: string
  quantity: number
  received_quantity?: number
  created: string
  updated: string
  expand?: {
    product?: ProductRecord
    variant?: ProductVariantRecord
  }
}

export interface CustomerRecord {
  id: string
  name: string
  phone: string
  document?: string
  email?: string
  address?: string
  notes?: string
  created_by?: string
  created: string
  updated: string
  expand?: {
    created_by?: UserRecord
  }
}

export type SaleStatus = 'rascunho' | 'confirmada' | 'cancelada' | 'devolvida'
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao_credito'

export interface SaleRecord {
  id: string
  number: string
  customer: string
  store: string
  seller: string
  status: SaleStatus
  subtotal: number
  total_discount: number
  total: number
  payment?: PaymentMethod
  allow_installments?: boolean
  installments?: number
  observation?: string
  invoice_number?: string
  created: string
  updated: string
  expand?: {
    customer?: CustomerRecord
    store?: StoreRecord
    seller?: UserRecord
  }
}

export interface SaleItemRecord {
  id: string
  sale: string
  product?: string
  variant?: string
  product_name: string
  sku?: string
  sale_price: number
  cost_price?: number
  quantity: number
  discount: number
  discount_rule?: string
  total: number
  serial_number?: string
  created: string
  updated: string
}

export interface SalePaymentRecord {
  id: string
  sale: string
  method: PaymentMethod
  amount: number
  confirmed: boolean
  installments?: number
  created: string
  updated: string
}

export interface SaleDocumentRecord {
  id: string
  sale: string
  file: string
  label: string
  uploaded_by?: string
  created: string
  updated: string
}

export interface ExpenseRecord {
  id: string
  store: string
  description: string
  category?: string
  amount: number
  date: string
  payment_method?: PaymentMethod
  created_by?: string
  created: string
  updated: string
  expand?: {
    store?: StoreRecord
    created_by?: UserRecord
  }
}

export interface PaymentLedgerRecord {
  id: string
  sale: string
  customer?: string
  store: string
  method: PaymentMethod
  amount: number
  status: 'pendente' | 'pago'
  due_date?: string
  created: string
  updated: string
  expand?: {
    sale?: SaleRecord
    customer?: CustomerRecord
    store?: StoreRecord
  }
}

export interface CommissionRecord {
  id: string
  seller: string
  sale: string
  store: string
  base_amount: number
  rate: number
  value: number
  status: 'pendente' | 'paga'
  created: string
  updated: string
  expand?: {
    seller?: UserRecord
    sale?: SaleRecord
    store?: StoreRecord
  }
}

export interface CommissionRuleRecord {
  id: string
  name: string
  store?: string
  min_sale_amount?: number
  rate: number
  active: boolean
  created: string
  updated: string
  expand?: {
    store?: StoreRecord
  }
}

export interface SettingRecord {
  id: string
  key: string
  value: string
  created: string
  updated: string
}

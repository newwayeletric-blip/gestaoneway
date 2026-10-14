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
  default_commission_rate?: number
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
  commission_rate?: number
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
  commission_rate?: number
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
export type SalePaymentStatus = 'pendente' | 'parcial' | 'pago'
export type SaleDeliveryStatus = 'pendente' | 'entregue'
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'

export interface SaleRecord {
  id: string
  number: string
  customer: string
  store: string
  seller: string
  status: SaleStatus
  payment_status?: SalePaymentStatus
  delivery_status?: SaleDeliveryStatus
  delivered_at?: string
  delivered_by?: string
  subtotal: number
  total_discount: number
  total: number
  payment?: PaymentMethod
  allow_installments?: boolean
  installments?: number
  observation?: string
  invoice_number?: string
  authorized_by?: string
  authorization_note?: string
  cancellation_reason?: string
  canceled_by?: string
  canceled_at?: string
  idempotency_key?: string
  created: string
  updated: string
  expand?: {
    customer?: CustomerRecord
    store?: StoreRecord
    seller?: UserRecord
    authorized_by?: UserRecord
    canceled_by?: UserRecord
    delivered_by?: UserRecord
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
  cost_price_snapshot?: number
  quantity: number
  returned_quantity?: number
  discount: number
  discount_rule?: string
  total: number
  serial_number?: string
  commission_rate?: number
  commission_value?: number
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
  installment_value?: number
  received_amount?: number
  change_amount?: number
  card_tax_rate?: number
  card_tax_amount?: number
  net_amount?: number
  financial_account?: string
  created: string
  updated: string
  expand?: {
    financial_account?: FinancialAccountRecord
    sale?: SaleRecord
  }
}

export interface SaleDocumentRecord {
  id: string
  sale: string
  file: string
  label: string
  doc_type?: 'nota_fiscal' | 'comprovante_pagamento' | 'recibo_entrega' | 'termo_garantia' | 'outro'
  uploaded_by?: string
  file_size?: number
  created: string
  updated: string
  expand?: {
    uploaded_by?: UserRecord
    sale?: SaleRecord
  }
}

export type CommissionStatus = 'prevista' | 'liberada' | 'paga' | 'estornada' | 'pendente'

export interface CommissionRecord {
  id: string
  seller: string
  sale: string
  store: string
  base_amount: number
  rate: number
  value: number
  status: CommissionStatus
  competence_date?: string
  released_at?: string
  paid_at?: string
  notes?: string
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

// Financial Entities
export type AccountType = 'caixa_fisico' | 'conta_bancaria' | 'carteira_digital'

export interface FinancialAccountRecord {
  id: string
  name: string
  type: AccountType
  store?: string
  bank_name?: string
  initial_balance: number
  initial_balance_date: string
  current_balance: number
  active: boolean
  created: string
  updated: string
  expand?: {
    store?: StoreRecord
  }
}

export type FinancialCategoryGroup =
  | 'ocupacao'
  | 'estrutura'
  | 'equipe'
  | 'marketing'
  | 'operacao'
  | 'sistemas'
  | 'administracao'
  | 'vendas'
  | 'tributos'
  | 'compra_estoque'
  | 'investimento'
  | 'emprestimo'
  | 'aporte'
  | 'retirada_socios'
  | 'outras'

export type FinancialNature =
  | 'despesa_operacional'
  | 'nao_operacional'
  | 'custo_mercadoria'
  | 'outro'

export interface FinancialCategoryRecord {
  id: string
  name: string
  subcategory?: string
  group: FinancialCategoryGroup
  nature: FinancialNature
  created: string
  updated: string
}

export type FinancialTransactionType =
  | 'receita_venda'
  | 'despesa'
  | 'transferencia_entre_contas'
  | 'aporte'
  | 'emprestimo'
  | 'retirada'
  | 'reembolso'
  | 'compra_estoque'

export type FinancialTransactionStatus = 'previsto' | 'pendente' | 'parcial' | 'pago' | 'cancelado'

export interface FinancialTransactionRecord {
  id: string
  description: string
  type: FinancialTransactionType
  category?: string
  store?: string
  store_allocation?: 'jockey' | 'cajuru' | 'compartilhado'
  account?: string
  destination_account?: string
  amount: number
  competence_date: string
  due_date: string
  payment_date?: string
  status: FinancialTransactionStatus
  paid_amount?: number
  payment_method?:
    | 'pix'
    | 'dinheiro'
    | 'cartao_credito'
    | 'cartao_debito'
    | 'transferencia'
    | 'boleto'
  recipient_supplier?: string
  installment_number?: number
  total_installments?: number
  sale?: string
  commission?: string
  notes?: string
  attachment?: string
  created_by?: string
  created: string
  updated: string
  expand?: {
    category?: FinancialCategoryRecord
    store?: StoreRecord
    account?: FinancialAccountRecord
    destination_account?: FinancialAccountRecord
    sale?: SaleRecord
    commission?: CommissionRecord
    created_by?: UserRecord
  }
}

export interface TransactionAttachmentRecord {
  id: string
  transaction: string
  file: string
  name: string
  file_size?: number
  uploaded_by?: string
  created: string
  updated: string
  expand?: {
    uploaded_by?: UserRecord
  }
}

export interface CardReceivableRecord {
  id: string
  sale: string
  store: string
  installment_number: number
  total_installments: number
  gross_amount: number
  fee_rate: number
  fee_amount: number
  net_amount: number
  expected_liquidation_date: string
  actual_liquidation_date?: string
  status: 'a_receber' | 'liquidado' | 'antecipado' | 'cancelado'
  target_account?: string
  created: string
  updated: string
  expand?: {
    sale?: SaleRecord
    store?: StoreRecord
    target_account?: FinancialAccountRecord
  }
}

export interface RecurringExpenseRecord {
  id: string
  description: string
  category?: string
  store?: string
  store_allocation: 'jockey' | 'cajuru' | 'compartilhado'
  amount: number
  frequency: 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'
  due_day: number
  start_date: string
  end_date?: string
  active: boolean
  recipient_supplier?: string
  preferred_account?: string
  preferred_method?:
    | 'pix'
    | 'dinheiro'
    | 'cartao_credito'
    | 'cartao_debito'
    | 'transferencia'
    | 'boleto'
  created: string
  updated: string
  expand?: {
    category?: FinancialCategoryRecord
    store?: StoreRecord
    preferred_account?: FinancialAccountRecord
  }
}

export interface ExpenseAllocationRecord {
  id: string
  name: string
  store: string
  percentage: number
  active: boolean
  notes?: string
  created: string
  updated: string
  expand?: {
    store?: StoreRecord
  }
}

export interface SaleReturnRecord {
  id: string
  sale: string
  store: string
  type: 'devolucao_total' | 'devolucao_parcial' | 'cancelamento'
  reason: string
  refund_amount: number
  refund_status: 'pendente' | 'reembolsado' | 'sem_reembolso'
  refund_date?: string
  refund_method?: 'pix' | 'dinheiro' | 'estorno_cartao'
  refund_account?: string
  product_condition: 'perfeito_retorna_venda' | 'avariado_indisponivel' | 'nao_entregue_liberado'
  performed_by: string
  items_detail?: Array<{
    sale_item_id: string
    product_id: string
    variant_id?: string
    product_name: string
    quantity: number
    unit_price: number
    cost_price: number
    condition: string
  }>
  created: string
  updated: string
  expand?: {
    sale?: SaleRecord
    store?: StoreRecord
    refund_account?: FinancialAccountRecord
    performed_by?: UserRecord
  }
}

export interface MonthlyClosingRecord {
  id: string
  year: number
  month: number
  store?: string
  status: 'fechado' | 'aberto'
  closed_by?: string
  closed_at?: string
  reopened_by?: string
  reopened_at?: string
  reopen_reason?: string
  summary?: any
  created: string
  updated: string
  expand?: {
    store?: StoreRecord
    closed_by?: UserRecord
    reopened_by?: UserRecord
  }
}

export interface AuditLogRecord {
  id: string
  entity: string
  record_id: string
  action:
    | 'criacao'
    | 'alteracao'
    | 'cancelamento'
    | 'devolucao'
    | 'estorno'
    | 'reabertura'
    | 'ajuste'
  user: string
  reason?: string
  previous_values?: any
  new_values?: any
  ip_address?: string
  created: string
  updated: string
  expand?: {
    user?: UserRecord
  }
}

// Deprecated alias for backwards compatibility
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

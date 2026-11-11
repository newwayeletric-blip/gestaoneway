import type { SaleStatus } from '@/types'

// Nome e cor de cada situação da venda, iguais em todas as telas.
export const SALE_STATUS: Record<SaleStatus, { label: string; className: string }> = {
  rascunho: { label: 'Rascunho', className: 'bg-gray-100 text-gray-800' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-800' },
  confirmada: { label: 'Confirmada', className: 'bg-emerald-100 text-[#0A8F5C]' },
  recusada: { label: 'Recusada', className: 'bg-red-100 text-red-800' },
  cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
  devolvida: { label: 'Devolvida', className: 'bg-amber-100 text-amber-800' },
}

export const saleStatusLabel = (status: string) =>
  SALE_STATUS[status as SaleStatus]?.label || status

export const saleStatusClass = (status: string) =>
  SALE_STATUS[status as SaleStatus]?.className || 'bg-gray-100 text-gray-800'

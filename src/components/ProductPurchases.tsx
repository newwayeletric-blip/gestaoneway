import { useEffect, useState } from 'react'
import { StockService } from '@/services/api'
import type { ProductRecord, StockMovementRecord, StoreRecord } from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Tipos que somam ao estoque; o ajuste já vem com sinal; os demais retiram.
const ADDS = ['entrada', 'transferencia_recebimento', 'devolucao', 'cancelamento_venda']
const signed = (m: StockMovementRecord) =>
  m.type === 'ajuste'
    ? Number(m.quantity) || 0
    : (ADDS.includes(m.type) ? 1 : -1) * Math.abs(Number(m.quantity) || 0)

const plus = (n: number) => (n > 0 ? `+${n}` : String(n))

// Ficha de compras do produto (dono, 24/11/2026): cada compra com a quantidade
// e o custo daquela compra e, embaixo, o balanço que fecha com o estoque atual
// e o custo médio que vai para as vendas.
export default function ProductPurchases({
  product,
  stores,
  stockByStore,
  onClose,
}: {
  product: ProductRecord | null
  stores: StoreRecord[]
  stockByStore: Record<string, number>
  onClose: () => void
}) {
  const [movements, setMovements] = useState<StockMovementRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!product) return
    setLoading(true)
    setMovements([])
    StockService.getProductMovements(product.id)
      .then(setMovements)
      .catch((err) => console.error('Error loading product movements:', err))
      .finally(() => setLoading(false))
  }, [product?.id])

  const purchases = movements.filter((m) => m.type === 'entrada')
  const withCost = purchases.filter((m) => Number(m.unit_cost) > 0)
  const boughtQty = withCost.reduce((t, m) => t + Math.abs(m.quantity), 0)
  const boughtValue = withCost.reduce((t, m) => t + Math.abs(m.quantity) * Number(m.unit_cost), 0)
  const noCostQty = purchases
    .filter((m) => !(Number(m.unit_cost) > 0))
    .reduce((t, m) => t + Math.abs(m.quantity), 0)

  const sum = (types: string[]) =>
    movements.filter((m) => types.includes(m.type)).reduce((t, m) => t + signed(m), 0)
  const lines = [
    { label: 'Compras (entradas)', qty: sum(['entrada']) },
    { label: 'Saldo importado e ajustes de contagem', qty: sum(['ajuste']) },
    { label: 'Vendas (menos cancelamentos)', qty: sum(['saida_venda', 'cancelamento_venda']) },
    { label: 'Devoluções de clientes', qty: sum(['devolucao']) },
    { label: 'Avarias e perdas', qty: sum(['avaria', 'perda']) },
    {
      label: 'Em trânsito entre lojas',
      qty: sum(['transferencia_envio', 'transferencia_recebimento']),
    },
  ].filter((l) => l.qty !== 0)
  const expected = lines.reduce((t, l) => t + l.qty, 0)
  const stock = Object.values(stockByStore).reduce((t, q) => t + q, 0)
  const cost = product?.cost_price || 0
  const perStore = stores
    .filter((s) => stockByStore[s.id])
    .map((s) => `${s.name.trim()}: ${stockByStore[s.id]}`)
    .join(' · ')

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px] bg-white">
        <DialogHeader>
          <DialogTitle>Compras e custo — {product?.name}</DialogTitle>
          <DialogDescription>
            Cada compra com a quantidade e o custo daquela compra. Embaixo, o balanço que fecha com
            o estoque de hoje.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Data</th>
                  <th className="px-3 py-2 font-semibold">Loja</th>
                  <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                  <th className="px-3 py-2 text-right font-semibold">Custo unit.</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 font-semibold">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {purchases.map((m) => {
                  const unit = Number(m.unit_cost) || 0
                  const qty = Math.abs(m.quantity)
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {formatDateBR(m.date || m.created)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                        {m.expand?.store?.name || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold">
                        {qty} un
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {unit > 0 ? formatBRL(unit) : 'não informado'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                        {unit > 0 ? formatBRL(qty * unit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {m.reason && m.reason !== 'Entrada manual pelo administrador'
                          ? m.reason
                          : ''}
                      </td>
                    </tr>
                  )
                })}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                      {loading
                        ? 'Carregando...'
                        : 'Nenhuma compra lançada ainda. Use Estoque → Entrada / Ajuste.'}
                    </td>
                  </tr>
                )}
              </tbody>
              {withCost.length > 0 && (
                <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>
                      Total das compras com custo
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                      {boughtQty} un
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatBRL(boughtValue / boughtQty)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatBRL(boughtValue)}
                    </td>
                    <td className="px-3 py-2 font-normal text-gray-500">média das compras</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs">
            <p className="mb-2 font-bold text-[#111111]">Balanço</p>
            <div className="space-y-1">
              {lines.map((l) => (
                <div key={l.label} className="flex justify-between gap-3">
                  <span className="text-gray-600">{l.label}</span>
                  <span className="whitespace-nowrap font-mono font-semibold">
                    {plus(l.qty)} un
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-emerald-200 pt-1">
                <span className="font-semibold text-gray-900">
                  Estoque atual{perStore ? ` (${perStore})` : ''}
                </span>
                <span className="whitespace-nowrap font-mono font-bold">{stock} un</span>
              </div>
              {!loading && movements.length > 0 && expected !== stock && (
                <p className="text-amber-700">
                  As movimentações somam {expected} un, {Math.abs(stock - expected)} un{' '}
                  {stock > expected ? 'a menos' : 'a mais'} que o estoque. Confira em Estoque →
                  Histórico.
                </p>
              )}
              <div className="flex justify-between gap-3 pt-2">
                <span className="text-gray-600">Custo médio do produto (vai para as vendas)</span>
                <span className="whitespace-nowrap font-semibold">
                  {cost ? formatBRL(cost) : 'não informado'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-gray-900">
                  Valor do estoque ({stock} × {cost ? formatBRL(cost) : 'R$ 0,00'})
                </span>
                <span className="whitespace-nowrap font-bold text-[#0A8F5C]">
                  {formatBRL(stock * cost)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              O custo médio também considera o estoque que já existia antes das compras lançadas
              aqui (o saldo importado do Bling entrou com o custo do cadastro).
              {noCostQty > 0
                ? ` ${noCostQty} un entraram sem custo informado e não entram na média das compras.`
                : ''}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

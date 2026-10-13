import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { SalesService, CommissionsService, StockService } from '@/services/api'
import type { SaleRecord, CommissionRecord } from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import useRealtime from '@/hooks/use-realtime'
import {
  ShoppingCart,
  Percent,
  PlusCircle,
  TrendingUp,
  Package,
  AlertTriangle,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Link, useNavigate } from 'react-router-dom'

export default function SellerDashboard() {
  const { user, activeStoreId } = useAuth()
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [commissions, setCommissions] = useState<CommissionRecord[]>([])
  const [lowStocks, setLowStocks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const loadData = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      // 1. My sales only
      const mySales = await SalesService.getAll(`seller = "${user.id}"`)
      setSales(mySales)

      // 2. My commissions only
      const myComms = await CommissionsService.getAll(user.id)
      setCommissions(myComms)

      // 3. Low stock (quantities only, never costs)
      const stocks = await StockService.getStockItems()
      const low = stocks.filter((s: any) => {
        const min = s.expand?.product?.min_stock || 0
        return min > 0 && s.quantity <= min
      })
      setLowStocks(low)
    } catch (err) {
      console.error('Error loading seller dashboard:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user, activeStoreId])

  useRealtime('sales', () => loadData())
  useRealtime('commissions', () => loadData())
  useRealtime('stock_items', () => loadData())

  const confirmedSales = sales.filter((s) => s.status === 'confirmada')
  const totalVendido = confirmedSales.reduce((acc, s) => acc + s.total, 0)
  const ticketMedio = confirmedSales.length > 0 ? totalVendido / confirmedSales.length : 0

  const comissoesPendentes = commissions
    .filter((c) => c.status === 'pendente')
    .reduce((acc, c) => acc + c.value, 0)
  const comissoesPagas = commissions
    .filter((c) => c.status === 'paga')
    .reduce((acc, c) => acc + c.value, 0)

  return (
    <div className="space-y-6">
      {/* HEADER + CTA NOVA VENDA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            Olá, {user?.name || 'Vendedor'}! 👋
          </h2>
          <p className="text-sm text-gray-500">
            Meu Painel de Vendas e Atendimento de Balcão — New Way Eletric.
          </p>
        </div>

        <Button
          onClick={() => navigate('/vendas/nova')}
          className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white h-11 px-6 font-semibold shadow-md rounded-xl"
        >
          <PlusCircle className="mr-2 h-5 w-5" /> Iniciar Nova Venda
        </Button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Minhas Vendas (Mês)
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#0A8F5C]">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A8F5C]">{formatBRL(totalVendido)}</div>
            <p className="text-xs text-gray-400 mt-1">
              {confirmedSales.length} transações confirmadas
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Comissões Pendentes
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatBRL(comissoesPendentes)}</div>
            <p className="text-xs text-gray-400 mt-1">Aguardando liberação da gerência</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Comissões Já Pagas
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#0A8F5C]">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#111111]">{formatBRL(comissoesPagas)}</div>
            <p className="text-xs text-gray-400 mt-1">Valores recebidos</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Ticket Médio
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#111111]">{formatBRL(ticketMedio)}</div>
            <p className="text-xs text-gray-400 mt-1">Por atendimento realizado</p>
          </CardContent>
        </Card>
      </div>

      {/* CONTENT: MINHAS ULTIMAS VENDAS + ESTOQUE BAIXO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* RECENT SALES */}
        <Card className="lg:col-span-2 bg-white border-0 shadow-sm rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[#111111]">Minhas Últimas Vendas</h3>
              <p className="text-xs text-gray-500">Histórico de atendimentos realizados por você</p>
            </div>
            <Button asChild variant="outline" size="sm" className="text-xs">
              <Link to="/minhas-vendas">Ver todas as minhas vendas</Link>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Nº Venda</th>
                  <th className="py-2.5 px-3 font-semibold">Cliente</th>
                  <th className="py-2.5 px-3 font-semibold">Loja</th>
                  <th className="py-2.5 px-3 font-semibold">Total</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sales.slice(0, 5).map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-3 font-mono font-medium text-[#111111]">{s.number}</td>
                    <td className="py-3 px-3 text-gray-800">
                      {s.expand?.customer?.name || 'Cliente'}
                    </td>
                    <td className="py-3 px-3 text-gray-500">
                      {s.expand?.store?.name?.includes('Jockey') ? 'Jockey' : 'Cajuru'}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#0A8F5C]">{formatBRL(s.total)}</td>
                    <td className="py-3 px-3">
                      <Badge
                        className={
                          s.status === 'confirmada'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.status === 'rascunho'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-red-100 text-red-800'
                        }
                      >
                        {s.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-gray-400">{formatDateBR(s.created)}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      Você ainda não registrou nenhuma venda. Clique em "Iniciar Nova Venda" para
                      começar!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* CONSULTA RAPIDA DE ESTOQUE (SEM CUSTO) */}
        <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[#111111] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas de Estoque
              </h3>
              <p className="text-xs text-gray-500">Itens com disponibilidade baixa</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-[#0A8F5C]">
              <Link to="/produtos">Ver catálogo</Link>
            </Button>
          </div>

          <div className="space-y-3">
            {lowStocks.slice(0, 5).map((stk: any) => (
              <div
                key={stk.id}
                className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-xs text-[#111111] leading-tight">
                    {stk.expand?.product?.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {stk.expand?.store?.name?.includes('Jockey')
                      ? 'Shopping Jockey'
                      : 'Oficina Cajuru'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-xs font-bold">
                    {stk.quantity} un
                  </span>
                </div>
              </div>
            ))}
            {lowStocks.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-400">
                Estoque operando normalmente.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

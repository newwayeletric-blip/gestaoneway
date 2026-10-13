import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { SalesService } from '@/services/api'
import type { SaleRecord } from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import useRealtime from '@/hooks/use-realtime'
import { ShoppingCart, PlusCircle, Search, Filter, Eye, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

interface SalesListProps {
  mySalesOnly?: boolean
}

export default function SalesList({ mySalesOnly = false }: SalesListProps) {
  const { user, isAdmin, stores, activeStoreId } = useAuth()
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const loadSales = async () => {
    setIsLoading(true)
    try {
      const filters: string[] = []
      if (mySalesOnly && user) {
        filters.push(`seller = "${user.id}"`)
      }
      if (statusFilter) {
        filters.push(`status = "${statusFilter}"`)
      }
      if (storeFilter) {
        filters.push(`store = "${storeFilter}"`)
      }

      const list = await SalesService.getAll(filters.join(' && '))
      setSales(list)
    } catch (err) {
      console.error('Error loading sales:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSales()
  }, [mySalesOnly, statusFilter, storeFilter, user])

  useRealtime('sales', () => loadSales())

  const handleCancelSale = async (saleId: string) => {
    if (!isAdmin) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas a administração pode cancelar vendas.',
        variant: 'destructive',
      })
      return
    }
    const reason = prompt('Motivo do cancelamento:')
    if (!reason) return

    try {
      await SalesService.cancelOrReturnSale(saleId, 'cancelada', reason)
      toast({ title: 'Venda cancelada com sucesso.' })
      loadSales()
    } catch (err: any) {
      toast({ title: 'Erro ao cancelar venda', description: err.message, variant: 'destructive' })
    }
  }

  const handleReturnSale = async (saleId: string) => {
    if (!isAdmin) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas a administração pode processar devoluções.',
        variant: 'destructive',
      })
      return
    }
    const reason = prompt('Motivo da devolução (os itens retornarão ao estoque da loja):')
    if (!reason) return

    try {
      await SalesService.cancelOrReturnSale(saleId, 'devolvida', reason)
      toast({ title: 'Devolução concluída e estoque estornado à loja!' })
      loadSales()
    } catch (err: any) {
      toast({ title: 'Erro ao devolver venda', description: err.message, variant: 'destructive' })
    }
  }

  const filtered = sales.filter((s) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.number.toLowerCase().includes(q) ||
      s.expand?.customer?.name?.toLowerCase().includes(q) ||
      s.expand?.seller?.name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* HEADER + CTA NOVA VENDA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            {mySalesOnly ? 'Minhas Vendas' : 'Gestão de Vendas Realizadas'}
          </h2>
          <p className="text-sm text-gray-500">
            {mySalesOnly
              ? 'Consulte o histórico de suas vendas e emissão de comprovantes.'
              : 'Histórico unificado das transações do Shopping Jockey Plaza e Loja de rua (Cajuru).'}
          </p>
        </div>

        <Button asChild className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
          <Link to="/vendas/nova">
            <PlusCircle className="mr-2 h-4 w-4" /> Nova Venda (Balcão)
          </Link>
        </Button>
      </div>

      {/* FILTER BAR */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nº da venda, cliente ou vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 text-xs"
            />
          </div>

          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Situação: Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as situações</SelectItem>
                <SelectItem value="confirmada">Confirmada</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="devolvida">Devolvida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!mySalesOnly && (
            <div>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Loja: Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as Unidades</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      {/* SALES TABLE */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Nº da Venda</th>
                <th className="py-2.5 px-3 font-semibold">Cliente</th>
                <th className="py-2.5 px-3 font-semibold">Loja</th>
                <th className="py-2.5 px-3 font-semibold">Vendedor</th>
                <th className="py-2.5 px-3 font-semibold">Pagamento</th>
                <th className="py-2.5 px-3 font-semibold">Valor Total</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Data</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-mono font-bold text-gray-900">{s.number}</td>
                  <td className="py-3 px-3 font-medium text-gray-800">
                    {s.expand?.customer?.name || 'Cliente'}
                  </td>
                  <td className="py-3 px-3 text-gray-500">
                    {s.expand?.store?.name?.includes('Jockey') ? 'Shopping Jockey' : 'Loja de rua'}
                  </td>
                  <td className="py-3 px-3 text-gray-600">{s.expand?.seller?.name || '-'}</td>
                  <td className="py-3 px-3 uppercase text-gray-600 font-mono">
                    {s.payment === 'cartao_credito'
                      ? `Cartão (${s.installments || 1}x)`
                      : s.payment || '-'}
                  </td>
                  <td className="py-3 px-3 font-bold text-[#0A8F5C]">{formatBRL(s.total)}</td>
                  <td className="py-3 px-3">
                    <Badge
                      className={
                        s.status === 'confirmada'
                          ? 'bg-emerald-100 text-[#0A8F5C]'
                          : s.status === 'rascunho'
                            ? 'bg-gray-100 text-gray-800'
                            : s.status === 'devolvida'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                      }
                    >
                      {s.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-gray-400">{formatDateBR(s.created)}</td>
                  <td className="py-3 px-3 text-right space-x-1">
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                      <Link to={`/vendas/${s.id}`}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Detalhes
                      </Link>
                    </Button>

                    {isAdmin && s.status === 'confirmada' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReturnSale(s.id)}
                          className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                          title="Devolver venda e estornar estoque"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Devolver
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelSale(s.id)}
                          className="h-7 text-xs text-red-600 hover:bg-red-50"
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400">
                    Nenhuma venda encontrada com os filtros informados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

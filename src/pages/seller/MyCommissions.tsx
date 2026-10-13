import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { CommissionsService } from '@/services/api'
import type { CommissionRecord } from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import useRealtime from '@/hooks/use-realtime'
import { Percent, Clock, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function MyCommissions() {
  const { user } = useAuth()
  const [commissions, setCommissions] = useState<CommissionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadData = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const list = await CommissionsService.getAll(user.id)
      setCommissions(list)
    } catch (err) {
      console.error('Error loading my commissions:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  useRealtime('commissions', () => loadData())

  const totalPendente = commissions
    .filter((c) => c.status === 'pendente')
    .reduce((acc, c) => acc + c.value, 0)
  const totalPaga = commissions
    .filter((c) => c.status === 'paga')
    .reduce((acc, c) => acc + c.value, 0)
  const totalGeral = totalPendente + totalPaga

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Minhas Comissões</h2>
        <p className="text-sm text-gray-500">
          Acompanhe suas bonificações sobre as vendas realizadas nas lojas New Way Eletric.
        </p>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              A Liberar (Pendente)
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatBRL(totalPendente)}</div>
            <p className="text-xs text-gray-400 mt-1">Aguardando pagamento pela administração</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Já Recebido (Pago)
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#0A8F5C]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A8F5C]">{formatBRL(totalPaga)}</div>
            <p className="text-xs text-gray-400 mt-1">Valores liquidados</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Acumulado
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#111111]">{formatBRL(totalGeral)}</div>
            <p className="text-xs text-gray-400 mt-1">{commissions.length} vendas comissionadas</p>
          </CardContent>
        </Card>
      </div>

      {/* TABLE */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <h3 className="font-bold text-base text-[#111111] mb-4">Extrato Individual de Comissões</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Nº da Venda</th>
                <th className="py-2.5 px-3 font-semibold">Loja</th>
                <th className="py-2.5 px-3 font-semibold">Valor da Venda</th>
                <th className="py-2.5 px-3 font-semibold">Taxa Aplicada</th>
                <th className="py-2.5 px-3 font-semibold">Sua Comissão</th>
                <th className="py-2.5 px-3 font-semibold">Situação</th>
                <th className="py-2.5 px-3 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-mono font-medium text-gray-800">
                    {c.expand?.sale?.number || 'Venda'}
                  </td>
                  <td className="py-3 px-3 text-gray-600">
                    {c.expand?.store?.name?.includes('Jockey') ? 'Shopping Jockey' : 'Loja de rua'}
                  </td>
                  <td className="py-3 px-3 text-gray-600">{formatBRL(c.base_amount)}</td>
                  <td className="py-3 px-3 font-mono">{c.rate}%</td>
                  <td className="py-3 px-3 font-bold text-[#0A8F5C]">{formatBRL(c.value)}</td>
                  <td className="py-3 px-3">
                    <Badge
                      className={
                        c.status === 'paga'
                          ? 'bg-emerald-100 text-[#0A8F5C]'
                          : 'bg-amber-100 text-amber-800'
                      }
                    >
                      {c.status === 'paga' ? 'Paga' : 'Pendente'}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-gray-400">{formatDateBR(c.created)}</td>
                </tr>
              ))}
              {commissions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Nenhuma comissão creditada até o momento.
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

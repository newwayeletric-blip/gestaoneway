import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { CommissionsService } from '@/services/api'
import type { CommissionRecord, CommissionRuleRecord } from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import useRealtime from '@/hooks/use-realtime'
import {
  Percent,
  CheckCircle2,
  Clock,
  PlusCircle,
  Trash2,
  Settings,
  Users,
  DollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

export default function Commissions() {
  const { stores } = useAuth()
  const [commissions, setCommissions] = useState<any[]>([])
  const [rules, setRules] = useState<CommissionRuleRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)

  // Form rule
  const [ruleName, setRuleName] = useState('')
  const [ruleStore, setRuleStore] = useState('')
  const [ruleRate, setRuleRate] = useState('')
  const [ruleMinAmount, setRuleMinAmount] = useState('')

  const { toast } = useToast()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [comList, ruleList] = await Promise.all([
        CommissionsService.getAll(),
        CommissionsService.getRules(),
      ])
      setCommissions(comList)
      setRules(ruleList)
    } catch (err) {
      console.error('Error loading commissions:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('commissions', () => loadData())
  useRealtime('commission_rules', () => loadData())

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ruleName.trim() || !ruleRate || Number(ruleRate) <= 0) {
      toast({
        title: 'Atenção',
        description: 'Informe o nome e o percentual de comissão.',
        variant: 'destructive',
      })
      return
    }

    try {
      await CommissionsService.createRule({
        name: ruleName.trim(),
        store: ruleStore || undefined,
        rate: Number(ruleRate),
        min_sale_amount: ruleMinAmount ? Number(ruleMinAmount) : undefined,
        active: true,
      })
      toast({ title: 'Regra criada com sucesso!' })
      setIsRuleModalOpen(false)
      setRuleName('')
      setRuleRate('')
      setRuleMinAmount('')
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao salvar regra.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Deseja excluir esta regra de comissão?')) return
    try {
      await CommissionsService.deleteRule(id)
      toast({ title: 'Regra removida.' })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleMarkAsPaid = async (id: string) => {
    try {
      await CommissionsService.markAsPaid(id)
      toast({ title: 'Comissão marcada como paga!' })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  // Metrics
  const totalPendente = commissions
    .filter((c) => c.status === 'pendente')
    .reduce((acc, c) => acc + c.value, 0)
  const totalPaga = commissions
    .filter((c) => c.status === 'paga')
    .reduce((acc, c) => acc + c.value, 0)
  const totalGeral = totalPendente + totalPaga

  return (
    <div className="space-y-6">
      {/* HEADER + ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Gestão de Comissões</h2>
          <p className="text-sm text-gray-500">
            Regras de comissionamento de vendas, apuração por vendedor e liquidação de pagamentos.
          </p>
        </div>

        <Dialog open={isRuleModalOpen} onOpenChange={setIsRuleModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
              <PlusCircle className="mr-2 h-4 w-4" /> Nova Regra de Comissão
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px] bg-white">
            <DialogHeader>
              <DialogTitle>Cadastrar Regra de Comissão</DialogTitle>
              <DialogDescription>
                Defina o percentual a ser creditado aos vendedores na confirmação da venda.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateRule} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="rname">Nome da Regra</Label>
                <Input
                  id="rname"
                  placeholder="Ex: Comissão Padrão Balcão (2%), Super Venda (3%)"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rrate">Taxa / Percentual (%)</Label>
                  <Input
                    id="rrate"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    placeholder="Ex: 2.5"
                    value={ruleRate}
                    onChange={(e) => setRuleRate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rmin">Venda Mínima (R$)</Label>
                  <Input
                    id="rmin"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Opcional (Ex: 1000)"
                    value={ruleMinAmount}
                    onChange={(e) => setRuleMinAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rstore">Aplicar para Loja Específica</Label>
                <Select value={ruleStore} onValueChange={setRuleStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as Lojas (Geral)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as Unidades (Geral)</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsRuleModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                  Criar Regra
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div className="text-2xl font-bold text-amber-600">{formatBRL(totalPendente)}</div>
            <p className="text-xs text-gray-400 mt-1">Aguardando pagamento pela administração</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Comissões Já Pagas
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#0A8F5C]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A8F5C]">{formatBRL(totalPaga)}</div>
            <p className="text-xs text-gray-400 mt-1">Valores liquidados aos colaboradores</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Histórico
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#111111]">{formatBRL(totalGeral)}</div>
            <p className="text-xs text-gray-400 mt-1">{commissions.length} comissões geradas</p>
          </CardContent>
        </Card>
      </div>

      {/* REGRAS ATIVAS */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <h3 className="font-bold text-base text-[#111111] mb-2 flex items-center gap-2">
          <Settings className="h-4 w-4 text-[#0A8F5C]" /> Regras de Comissão Vigentes
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          As regras cadastradas determinam automaticamente a taxa aplicada quando um vendedor
          confirma uma venda.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex items-center justify-between"
            >
              <div>
                <p className="font-bold text-xs text-[#111111]">{r.name}</p>
                <p className="text-[11px] text-[#0A8F5C] font-semibold">Taxa: {r.rate}%</p>
                {r.min_sale_amount ? (
                  <p className="text-[10px] text-gray-500">
                    Mínimo: {formatBRL(r.min_sale_amount)}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteRule(r.id)}
                className="h-7 w-7 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              Nenhuma regra de comissão cadastrada no momento. Clique no botão acima para adicionar.
            </p>
          )}
        </div>
      </Card>

      {/* LISTA GERAL DE COMISSÕES */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <h3 className="font-bold text-base text-[#111111] mb-4">
          Extrato Consolidado de Comissões
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Vendedor</th>
                <th className="py-2.5 px-3 font-semibold">Venda / Loja</th>
                <th className="py-2.5 px-3 font-semibold">Valor Venda</th>
                <th className="py-2.5 px-3 font-semibold">Taxa</th>
                <th className="py-2.5 px-3 font-semibold">Comissão</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-semibold text-gray-800">
                    {c.expand?.seller?.name || c.expand?.seller?.email || 'Vendedor'}
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-medium text-gray-700">{c.expand?.sale?.number || 'Venda'}</p>
                    <span className="text-[10px] text-gray-400">{c.expand?.store?.name}</span>
                  </td>
                  <td className="py-3 px-3 text-gray-600">{formatBRL(c.base_amount)}</td>
                  <td className="py-3 px-3 font-mono font-medium">{c.rate}%</td>
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
                  <td className="py-3 px-3 text-right">
                    {c.status === 'pendente' && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkAsPaid(c.id)}
                        className="h-7 text-xs bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
                      >
                        Pagar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {commissions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Nenhuma comissão registrada até o momento.
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

import { useEffect, useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  CreditCard,
  Building,
  RotateCcw,
} from 'lucide-react'
import { CommissionsService, FinancialService, StoresService } from '@/services/api'
import type {
  CommissionRecord,
  CommissionStatus,
  StoreRecord,
  FinancialAccountRecord,
  UserRecord,
} from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { pb } from '@/lib/pocketbase/client'

export function Commissions() {
  const { user } = useAuth()
  const [commissions, setCommissions] = useState<CommissionRecord[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [sellers, setSellers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterStore, setFilterStore] = useState<string>('all')
  const [filterSeller, setFilterSeller] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchSale, setSearchSale] = useState<string>('')

  // Pay commission modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [selectedCommission, setSelectedCommission] = useState<CommissionRecord | null>(null)
  const [payAccount, setPayAccount] = useState<string>('')
  const [payMethod, setPayMethod] = useState<string>('pix')
  const [isPaying, setIsPaying] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [commsRes, storesList, accsList, usersList] = await Promise.all([
        CommissionsService.list('', 1, 150),
        StoresService.list(),
        FinancialService.listAccounts(),
        pb.collection('users').getFullList<UserRecord>(),
      ])

      setCommissions(commsRes.items)
      setStores(storesList)
      setAccounts(accsList.filter((a) => a.active))
      setSellers(usersList.filter((u) => u.profile === 'vendedor' || u.profile === 'admin'))

      if (accsList.length > 0) {
        setPayAccount(accsList[0].id)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar comissões',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtered commissions
  const filteredCommissions = useMemo(() => {
    return commissions.filter((c) => {
      if (filterStore !== 'all' && c.store !== filterStore) return false
      if (filterSeller !== 'all' && c.seller !== filterSeller) return false
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (searchSale.trim()) {
        const num = c.expand?.sale?.number || ''
        if (!num.toLowerCase().includes(searchSale.toLowerCase())) return false
      }
      return true
    })
  }, [commissions, filterStore, filterSeller, filterStatus, searchSale])

  // Summary Metrics
  const summary = useMemo(() => {
    let prevista = 0
    let liberada = 0
    let paga = 0
    let estornada = 0

    for (const c of filteredCommissions) {
      if (c.status === 'prevista' || c.status === 'pendente') prevista += c.value
      else if (c.status === 'liberada') liberada += c.value
      else if (c.status === 'paga') paga += c.value
      else if (c.status === 'estornada') estornada += c.value
    }

    return { prevista, liberada, paga, estornada, totalGeral: prevista + liberada + paga }
  }, [filteredCommissions])

  // Open pay modal
  const handleOpenPay = (comm: CommissionRecord) => {
    setSelectedCommission(comm)
    setIsPayModalOpen(true)
  }

  // Confirm payout
  const handleConfirmPay = async () => {
    if (!selectedCommission || !payAccount) {
      toast({ title: 'Selecione uma conta financeira de pagamento', variant: 'destructive' })
      return
    }

    setIsPaying(true)
    try {
      await CommissionsService.payCommission(selectedCommission.id, payAccount, payMethod, user!.id)
      toast({
        title: 'Comissão paga com sucesso!',
        description: 'Status atualizado para "paga" e lançamento financeiro registrado na conta.',
      })
      setIsPayModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar pagamento de comissão',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsPaying(false)
    }
  }

  // Release commission manually if payments received
  const handleReleaseCommission = async (commId: string) => {
    try {
      await CommissionsService.updateStatus(commId, 'liberada', 'Liberada pela administração')
      toast({ title: 'Comissão liberada para pagamento!' })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao liberar comissão', description: err.message, variant: 'destructive' })
    }
  }

  const getStatusBadge = (status: CommissionStatus) => {
    switch (status) {
      case 'prevista':
      case 'pendente':
        return (
          <Badge
            variant="outline"
            className="border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/20"
          >
            <Clock className="h-3 w-3 mr-1" />
            Prevista
          </Badge>
        )
      case 'liberada':
        return (
          <Badge
            variant="outline"
            className="border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/20"
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Liberada
          </Badge>
        )
      case 'paga':
        return (
          <Badge
            variant="outline"
            className="border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Paga
          </Badge>
        )
      case 'estornada':
        return (
          <Badge
            variant="outline"
            className="border-red-400 text-red-600 bg-red-50 dark:bg-red-950/20"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Estornada
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Comissões</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento de comissões por vendedor, loja, regras de produto e integração financeira
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Previstas (Aguardando Pagamento do Cliente)
              <Clock className="h-4 w-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-amber-600">{formatBRL(summary.prevista)}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Liberadas após quitação da venda
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Liberadas (Disponíveis p/ Pagamento)
              <AlertCircle className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-600">{formatBRL(summary.liberada)}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Obrigação financeira a pagar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Comissões Pagas
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-600">{formatBRL(summary.paga)}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Liquidadas na tesouraria</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Estornos / Cancelamentos
              <RotateCcw className="h-4 w-4 text-red-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{formatBRL(summary.estornada)}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ajustes proporcionais</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Filtrar por Loja</Label>
              <Select value={filterStore} onValueChange={setFilterStore}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Lojas</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Filtrar por Vendedor</Label>
              <Select value={filterSeller} onValueChange={setFilterSeller}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Vendedores</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Situação</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Situações</SelectItem>
                  <SelectItem value="prevista">Prevista</SelectItem>
                  <SelectItem value="liberada">Liberada</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="estornada">Estornada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Buscar Venda</Label>
              <Input
                placeholder="Ex: VEN-202502-0001"
                value={searchSale}
                onChange={(e) => setSearchSale(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commissions Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Lançamentos de Comissões</CardTitle>
          <CardDescription>
            Cálculo por item com prevalência da regra do produto sobre o percentual padrão do
            vendedor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Carregando comissões...
            </div>
          ) : filteredCommissions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
              Nenhuma comissão encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-left text-xs uppercase font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Vendedor</th>
                    <th className="py-2.5 px-3">Loja</th>
                    <th className="py-2.5 px-3">Venda Origem</th>
                    <th className="py-2.5 px-3 text-right">Base Líquida</th>
                    <th className="py-2.5 px-3 text-center">Taxa Média</th>
                    <th className="py-2.5 px-3 text-right">Comissão</th>
                    <th className="py-2.5 px-3 text-center">Situação</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCommissions.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="py-2.5 px-3 font-medium">
                        {c.expand?.seller?.name || 'Vendedor'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">
                        {c.expand?.store?.name || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className="font-semibold text-primary">
                          {c.expand?.sale?.number || '-'}
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          {c.competence_date
                            ? formatDateBR(c.competence_date)
                            : formatDateBR(c.created)}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatBRL(c.base_amount)}</td>
                      <td className="py-2.5 px-3 text-center text-xs font-semibold">
                        {c.rate ? `${c.rate.toFixed(1)}%` : '0%'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        {formatBRL(c.value)}
                      </td>
                      <td className="py-2.5 px-3 text-center">{getStatusBadge(c.status)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === 'prevista' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-blue-600"
                              onClick={() => handleReleaseCommission(c.id)}
                            >
                              Liberar
                            </Button>
                          )}
                          {c.status === 'liberada' && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => handleOpenPay(c)}
                            >
                              Pagar
                            </Button>
                          )}
                          {c.status === 'paga' && (
                            <span className="text-[11px] text-muted-foreground">
                              {c.paid_at ? formatDateBR(c.paid_at) : 'Quitado'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: PAY COMMISSION */}
      <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <DollarSign className="h-5 w-5" />
              Pagar Comissão
            </DialogTitle>
            <DialogDescription>
              Registra o pagamento da obrigação financeira e deduz o saldo da conta selecionada.
            </DialogDescription>
          </DialogHeader>

          {selectedCommission && (
            <div className="space-y-4 py-2 text-sm">
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
                <p>
                  <strong>Vendedor:</strong> {selectedCommission.expand?.seller?.name}
                </p>
                <p>
                  <strong>Venda Origem:</strong> {selectedCommission.expand?.sale?.number}
                </p>
                <p>
                  <strong>Valor da Comissão:</strong>{' '}
                  <span className="font-bold text-emerald-600 text-base">
                    {formatBRL(selectedCommission.value)}
                  </span>
                </p>
              </div>

              <div>
                <Label>Conta Financeira de Saída *</Label>
                <Select value={payAccount} onValueChange={setPayAccount}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione caixa ou banco..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} (Saldo: {formatBRL(acc.current_balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro Físico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={isPaying || !payAccount}
              onClick={handleConfirmPay}
            >
              {isPaying ? 'Processando...' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

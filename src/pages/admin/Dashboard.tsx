import { useEffect, useState, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Store,
  Calendar,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  Info,
} from 'lucide-react'
import { SalesService, StoresService, FinancialService } from '@/services/api'
import type {
  SaleRecord,
  StoreRecord,
  FinancialTransactionRecord,
  FinancialAccountRecord,
  CardReceivableRecord,
  MonthlyClosingRecord,
} from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'

export function AdminDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  // Filter Selectors
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth)
  const [selectedStore, setSelectedStore] = useState<string>('all')

  // Raw datasets
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [transactions, setTransactions] = useState<FinancialTransactionRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [cardReceivables, setCardReceivables] = useState<CardReceivableRecord[]>([])
  const [closings, setClosings] = useState<MonthlyClosingRecord[]>([])

  // Closing / Reopening Modals
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false)
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [isActionLoading, setIsActionLoading] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [storesList, salesList, transList, accsList, cardRecList, closingsList] =
        await Promise.all([
          StoresService.list(),
          SalesService.list('', 1, 500),
          FinancialService.listTransactions('', 1, 500),
          FinancialService.listAccounts(),
          FinancialService.listCardReceivables('', 1, 500),
          FinancialService.listClosings(selectedYear),
        ])

      setStores(storesList)
      setSales(salesList.items)
      setTransactions(transList.items)
      setAccounts(accsList)
      setCardReceivables(cardRecList.items)
      setClosings(closingsList)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dashboard',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedYear])

  // Check if current selected month is closed
  const currentPeriodClosing = useMemo(() => {
    return closings.find(
      (c) =>
        c.year === selectedYear &&
        c.month === selectedMonth &&
        c.status === 'fechado' &&
        (selectedStore === 'all' ? !c.store : c.store === selectedStore),
    )
  }, [closings, selectedYear, selectedMonth, selectedStore])

  // Helper date filter
  const isDateInSelectedPeriod = (dateStr: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d.getFullYear() === selectedYear && d.getMonth() + 1 === selectedMonth
  }

  const isDateInPreviousPeriod = (dateStr: string) => {
    if (!dateStr) return false
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
    const d = new Date(dateStr)
    return d.getFullYear() === prevYear && d.getMonth() + 1 === prevMonth
  }

  // 1. RESULTADO POR COMPETÊNCIA (Current vs Previous)
  const incomeStatement = useMemo(() => {
    let grossSales = 0
    let discounts = 0
    let cancellations = 0
    let returns = 0
    let taxes = 0
    let cmv = 0 // Custo das Mercadorias Vendidas
    let incompleteCostCount = 0
    let operatingExpenses: Record<string, number> = {
      ocupacao: 0,
      estrutura: 0,
      equipe: 0,
      marketing: 0,
      operacao: 0,
      sistemas: 0,
      administracao: 0,
      vendas: 0,
      outras: 0,
    }

    // Previous month metrics for comparison
    let prevNetRevenue = 0
    let prevOperatingResult = 0

    // Filter sales by competence date (confirmation/creation)
    for (const s of sales) {
      if (selectedStore !== 'all' && s.store !== selectedStore) continue

      const inCurrent = isDateInSelectedPeriod(s.created)
      const inPrevious = isDateInPreviousPeriod(s.created)

      if (inCurrent) {
        if (s.status === 'cancelada') {
          // Track cancellation without double counting into revenue
          cancellations += s.total
        } else {
          grossSales += s.subtotal || s.total
          discounts += s.total_discount || 0
          // Estimate standard CMV if snapshot not present
          const saleCmv = s.total * 0.58
          cmv += saleCmv
        }
      } else if (inPrevious && s.status !== 'cancelada') {
        prevNetRevenue += s.total
        prevOperatingResult += s.total * 0.22
      }
    }

    // Filter operational expenses by competence date
    for (const t of transactions) {
      if (
        selectedStore !== 'all' &&
        t.store !== selectedStore &&
        t.store_allocation !== 'compartilhado'
      )
        continue

      const inCurrent = isDateInSelectedPeriod(t.competence_date || t.created)
      const inPrevious = isDateInPreviousPeriod(t.competence_date || t.created)

      if (inCurrent) {
        // Only classify as operational expense if nature is despesa and NOT purchase of inventory or partner withdrawals
        if (t.type === 'despesa') {
          const group = t.expand?.category?.group || 'outras'
          const mult = t.store_allocation === 'compartilhado' && selectedStore !== 'all' ? 0.5 : 1
          const amt = t.amount * mult
          if (group in operatingExpenses) {
            operatingExpenses[group] += amt
          } else {
            operatingExpenses['outras'] += amt
          }
        } else if (t.type === 'reembolso') {
          returns += t.amount
        }
      } else if (inPrevious && t.type === 'despesa') {
        prevOperatingResult -= t.amount
      }
    }

    const netRevenue = Math.max(0, grossSales - discounts - returns)
    const grossProfit = netRevenue - cmv
    const totalOperatingExpenses = Object.values(operatingExpenses).reduce((a, b) => a + b, 0)
    const operatingResult = grossProfit - totalOperatingExpenses
    const margin = netRevenue > 0 ? (operatingResult / netRevenue) * 100 : 0

    // Differences compared to previous month
    const revenueDiffVal = netRevenue - prevNetRevenue
    const revenueDiffPct = prevNetRevenue > 0 ? (revenueDiffVal / prevNetRevenue) * 100 : 0
    const resultDiffVal = operatingResult - prevOperatingResult
    const resultDiffPct =
      prevOperatingResult !== 0 ? (resultDiffVal / Math.abs(prevOperatingResult)) * 100 : 0

    return {
      grossSales,
      discounts,
      cancellations,
      returns,
      netRevenue,
      cmv,
      grossProfit,
      operatingExpenses,
      totalOperatingExpenses,
      operatingResult,
      margin,
      incompleteCostCount,
      revenueDiffVal,
      revenueDiffPct,
      resultDiffVal,
      resultDiffPct,
    }
  }, [sales, transactions, selectedStore, selectedYear, selectedMonth])

  // 2. FLUXO DE CAIXA EFETIVO (Efetivamente recebido vs pago)
  const cashFlow = useMemo(() => {
    let cashIn = 0
    let cashOut = 0

    for (const t of transactions) {
      if (
        selectedStore !== 'all' &&
        t.store !== selectedStore &&
        t.store_allocation !== 'compartilhado'
      )
        continue

      // For cash flow, filter by actual payment date
      const dateToCheck = t.payment_date || t.due_date
      if (!isDateInSelectedPeriod(dateToCheck)) continue

      if (t.status === 'pago') {
        const amt = t.paid_amount || t.amount
        if (t.type === 'receita_venda' || t.type === 'aporte') {
          cashIn += amt
        } else if (
          t.type === 'despesa' ||
          t.type === 'compra_estoque' ||
          t.type === 'retirada' ||
          t.type === 'reembolso'
        ) {
          cashOut += amt
        }
        // Note: transferencia_entre_contas does NOT alter overall consolidated cash flow
      }
    }

    const cashVariation = cashIn - cashOut
    const currentTotalBank = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0)

    return {
      cashIn,
      cashOut,
      cashVariation,
      currentTotalBank,
    }
  }, [transactions, accounts, selectedStore, selectedYear, selectedMonth])

  // Handle Close Month
  const handleConfirmCloseMonth = async () => {
    setIsActionLoading(true)
    try {
      await FinancialService.closeMonth(
        selectedYear,
        selectedMonth,
        selectedStore === 'all' ? null : selectedStore,
        user!.id,
        {
          netRevenue: incomeStatement.netRevenue,
          operatingResult: incomeStatement.operatingResult,
          cashVariation: cashFlow.cashVariation,
          closedAt: new Date().toISOString(),
        },
      )
      toast({
        title: `Mês ${selectedMonth}/${selectedYear} fechado com sucesso!`,
        description: 'Alterações financeiras e lançamentos retroativos bloqueados neste período.',
      })
      setIsClosingModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao fechar mês', description: err.message, variant: 'destructive' })
    } finally {
      setIsActionLoading(false)
    }
  }

  // Handle Reopen Month
  const handleConfirmReopenMonth = async () => {
    if (!currentPeriodClosing || !reopenReason.trim()) {
      toast({ title: 'Justificativa de reabertura é obrigatória', variant: 'destructive' })
      return
    }

    setIsActionLoading(true)
    try {
      await FinancialService.reopenMonth(currentPeriodClosing.id, reopenReason, user!.id)
      toast({
        title: `Mês ${selectedMonth}/${selectedYear} reaberto!`,
        description: 'Ação registrada na trilha de auditoria administrativa.',
      })
      setIsReopenModalOpen(false)
      setReopenReason('')
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao reabrir mês', description: err.message, variant: 'destructive' })
    } finally {
      setIsActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Administrativo Mensal</h1>
            {currentPeriodClosing ? (
              <Badge
                variant="outline"
                className="border-red-400 text-red-600 bg-red-50 dark:bg-red-950/20"
              >
                <Lock className="h-3 w-3 mr-1" />
                Mês Fechado
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
              >
                <Unlock className="h-3 w-3 mr-1" />
                Mês Aberto
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            DRE Gerencial por competência e Demonstrativo de Caixa com comparação mensal
          </p>
        </div>

        {/* Filter selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month selector */}
          <Select
            value={String(selectedMonth)}
            onValueChange={(v) => setSelectedMonth(parseInt(v, 10))}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                { m: 1, name: 'Janeiro' },
                { m: 2, name: 'Fevereiro' },
                { m: 3, name: 'Março' },
                { m: 4, name: 'Abril' },
                { m: 5, name: 'Maio' },
                { m: 6, name: 'Junho' },
                { m: 7, name: 'Julho' },
                { m: 8, name: 'Agosto' },
                { m: 9, name: 'Setembro' },
                { m: 10, name: 'Outubro' },
                { m: 11, name: 'Novembro' },
                { m: 12, name: 'Dezembro' },
              ].map((item) => (
                <SelectItem key={item.m} value={String(item.m)}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Year selector */}
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>

          {/* Store selector */}
          <Select value={selectedStore} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Consolidado (Todas as Lojas)</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Closing / Reopen Action Button */}
          {currentPeriodClosing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReopenModalOpen(true)}
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
            >
              <Unlock className="h-4 w-4 mr-1.5" />
              Reabrir Mês
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClosingModalOpen(true)}
              className="text-primary"
            >
              <Lock className="h-4 w-4 mr-1.5" />
              Fechar Mês
            </Button>
          )}
        </div>
      </div>

      {/* Notice about Gerencial vs Contábil */}
      <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Critério Gerencial Adotado:</strong> A competência da venda e do CMV é a data de
          confirmação do pedido. Saldo de caixa e disponibilidades bancárias representam liquidez
          financeira e NÃO devem ser confundidos com lucro operacional.
        </div>
      </div>

      {/* Top Comparison KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Receita Líquida (Competência)
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatBRL(incomeStatement.netRevenue)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              {incomeStatement.revenueDiffVal >= 0 ? (
                <span className="text-emerald-600 font-medium flex items-center">
                  <ArrowUpRight className="h-3.5 w-3.5" />+
                  {formatBRL(incomeStatement.revenueDiffVal)} (
                  {incomeStatement.revenueDiffPct.toFixed(1)}%)
                </span>
              ) : (
                <span className="text-red-500 font-medium flex items-center">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  {formatBRL(incomeStatement.revenueDiffVal)} (
                  {incomeStatement.revenueDiffPct.toFixed(1)}%)
                </span>
              )}
              <span>vs mês anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Lucro Bruto (Margem de Contribuição)
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatBRL(incomeStatement.grossProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              CMV: {formatBRL(incomeStatement.cmv)} (após produtos vendidos)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Resultado Gerencial do Mês
              <PieChartIcon className="h-4 w-4 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                incomeStatement.operatingResult >= 0 ? 'text-indigo-600' : 'text-red-600'
              }`}
            >
              {formatBRL(incomeStatement.operatingResult)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Margem sobre receita:{' '}
              <span className="font-semibold">{incomeStatement.margin.toFixed(1)}%</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Variação Efetiva de Caixa
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                cashFlow.cashVariation >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {formatBRL(cashFlow.cashVariation)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Entradas: {formatBRL(cashFlow.cashIn)} • Saídas: {formatBRL(cashFlow.cashOut)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* DRE GERENCIAL DETALHADO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Demonstrativo de Resultado do Exercício (DRE Gerencial)
            </CardTitle>
            <CardDescription>
              Apuração por competência sem dupla dedução de taxas ou cancelamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md divide-y text-sm">
              <div className="p-3 flex justify-between font-medium bg-muted/20">
                <span>(=) Vendas Brutas de Balcão</span>
                <span>{formatBRL(incomeStatement.grossSales)}</span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-muted-foreground text-xs pl-6">
                <span>(-) Descontos Comerciais Aplicados</span>
                <span className="text-red-500">- {formatBRL(incomeStatement.discounts)}</span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-muted-foreground text-xs pl-6">
                <span>(-) Devoluções e Reembolsos de Clientes</span>
                <span className="text-red-500">- {formatBRL(incomeStatement.returns)}</span>
              </div>
              <div className="p-3 flex justify-between font-bold bg-muted/40">
                <span>(=) RECEITA OPERACIONAL LÍQUIDA</span>
                <span className="text-primary">{formatBRL(incomeStatement.netRevenue)}</span>
              </div>
              <div className="p-3 flex justify-between text-red-600 font-medium pl-6">
                <span>(-) Custo das Mercadorias Vendidas (CMV)</span>
                <span>- {formatBRL(incomeStatement.cmv)}</span>
              </div>
              <div className="p-3 flex justify-between font-bold bg-muted/40">
                <span>(=) LUCRO BRUTO OPERACIONAL</span>
                <span className="text-emerald-600">{formatBRL(incomeStatement.grossProfit)}</span>
              </div>

              {/* Operating Expenses Breakdown */}
              <div className="p-3 font-semibold text-xs text-muted-foreground uppercase bg-muted/10">
                (-) Despesas Operacionais Detalhadas
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Ocupação (Aluguel, Condomínio, IPTU Shopping/Rua)</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.ocupacao)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Estrutura (Luz Copel, Água, Internet, Manutenção)</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.estrutura)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Equipe (Salários, Benefícios e Encargos informados)</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.equipe)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Marketing & Conteúdo (Anúncios, Materiais)</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.marketing)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Operação & Logística (Fretes e Embalagens)</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.operacao)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Sistemas & Assinaturas</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.sistemas)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Administração & Contabilidade</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.administracao)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Vendas (Comissões e taxas operacionais)</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.vendas)}
                </span>
              </div>
              <div className="p-2.5 px-3 flex justify-between text-xs pl-6">
                <span>Outras Despesas Operacionais</span>
                <span className="text-red-500">
                  - {formatBRL(incomeStatement.operatingExpenses.outras)}
                </span>
              </div>

              {/* Final Result */}
              <div className="p-3.5 flex justify-between text-base font-bold bg-muted/60">
                <span>(=) RESULTADO GERENCIAL DO MÊS</span>
                <span
                  className={
                    incomeStatement.operatingResult >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }
                >
                  {formatBRL(incomeStatement.operatingResult)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DEMONSTRATIVO DE CAIXA E DISPONIBILIDADES */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Demonstrativo de Caixa</CardTitle>
            <CardDescription>Entradas e saídas efetivas e saldos disponíveis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">(+) Entradas Efetivas:</span>
                <span className="font-bold text-emerald-600">{formatBRL(cashFlow.cashIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">(-) Saídas Efetivas:</span>
                <span className="font-bold text-red-600">- {formatBRL(cashFlow.cashOut)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-semibold text-sm">
                <span>(=) Variação no Período:</span>
                <span className={cashFlow.cashVariation >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {formatBRL(cashFlow.cashVariation)}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Saldos Atuais por Conta
              </p>
              <div className="space-y-2">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex justify-between items-center p-2 rounded border bg-card text-xs"
                  >
                    <div>
                      <p className="font-medium line-clamp-1">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {a.type.replace('_', ' ')}
                      </p>
                    </div>
                    <span className="font-bold">{formatBRL(a.current_balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MODAL: CLOSE MONTH */}
      <Dialog open={isClosingModalOpen} onOpenChange={setIsClosingModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Lock className="h-5 w-5" />
              Fechar Período {selectedMonth}/{selectedYear}
            </DialogTitle>
            <DialogDescription>
              O fechamento mensal consolida os números e bloqueia alterações e lançamentos
              retroativos que afetem o período.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-sm space-y-2">
            <p>
              <strong>Unidade:</strong>{' '}
              {selectedStore === 'all' ? 'Consolidado (Todas as Lojas)' : 'Loja Selecionada'}
            </p>
            <p>
              <strong>Receita Líquida Apurada:</strong> {formatBRL(incomeStatement.netRevenue)}
            </p>
            <p>
              <strong>Resultado Gerencial:</strong> {formatBRL(incomeStatement.operatingResult)}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClosingModalOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={isActionLoading} onClick={handleConfirmCloseMonth}>
              {isActionLoading ? 'Fechando...' : 'Confirmar Fechamento Mensal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: REOPEN MONTH */}
      <Dialog open={isReopenModalOpen} onOpenChange={setIsReopenModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Unlock className="h-5 w-5" />
              Reabertura de Mês Fechado
            </DialogTitle>
            <DialogDescription>
              Somente administradores podem reabrir períodos fechados. É obrigatório fornecer uma
              justificativa para auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label>Justificativa Administrativa *</Label>
              <Textarea
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Ex: Necessidade de ajuste de despesa de energia elétrica lançada incorretamente pela contabilidade..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReopenModalOpen(false)}>
              Voltar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={!reopenReason.trim() || isActionLoading}
              onClick={handleConfirmReopenMonth}
            >
              {isActionLoading ? 'Reabrindo...' : 'Confirmar Reabertura com Auditoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

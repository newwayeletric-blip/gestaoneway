import { useEffect, useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Plus,
  Calendar,
  Wallet,
  Receipt,
  Repeat,
  PieChart as PieIcon,
  CreditCard,
  Building,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react'
import { FinancialService, StoresService } from '@/services/api'
import type {
  FinancialAccountRecord,
  FinancialCategoryRecord,
  FinancialTransactionRecord,
  CardReceivableRecord,
  RecurringExpenseRecord,
  ExpenseAllocationRecord,
  StoreRecord,
  FinancialTransactionType,
  FinancialTransactionStatus,
} from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'

export function Financial() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  // Data states
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [categories, setCategories] = useState<FinancialCategoryRecord[]>([])
  const [transactions, setTransactions] = useState<FinancialTransactionRecord[]>([])
  const [cardReceivables, setCardReceivables] = useState<CardReceivableRecord[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpenseRecord[]>([])
  const [allocations, setAllocations] = useState<ExpenseAllocationRecord[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])

  // Modal: New Transaction (Despesa / Receita / Aporte / Retirada)
  const [isTransModalOpen, setIsTransModalOpen] = useState(false)
  const [transDescription, setTransDescription] = useState('')
  const [transType, setTransType] = useState<FinancialTransactionType>('despesa')
  const [transCategory, setTransCategory] = useState('')
  const [transStore, setTransStore] = useState('')
  const [transStoreAllocation, setTransStoreAllocation] = useState<
    'jockey' | 'cajuru' | 'compartilhado'
  >('jockey')
  const [transAccount, setTransAccount] = useState('')
  const [transAmount, setTransAmount] = useState<number>(0)
  const [transCompetence, setTransCompetence] = useState(new Date().toISOString().split('T')[0])
  const [transDueDate, setTransDueDate] = useState(new Date().toISOString().split('T')[0])
  const [transStatus, setTransStatus] = useState<FinancialTransactionStatus>('pendente')
  const [transMethod, setTransMethod] = useState('pix')
  const [transSupplier, setTransSupplier] = useState('')
  const [transNotes, setTransNotes] = useState('')
  const [transInstallments, setTransInstallments] = useState(1)
  const [isSavingTrans, setIsSavingTrans] = useState(false)

  // Modal: Transfer Between Accounts
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [transferSource, setTransferSource] = useState('')
  const [transferDest, setTransferDest] = useState('')
  const [transferAmount, setTransferAmount] = useState<number>(0)
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [transferDesc, setTransferDesc] = useState('')
  const [isSavingTransfer, setIsSavingTransfer] = useState(false)

  // Modal: Liquidate Card Receivable
  const [isLiquidateModalOpen, setIsLiquidateModalOpen] = useState(false)
  const [selectedReceivable, setSelectedReceivable] = useState<CardReceivableRecord | null>(null)
  const [liquidateAccount, setLiquidateAccount] = useState('')
  const [liquidateDate, setLiquidateDate] = useState(new Date().toISOString().split('T')[0])
  const [isSavingLiquidation, setIsSavingLiquidation] = useState(false)

  // Filters for Transactions table
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterStore, setFilterStore] = useState('all')

  const loadData = async () => {
    try {
      setLoading(true)
      const [accs, cats, transRes, cardRecs, recurrings, allocs, storesList] = await Promise.all([
        FinancialService.listAccounts(),
        FinancialService.listCategories(),
        FinancialService.listTransactions('', 1, 100),
        FinancialService.listCardReceivables('', 1, 100),
        FinancialService.listRecurringExpenses(),
        FinancialService.listAllocations(),
        StoresService.list(),
      ])

      setAccounts(accs)
      setCategories(cats)
      setTransactions(transRes.items)
      setCardReceivables(cardRecs.items)
      setRecurringExpenses(recurrings)
      setAllocations(allocs)
      setStores(storesList)

      if (accs.length > 0) {
        setTransAccount(accs[0].id)
        setTransferSource(accs[0].id)
        if (accs.length > 1) setTransferDest(accs[1].id)
        setLiquidateAccount(accs[0].id)
      }
      if (cats.length > 0) {
        setTransCategory(cats[0].id)
      }
      if (storesList.length > 0) {
        setTransStore(storesList[0].id)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados financeiros',
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

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== 'all' && t.type !== filterType) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterStore !== 'all' && t.store !== filterStore) return false
      return true
    })
  }, [transactions, filterType, filterStatus, filterStore])

  // Balances summary
  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0)
  }, [accounts])

  const accountsPayablePending = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'despesa' && (t.status === 'pendente' || t.status === 'parcial'))
      .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0)
  }, [transactions])

  const accountsReceivablePending = useMemo(() => {
    return transactions
      .filter(
        (t) => t.type === 'receita_venda' && (t.status === 'pendente' || t.status === 'parcial'),
      )
      .reduce((sum, t) => sum + (t.amount - (t.paid_amount || 0)), 0)
  }, [transactions])

  const totalCardReceivablesPending = useMemo(() => {
    return cardReceivables
      .filter((r) => r.status === 'a_receber')
      .reduce((sum, r) => sum + r.net_amount, 0)
  }, [cardReceivables])

  // Save new transaction
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transDescription.trim() || transAmount <= 0) {
      toast({ title: 'Preencha descrição e valor válido', variant: 'destructive' })
      return
    }

    setIsSavingTrans(true)
    try {
      // If single installment
      if (transInstallments <= 1) {
        await FinancialService.createTransaction({
          description: transDescription,
          type: transType,
          category: transCategory || undefined,
          store: transStore || undefined,
          store_allocation: transStoreAllocation,
          account: transAccount || undefined,
          amount: transAmount,
          competence_date: transCompetence,
          due_date: transDueDate,
          status: transStatus,
          paid_amount: transStatus === 'pago' ? transAmount : 0,
          payment_date: transStatus === 'pago' ? transDueDate : undefined,
          payment_method: transMethod as any,
          recipient_supplier: transSupplier,
          notes: transNotes,
          created_by: user?.id,
        })

        // If paid, update account balance
        if (transStatus === 'pago' && transAccount) {
          const acc = accounts.find((a) => a.id === transAccount)
          if (acc) {
            const factor =
              transType === 'despesa' || transType === 'retirada' || transType === 'reembolso'
                ? -1
                : 1
            await FinancialService.updateAccount(transAccount, {
              current_balance: acc.current_balance + transAmount * factor,
            })
          }
        }
      } else {
        // Multi-installment creation: DOES NOT double-count the parent sum
        const instVal = Number((transAmount / transInstallments).toFixed(2))
        for (let i = 1; i <= transInstallments; i++) {
          const dueDateObj = new Date(transDueDate)
          dueDateObj.setMonth(dueDateObj.getMonth() + (i - 1))
          const instDueDate = dueDateObj.toISOString().split('T')[0]

          await FinancialService.createTransaction({
            description: `${transDescription} (${i}/${transInstallments})`,
            type: transType,
            category: transCategory || undefined,
            store: transStore || undefined,
            store_allocation: transStoreAllocation,
            account: transAccount || undefined,
            amount: instVal,
            competence_date: transCompetence,
            due_date: instDueDate,
            status: 'pendente',
            paid_amount: 0,
            payment_method: transMethod as any,
            recipient_supplier: transSupplier,
            installment_number: i,
            total_installments: transInstallments,
            notes: transNotes,
            created_by: user?.id,
          })
        }
      }

      toast({ title: 'Lançamento registrado com sucesso!' })
      setIsTransModalOpen(false)
      setTransDescription('')
      setTransAmount(0)
      setTransNotes('')
      setTransInstallments(1)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao criar lançamento', description: err.message, variant: 'destructive' })
    } finally {
      setIsSavingTrans(false)
    }
  }

  // Handle Transfer between own accounts
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transferSource || !transferDest || transferSource === transferDest) {
      toast({ title: 'Selecione contas de origem e destino distintas', variant: 'destructive' })
      return
    }
    if (transferAmount <= 0) {
      toast({ title: 'Valor deve ser superior a zero', variant: 'destructive' })
      return
    }

    setIsSavingTransfer(true)
    try {
      await FinancialService.transferBetweenAccounts(
        transferSource,
        transferDest,
        transferAmount,
        transferDate,
        transferDesc,
        user!.id,
      )
      toast({
        title: 'Transferência concluída!',
        description:
          'Saldos atualizados. Transferência entre contas próprias NÃO altera receitas ou despesas operacionais.',
      })
      setIsTransferModalOpen(false)
      setTransferAmount(0)
      setTransferDesc('')
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro na transferência', description: err.message, variant: 'destructive' })
    } finally {
      setIsSavingTransfer(false)
    }
  }

  // Open liquidate card modal
  const handleOpenLiquidate = (rec: CardReceivableRecord) => {
    setSelectedReceivable(rec)
    setLiquidateDate(new Date().toISOString().split('T')[0])
    if (rec.target_account) setLiquidateAccount(rec.target_account)
    setIsLiquidateModalOpen(true)
  }

  // Confirm card liquidation
  const handleConfirmLiquidate = async () => {
    if (!selectedReceivable || !liquidateAccount) {
      toast({ title: 'Selecione a conta de destino da liquidação', variant: 'destructive' })
      return
    }

    setIsSavingLiquidation(true)
    try {
      await FinancialService.liquidateCardReceivable(
        selectedReceivable.id,
        liquidateAccount,
        liquidateDate,
      )
      toast({
        title: 'Recebível liquidado com sucesso!',
        description: `Valor líquido de ${formatBRL(selectedReceivable.net_amount)} creditado na conta selecionada.`,
      })
      setIsLiquidateModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao liquidar recebível',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSavingLiquidation(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro Gerencial</h1>
          <p className="text-sm text-muted-foreground">
            Contas financeiras, contas a pagar/receber, despesas detalhadas, recebíveis de cartão e
            transferências
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsTransferModalOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-1.5" />
            Transferência entre Contas
          </Button>
          <Button size="sm" onClick={() => setIsTransModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Saldo em Contas e Caixas
              <Wallet className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-600">{formatBRL(totalBalance)}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {accounts.length} contas e caixas cadastrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Contas a Pagar (Pendentes)
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">
              {formatBRL(accountsPayablePending)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Despesas operacionais e estoque
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Contas a Receber (Clientes)
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-600">
              {formatBRL(accountsReceivablePending)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Vendas com saldo autorizado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center justify-between">
              Recebíveis de Cartão (Operadora)
              <CreditCard className="h-4 w-4 text-indigo-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-indigo-600">
              {formatBRL(totalCardReceivablesPending)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Previsão líquida futura</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="lancamentos" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="contas">Caixas e Bancos ({accounts.length})</TabsTrigger>
          <TabsTrigger value="cartoes">Recebíveis Operadora</TabsTrigger>
          <TabsTrigger value="recorrencias">Recorrências</TabsTrigger>
          <TabsTrigger value="rateios">Rateios entre Lojas</TabsTrigger>
        </TabsList>

        {/* TAB 1: TRANSACTIONS LIST */}
        <TabsContent value="lancamentos" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo de Movimentação</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Tipos</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="receita_venda">Receita Venda</SelectItem>
                      <SelectItem value="transferencia_entre_contas">
                        Transferência Contas
                      </SelectItem>
                      <SelectItem value="compra_estoque">Compra de Estoque</SelectItem>
                      <SelectItem value="aporte">Aporte de Capital</SelectItem>
                      <SelectItem value="retirada">Retirada de Sócios</SelectItem>
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
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="pago">Pago / Recebido</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="previsto">Previsto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Loja</Label>
                  <Select value={filterStore} onValueChange={setFilterStore}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Unidades</SelectItem>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Extrato de Lançamentos</CardTitle>
              <CardDescription>
                Competência da venda/despesa, vencimento, categoria e conta financeira vinculada
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Carregando lançamentos...
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                  Nenhum lançamento encontrado para os filtros selecionados.
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground text-left text-xs uppercase font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Descrição / Favorecido</th>
                        <th className="py-2.5 px-3">Categoria</th>
                        <th className="py-2.5 px-3">Loja</th>
                        <th className="py-2.5 px-3">Competência</th>
                        <th className="py-2.5 px-3">Vencimento</th>
                        <th className="py-2.5 px-3 text-right">Valor</th>
                        <th className="py-2.5 px-3 text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredTransactions.map((t) => {
                        const isIncome = t.type === 'receita_venda' || t.type === 'aporte'
                        const isTransfer = t.type === 'transferencia_entre_contas'
                        return (
                          <tr key={t.id} className="hover:bg-muted/40">
                            <td className="py-2.5 px-3">
                              <p className="font-medium">{t.description}</p>
                              {t.recipient_supplier && (
                                <p className="text-xs text-muted-foreground">
                                  {t.recipient_supplier}
                                </p>
                              )}
                              {t.expand?.account && (
                                <p className="text-[11px] text-muted-foreground">
                                  Conta: {t.expand.account.name}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              {t.expand?.category ? (
                                <span>
                                  {t.expand.category.name}
                                  {t.expand.category.subcategory &&
                                    ` > ${t.expand.category.subcategory}`}
                                </span>
                              ) : isTransfer ? (
                                <span className="text-indigo-600 font-medium">
                                  Transferência Contas
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-muted-foreground">
                              {t.expand?.store?.name || t.store_allocation || 'Compartilhado'}
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              {formatDateBR(t.competence_date)}
                            </td>
                            <td className="py-2.5 px-3 text-xs">{formatDateBR(t.due_date)}</td>
                            <td
                              className={`py-2.5 px-3 text-right font-bold ${
                                isTransfer
                                  ? 'text-foreground'
                                  : isIncome
                                    ? 'text-emerald-600'
                                    : 'text-red-600'
                              }`}
                            >
                              {isIncome
                                ? `+ ${formatBRL(t.amount)}`
                                : isTransfer
                                  ? formatBRL(t.amount)
                                  : `- ${formatBRL(t.amount)}`}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge
                                variant={
                                  t.status === 'pago'
                                    ? 'default'
                                    : t.status === 'pendente'
                                      ? 'outline'
                                      : 'secondary'
                                }
                                className="text-[10px] capitalize"
                              >
                                {t.status}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: FINANCIAL ACCOUNTS */}
        <TabsContent value="contas" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <Card key={acc.id} className="relative overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize text-xs">
                      {acc.type.replace('_', ' ')}
                    </Badge>
                    <Badge variant={acc.active ? 'default' : 'secondary'} className="text-[10px]">
                      {acc.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-semibold mt-1">{acc.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {acc.bank_name || 'Caixa Local'}{' '}
                    {acc.expand?.store && `• ${acc.expand.store.name}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Saldo Atual em Caixa:</span>
                    <p className="text-2xl font-bold text-primary">
                      {formatBRL(acc.current_balance)}
                    </p>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                    <span>Saldo Inicial ({formatDateBR(acc.initial_balance_date)}):</span>
                    <span>{formatBRL(acc.initial_balance)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: CARD RECEIVABLES */}
        <TabsContent value="cartoes" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Recebíveis Futuros de Cartão de Crédito
              </CardTitle>
              <CardDescription>
                Controle de liquidação da operadora com taxas descontadas e previsão de depósito
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cardReceivables.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                  Nenhum recebível de cartão registrado.
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground text-left text-xs uppercase font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Venda Origem</th>
                        <th className="py-2.5 px-3">Parcela</th>
                        <th className="py-2.5 px-3 text-right">Valor Bruto</th>
                        <th className="py-2.5 px-3 text-center">Taxa (%)</th>
                        <th className="py-2.5 px-3 text-right">Taxa (R$)</th>
                        <th className="py-2.5 px-3 text-right">Valor Líquido</th>
                        <th className="py-2.5 px-3">Previsão Liquidação</th>
                        <th className="py-2.5 px-3 text-center">Situação</th>
                        <th className="py-2.5 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cardReceivables.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/40">
                          <td className="py-2.5 px-3 font-medium">
                            {r.expand?.sale?.number || 'Venda'}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            {r.installment_number} de {r.total_installments}
                          </td>
                          <td className="py-2.5 px-3 text-right">{formatBRL(r.gross_amount)}</td>
                          <td className="py-2.5 px-3 text-center text-xs">{r.fee_rate}%</td>
                          <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">
                            - {formatBRL(r.fee_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                            {formatBRL(r.net_amount)}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            {formatDateBR(r.expected_liquidation_date)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant={r.status === 'liquidado' ? 'default' : 'outline'}
                              className="text-[10px] capitalize"
                            >
                              {r.status.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {r.status === 'a_receber' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-emerald-600"
                                onClick={() => handleOpenLiquidate(r)}
                              >
                                Liquidar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: RECURRING EXPENSES */}
        <TabsContent value="recorrencias" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Despesas Recorrentes (Aluguel, Sistemas, Luz)
              </CardTitle>
              <CardDescription>
                Gera lançamentos previstos periódicos, sem marcar automaticamente como pagos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recurringExpenses.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                  Nenhuma despesa recorrente cadastrada.
                </div>
              ) : (
                <div className="divide-y border rounded-md">
                  {recurringExpenses.map((rec) => (
                    <div key={rec.id} className="p-3.5 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-semibold">{rec.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {rec.expand?.category?.name || 'Geral'} • Frequência: {rec.frequency} •
                          Vence todo dia {rec.due_day}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-base text-red-600">{formatBRL(rec.amount)}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {rec.store_allocation}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: SHARED ALLOCATIONS */}
        <TabsContent value="rateios" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Rateios de Despesas Compartilhadas
              </CardTitle>
              <CardDescription>
                Define a distribuição percentual entre as lojas Shopping Jockey Plaza e Loja Rua
                Cajuru (Total deve ser 100%)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {allocations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
                  Nenhum rateio configurado. Despesas compartilhadas aparecerão como "não alocadas".
                </div>
              ) : (
                <div className="space-y-3">
                  {allocations.map((al) => (
                    <div
                      key={al.id}
                      className="p-3 rounded-lg border flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-semibold">{al.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Loja: {al.expand?.store?.name}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-sm font-bold">
                        {al.percentage}% da despesa
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL: NEW TRANSACTION */}
      <Dialog open={isTransModalOpen} onOpenChange={setIsTransModalOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSaveTransaction}>
            <DialogHeader>
              <DialogTitle>Novo Lançamento Financeiro</DialogTitle>
              <DialogDescription>
                Registrar despesa operacional, compras de estoque, aportes ou retiradas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 max-h-[460px] overflow-y-auto pr-1">
              <div>
                <Label>Descrição *</Label>
                <Input
                  required
                  value={transDescription}
                  onChange={(e) => setTransDescription(e.target.value)}
                  placeholder="Ex: Aluguel Loja Jockey Plaza, Conta Copel..."
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Lançamento</Label>
                  <Select value={transType} onValueChange={(v) => setTransType(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="despesa">Despesa Operacional</SelectItem>
                      <SelectItem value="compra_estoque">
                        Compra de Estoque (Mercadorias)
                      </SelectItem>
                      <SelectItem value="receita_venda">Receita Venda Avulsa</SelectItem>
                      <SelectItem value="aporte">Aporte dos Sócios</SelectItem>
                      <SelectItem value="retirada">Retirada de Pró-labore/Lucro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Categoria</Label>
                  <Select value={transCategory} onValueChange={setTransCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione categoria..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.subcategory && `(${c.subcategory})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor Total (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={transAmount || ''}
                    onChange={(e) => setTransAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Parcelamento</Label>
                  <Select
                    value={String(transInstallments)}
                    onValueChange={(v) => setTransInstallments(parseInt(v, 10))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1x (À vista)</SelectItem>
                      <SelectItem value="2">2x parcelas</SelectItem>
                      <SelectItem value="3">3x parcelas</SelectItem>
                      <SelectItem value="4">4x parcelas</SelectItem>
                      <SelectItem value="6">6x parcelas</SelectItem>
                      <SelectItem value="12">12x parcelas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data de Competência</Label>
                  <Input
                    type="date"
                    required
                    value={transCompetence}
                    onChange={(e) => setTransCompetence(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input
                    type="date"
                    required
                    value={transDueDate}
                    onChange={(e) => setTransDueDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unidade / Alocação</Label>
                  <Select
                    value={transStoreAllocation}
                    onValueChange={(v) => setTransStoreAllocation(v as any)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jockey">Shopping Jockey Plaza</SelectItem>
                      <SelectItem value="cajuru">Loja Rua Cajuru</SelectItem>
                      <SelectItem value="compartilhado">Compartilhado (Rateio)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Situação Inicial</Label>
                  <Select value={transStatus} onValueChange={(v) => setTransStatus(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente de Pagamento</SelectItem>
                      <SelectItem value="previsto">Previsto</SelectItem>
                      <SelectItem value="pago">Já Pago / Liquidado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Conta Financeira</Label>
                  <Select value={transAccount} onValueChange={setTransAccount}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione conta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={transMethod} onValueChange={setTransMethod}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Fornecedor / Favorecido</Label>
                <Input
                  value={transSupplier}
                  onChange={(e) => setTransSupplier(e.target.value)}
                  placeholder="Nome da empresa ou prestador de serviço"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={transNotes}
                  onChange={(e) => setTransNotes(e.target.value)}
                  placeholder="Detalhes adicionais..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTransModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingTrans}>
                {isSavingTrans ? 'Salvando...' : 'Salvar Lançamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: TRANSFER BETWEEN ACCOUNTS */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveTransfer}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Transferência entre Contas Próprias
              </DialogTitle>
              <DialogDescription>
                Movimenta saldo entre caixas físicos e contas bancárias. NÃO é classificado como
                receita ou despesa.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div>
                <Label>Conta de Origem (Saída)</Label>
                <Select value={transferSource} onValueChange={setTransferSource}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (Saldo: {formatBRL(a.current_balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Conta de Destino (Entrada)</Label>
                <Select value={transferDest} onValueChange={setTransferDest}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} (Saldo: {formatBRL(a.current_balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor da Transferência (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={transferAmount || ''}
                  onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 font-semibold"
                />
              </div>

              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Descrição / Motivo</Label>
                <Input
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  placeholder="Ex: Sangria de caixa para depósito bancário"
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsTransferModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingTransfer}>
                {isSavingTransfer ? 'Processando...' : 'Confirmar Transferência'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: LIQUIDATE RECEIVABLE */}
      <Dialog open={isLiquidateModalOpen} onOpenChange={setIsLiquidateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              Liquidação de Recebível de Cartão
            </DialogTitle>
            <DialogDescription>
              Registra a liquidação efetiva feita pela credenciadora/adquirente na conta bancária.
            </DialogDescription>
          </DialogHeader>

          {selectedReceivable && (
            <div className="space-y-3 py-2 text-sm">
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
                <p>
                  <strong>Venda:</strong> {selectedReceivable.expand?.sale?.number} (Parcela{' '}
                  {selectedReceivable.installment_number}/{selectedReceivable.total_installments})
                </p>
                <p>
                  <strong>Valor Bruto:</strong> {formatBRL(selectedReceivable.gross_amount)}
                </p>
                <p>
                  <strong>Taxa Descontada:</strong> - {formatBRL(selectedReceivable.fee_amount)} (
                  {selectedReceivable.fee_rate}%)
                </p>
                <p className="text-base font-bold text-emerald-600 pt-1 border-t">
                  Valor Líquido a Receber: {formatBRL(selectedReceivable.net_amount)}
                </p>
              </div>

              <div>
                <Label>Conta Bancária de Crédito *</Label>
                <Select value={liquidateAccount} onValueChange={setLiquidateAccount}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Data da Liquidação</Label>
                <Input
                  type="date"
                  value={liquidateDate}
                  onChange={(e) => setLiquidateDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLiquidateModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={isSavingLiquidation || !liquidateAccount}
              onClick={handleConfirmLiquidate}
            >
              {isSavingLiquidation ? 'Liquidando...' : 'Confirmar Liquidação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

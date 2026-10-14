import React, { useState, useEffect, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  SalesService,
  StoresService,
  ProductsService,
  StockService,
  CommissionsService,
  FinancialService,
  pb,
} from '@/services/api'
import type {
  StoreRecord,
  ProductRecord,
  UserRecord,
  SaleRecord,
  SaleItemRecord,
  SalePaymentRecord,
  StockItemRecord,
  StockMovementRecord,
  TransferRecord,
  CommissionRecord,
  FinancialTransactionRecord,
  FinancialCategoryRecord,
  MonthlyClosingRecord,
} from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Store as StoreIcon,
  User,
  Filter,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRightLeft,
  Percent,
  Receipt,
  FileText,
  AlertCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

export type ReportTypeId =
  | 'vendas'
  | 'pagamentos'
  | 'estoque'
  | 'movimentacoes'
  | 'comissoes'
  | 'despesas'
  | 'contas'
  | 'fluxo_caixa'
  | 'demonstrativo'

interface ReportMeta {
  id: ReportTypeId
  title: string
  subtitle: string
  icon: any
}

const REPORT_DEFINITIONS: ReportMeta[] = [
  {
    id: 'vendas',
    title: 'Vendas por Período, Unidade, Produto e Vendedor',
    subtitle:
      'Listagem detalhada de vendas realizadas, canal, vendedor, itens e faturamento total.',
    icon: TrendingUp,
  },
  {
    id: 'pagamentos',
    title: 'Pagamentos por Modalidade',
    subtitle:
      'Consolidado e transações discriminadas por Pix, Dinheiro, Cartão de Crédito e Débito.',
    icon: DollarSign,
  },
  {
    id: 'estoque',
    title: 'Posição de Estoque por Unidade',
    subtitle: 'Quantidades disponíveis, estoque mínimo, alertas de reposição e status por loja.',
    icon: Layers,
  },
  {
    id: 'movimentacoes',
    title: 'Movimentações e Transferências de Estoque',
    subtitle: 'Entradas, baixas por vendas, avarias, devoluções e remessas entre filiais.',
    icon: ArrowRightLeft,
  },
  {
    id: 'comissoes',
    title: 'Comissões de Vendedores',
    subtitle: 'Relatório por vendedor, loja e situação (prevista, liberada, paga, estornada).',
    icon: Percent,
  },
  {
    id: 'despesas',
    title: 'Despesas Detalhadas por Categoria / Subcategoria',
    subtitle: 'Gastos operacionais agrupados por natureza, centro de custo e alocação.',
    icon: Receipt,
  },
  {
    id: 'contas',
    title: 'Contas a Pagar e a Receber (Vencidos e a Vencer)',
    subtitle: 'Previsões financeiras, obrigações pendentes com fornecedores e títulos a receber.',
    icon: Calendar,
  },
  {
    id: 'fluxo_caixa',
    title: 'Fluxo de Caixa por Período (Regime de Caixa)',
    subtitle: 'Entradas e saídas efetivamente liquidadas nas contas financeiras no intervalo.',
    icon: TrendingDown,
  },
  {
    id: 'demonstrativo',
    title: 'Demonstrativo Mensal (DRE Gerencial)',
    subtitle:
      'Receita, descontos, devoluções, CMV, despesas e resultado operacional por competência.',
    icon: FileText,
  },
]

export default function Reports() {
  const { isAdmin } = useAuth()
  const { toast } = useToast()

  // Se vendedor tentar acessar rota diretamente no cliente
  if (!isAdmin) {
    return <Navigate to="/403" replace />
  }

  // Active Report
  const [reportType, setReportType] = useState<ReportTypeId>('vendas')

  // Available Filter Options
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [sellers, setSellers] = useState<UserRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])

  // Filters State
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1) // first day of month
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [selectedStore, setSelectedStore] = useState<string>('all')
  const [selectedSeller, setSelectedSeller] = useState<string>('all')
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all')
  const [selectedCommissionStatus, setSelectedCommissionStatus] = useState<string>('all')

  // Loaded Data
  const [isLoading, setIsLoading] = useState(false)
  const [salesData, setSalesData] = useState<SaleRecord[]>([])
  const [salePaymentsData, setSalePaymentsData] = useState<SalePaymentRecord[]>([])
  const [stockItemsData, setStockItemsData] = useState<StockItemRecord[]>([])
  const [stockMovementsData, setStockMovementsData] = useState<StockMovementRecord[]>([])
  const [commissionsData, setCommissionsData] = useState<CommissionRecord[]>([])
  const [transactionsData, setTransactionsData] = useState<FinancialTransactionRecord[]>([])
  const [categoriesData, setCategoriesData] = useState<FinancialCategoryRecord[]>([])

  // 1. Initial lookup data
  useEffect(() => {
    const initLookups = async () => {
      try {
        const [stList, prList, uList, catList] = await Promise.all([
          StoresService.list(),
          ProductsService.list(),
          pb.collection('users').getFullList<UserRecord>({ sort: 'name' }),
          FinancialService.listCategories(),
        ])
        setStores(stList)
        setProducts(prList)
        setSellers(uList.filter((u) => u.profile === 'vendedor' || u.profile === 'admin'))
        setCategoriesData(catList)
      } catch (err) {
        console.error('Error fetching lookups:', err)
      }
    }
    initLookups()
  }, [])

  // 2. Fetch data based on active report and date bounds
  const loadReportData = async () => {
    setIsLoading(true)
    try {
      if (reportType === 'vendas' || reportType === 'demonstrativo') {
        const list = await SalesService.getAll()
        setSalesData(list)
      }

      if (reportType === 'pagamentos') {
        const list = await pb.collection('sale_payments').getFullList<SalePaymentRecord>({
          sort: '-created',
          expand: 'sale,sale.store,sale.customer,sale.seller',
        })
        setSalePaymentsData(list)
      }

      if (reportType === 'estoque') {
        const list = await StockService.getStockItems()
        setStockItemsData(list)
      }

      if (reportType === 'movimentacoes') {
        const res = await pb.collection('stock_movements').getFullList<StockMovementRecord>({
          sort: '-date,-created',
          expand: 'product,variant,store,user',
        })
        setStockMovementsData(res)
      }

      if (reportType === 'comissoes') {
        const list = await CommissionsService.getAll()
        setCommissionsData(list)
      }

      if (
        reportType === 'despesas' ||
        reportType === 'contas' ||
        reportType === 'fluxo_caixa' ||
        reportType === 'demonstrativo'
      ) {
        const txs = await FinancialService.getAllTransactions()
        setTransactionsData(txs)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados do relatório',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadReportData()
  }, [reportType])

  // Filter Helpers
  const isDateBetween = (dateStr?: string) => {
    if (!dateStr) return false
    const d = dateStr.slice(0, 10)
    if (startDate && d < startDate) return false
    if (endDate && d > endDate) return false
    return true
  }

  // 3. Computed Rows per Report
  const currentFilteredData = useMemo(() => {
    switch (reportType) {
      case 'vendas': {
        return salesData.filter((s) => {
          if (!isDateBetween(s.created)) return false
          if (selectedStore !== 'all' && s.store !== selectedStore) return false
          if (selectedSeller !== 'all' && s.seller !== selectedSeller) return false
          return true
        })
      }

      case 'pagamentos': {
        return salePaymentsData.filter((p) => {
          if (!isDateBetween(p.created)) return false
          const sale = p.expand?.sale
          if (selectedStore !== 'all' && sale?.store !== selectedStore) return false
          if (selectedPaymentMethod !== 'all' && p.method !== selectedPaymentMethod) return false
          return true
        })
      }

      case 'estoque': {
        return stockItemsData.filter((st) => {
          if (selectedStore !== 'all' && st.store !== selectedStore) return false
          if (selectedProduct !== 'all' && st.product !== selectedProduct) return false
          return true
        })
      }

      case 'movimentacoes': {
        return stockMovementsData.filter((m) => {
          if (!isDateBetween(m.date || m.created)) return false
          if (selectedStore !== 'all' && m.store !== selectedStore) return false
          if (selectedProduct !== 'all' && m.product !== selectedProduct) return false
          return true
        })
      }

      case 'comissoes': {
        return commissionsData.filter((c) => {
          if (!isDateBetween(c.competence_date || c.created)) return false
          if (selectedStore !== 'all' && c.store !== selectedStore) return false
          if (selectedSeller !== 'all' && c.seller !== selectedSeller) return false
          if (selectedCommissionStatus !== 'all' && c.status !== selectedCommissionStatus)
            return false
          return true
        })
      }

      case 'despesas': {
        return transactionsData.filter((t) => {
          if (t.type !== 'despesa') return false
          if (!isDateBetween(t.competence_date || t.due_date)) return false
          if (selectedStore !== 'all' && t.store !== selectedStore) return false
          return true
        })
      }

      case 'contas': {
        return transactionsData.filter((t) => {
          if (t.type === 'transferencia_entre_contas') return false
          if (!isDateBetween(t.due_date)) return false
          if (selectedStore !== 'all' && t.store !== selectedStore) return false
          return true
        })
      }

      case 'fluxo_caixa': {
        return transactionsData.filter((t) => {
          if (t.status !== 'pago') return false
          if (!isDateBetween(t.payment_date || t.due_date)) return false
          if (selectedStore !== 'all' && t.store !== selectedStore) return false
          return true
        })
      }

      case 'demonstrativo': {
        // Consolidated logic handled below
        return []
      }

      default:
        return []
    }
  }, [
    reportType,
    salesData,
    salePaymentsData,
    stockItemsData,
    stockMovementsData,
    commissionsData,
    transactionsData,
    startDate,
    endDate,
    selectedStore,
    selectedSeller,
    selectedProduct,
    selectedPaymentMethod,
    selectedCommissionStatus,
  ])

  // DRE Demonstrativo Calculation
  const dreData = useMemo(() => {
    if (reportType !== 'demonstrativo') return null

    const filteredSales = salesData.filter((s) => {
      if (!isDateBetween(s.created)) return false
      if (selectedStore !== 'all' && s.store !== selectedStore) return false
      return s.status === 'confirmada'
    })

    const grossRevenue = filteredSales.reduce((acc, s) => acc + (s.subtotal || s.total), 0)
    const discounts = filteredSales.reduce((acc, s) => acc + (s.total_discount || 0), 0)
    const netRevenue = grossRevenue - discounts

    // Estornos / devoluções
    const returnedSales = salesData.filter((s) => {
      if (!isDateBetween(s.created)) return false
      if (selectedStore !== 'all' && s.store !== selectedStore) return false
      return s.status === 'devolvida' || s.status === 'cancelada'
    })
    const returnsValue = returnedSales.reduce((acc, s) => acc + (s.total || 0), 0)

    // Despesas operacionais por competência
    const operationalExpenses = transactionsData
      .filter((t) => {
        if (t.type !== 'despesa') return false
        if (t.status === 'cancelado') return false
        if (!isDateBetween(t.competence_date)) return false
        if (selectedStore !== 'all' && t.store !== selectedStore) return false
        return true
      })
      .reduce((acc, t) => acc + (t.amount || 0), 0)

    // Compra de estoque (CMV estimado)
    const stockPurchases = transactionsData
      .filter((t) => {
        if (t.type !== 'compra_estoque') return false
        if (t.status === 'cancelado') return false
        if (!isDateBetween(t.competence_date)) return false
        if (selectedStore !== 'all' && t.store !== selectedStore) return false
        return true
      })
      .reduce((acc, t) => acc + (t.amount || 0), 0)

    // Comissões geradas no período
    const periodCommissions = commissionsData
      .filter((c) => {
        if (!isDateBetween(c.competence_date || c.created)) return false
        if (selectedStore !== 'all' && c.store !== selectedStore) return false
        return c.status !== 'estornada'
      })
      .reduce((acc, c) => acc + (c.value || 0), 0)

    const totalCostsAndExpenses = operationalExpenses + stockPurchases + periodCommissions
    const netOperatingResult = netRevenue - returnsValue - totalCostsAndExpenses

    return {
      grossRevenue,
      discounts,
      netRevenue,
      returnsValue,
      stockPurchases,
      operationalExpenses,
      periodCommissions,
      totalCostsAndExpenses,
      netOperatingResult,
      salesCount: filteredSales.length,
    }
  }, [reportType, salesData, transactionsData, commissionsData, startDate, endDate, selectedStore])

  // Current Active Report Definition
  const activeDef = REPORT_DEFINITIONS.find((r) => r.id === reportType)!

  // Print Handlers
  const handlePrint = () => {
    window.print()
  }

  // Export CSV
  const handleExportCSV = () => {
    const storeLabel =
      selectedStore === 'all'
        ? 'Todas as Unidades'
        : stores.find((s) => s.id === selectedStore)?.name || 'Unidade'

    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF' // BOM for Excel pt-BR

    if (reportType === 'vendas') {
      csvContent +=
        'Numero;Cliente;Unidade;Vendedor;Total_Bruto;Desconto;Total_Liquido;Status;Data\r\n'
      currentFilteredData.forEach((s: SaleRecord) => {
        csvContent += `"${s.number}";"${s.expand?.customer?.name || ''}";"${s.expand?.store?.name || ''}";"${s.expand?.seller?.name || ''}";"${s.subtotal || s.total}";"${s.total_discount || 0}";"${s.total}";"${s.status}";"${formatDateBR(s.created)}"\r\n`
      })
    } else if (reportType === 'pagamentos') {
      csvContent += 'Venda;Cliente;Unidade;Modalidade;Valor;Confirmado;Data\r\n'
      currentFilteredData.forEach((p: SalePaymentRecord) => {
        csvContent += `"${p.expand?.sale?.number || ''}";"${p.expand?.sale?.expand?.customer?.name || ''}";"${p.expand?.sale?.expand?.store?.name || ''}";"${p.method}";"${p.amount}";"${p.confirmed ? 'Sim' : 'Nao'}";"${formatDateBR(p.created)}"\r\n`
      })
    } else if (reportType === 'estoque') {
      csvContent += 'Produto;SKU;Unidade;Quantidade;Estoque_Minimo;Situacao\r\n'
      currentFilteredData.forEach((st: StockItemRecord) => {
        const minStock = st.expand?.product?.min_stock || 0
        const status = st.quantity <= minStock ? 'BAIXO' : 'REGULAR'
        csvContent += `"${st.expand?.product?.name || ''}";"${st.expand?.product?.sku || ''}";"${st.expand?.store?.name || ''}";"${st.quantity}";"${minStock}";"${status}"\r\n`
      })
    } else if (reportType === 'movimentacoes') {
      csvContent += 'Data;Tipo;Produto;Unidade;Quantidade;Usuario;Motivo\r\n'
      currentFilteredData.forEach((m: StockMovementRecord) => {
        csvContent += `"${formatDateBR(m.date || m.created)}";"${m.type}";"${m.expand?.product?.name || ''}";"${m.expand?.store?.name || ''}";"${m.quantity}";"${m.expand?.user?.name || ''}";"${m.reason || ''}"\r\n`
      })
    } else if (reportType === 'comissoes') {
      csvContent += 'Vendedor;Venda;Unidade;Base_Calculo;Taxa_Pct;Comissao;Situacao;Competencia\r\n'
      currentFilteredData.forEach((c: CommissionRecord) => {
        csvContent += `"${c.expand?.seller?.name || ''}";"${c.expand?.sale?.number || ''}";"${c.expand?.store?.name || ''}";"${c.base_amount}";"${c.rate}";"${c.value}";"${c.status}";"${formatDateBR(c.competence_date || c.created)}"\r\n`
      })
    } else if (reportType === 'despesas') {
      csvContent +=
        'Descricao;Categoria;Subcategoria;Unidade;Fornecedor;Valor;Competencia;Vencimento;Situacao\r\n'
      currentFilteredData.forEach((t: FinancialTransactionRecord) => {
        csvContent += `"${t.description}";"${t.expand?.category?.name || ''}";"${t.expand?.category?.subcategory || ''}";"${t.expand?.store?.name || t.store_allocation || ''}";"${t.recipient_supplier || ''}";"${t.amount}";"${formatDateBR(t.competence_date)}";"${formatDateBR(t.due_date)}";"${t.status}"\r\n`
      })
    } else if (reportType === 'contas') {
      csvContent +=
        'Tipo;Descricao;Favorecido_Cliente;Unidade;Valor;Vencimento;Situacao;Atrasado\r\n'
      const todayStr = new Date().toISOString().split('T')[0]
      currentFilteredData.forEach((t: FinancialTransactionRecord) => {
        const isLate = t.status !== 'pago' && t.due_date < todayStr
        csvContent += `"${t.type}";"${t.description}";"${t.recipient_supplier || ''}";"${t.expand?.store?.name || ''}";"${t.amount}";"${formatDateBR(t.due_date)}";"${t.status}";"${isLate ? 'SIM' : 'NAO'}"\r\n`
      })
    } else if (reportType === 'fluxo_caixa') {
      csvContent += 'Data_Liquidacao;Tipo;Descricao;Conta_Bancaria;Valor;Forma_Pagamento\r\n'
      currentFilteredData.forEach((t: FinancialTransactionRecord) => {
        const isEntry = t.type === 'receita_venda' || t.type === 'aporte'
        csvContent += `"${formatDateBR(t.payment_date || t.due_date)}";"${isEntry ? 'ENTRADA' : 'SAIDA'}";"${t.description}";"${t.expand?.account?.name || ''}";"${t.amount}";"${t.payment_method || ''}"\r\n`
      })
    } else if (reportType === 'demonstrativo' && dreData) {
      csvContent += 'Indicador_DRE;Valor_BRL\r\n'
      csvContent += `"Receita Bruta de Vendas";"${dreData.grossRevenue}"\r\n`
      csvContent += `"(-) Descontos Concedidos";"-${dreData.discounts}"\r\n`
      csvContent += `"(=) Receita Líquida";"${dreData.netRevenue}"\r\n`
      csvContent += `"(-) Devoluções e Cancelamentos";"-${dreData.returnsValue}"\r\n`
      csvContent += `"(-) Compra de Estoque / CMV";"-${dreData.stockPurchases}"\r\n`
      csvContent += `"(-) Despesas Operacionais";"-${dreData.operationalExpenses}"\r\n`
      csvContent += `"(-) Comissões da Equipe";"-${dreData.periodCommissions}"\r\n`
      csvContent += `"(=) Resultado Operacional Líquido";"${dreData.netOperatingResult}"\r\n`
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `new_way_eletric_${reportType}_${startDate}_a_${endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Planilha exportada com sucesso!',
      description: `Arquivo CSV gerado com ${reportType === 'demonstrativo' ? 'resumo DRE' : `${currentFilteredData.length} registros`}.`,
    })
  }

  return (
    <div className="space-y-6">
      {/* HEADER NÃO-IMPRESSÃO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Relatórios Administrativos & Gerenciais
          </h1>
          <p className="text-sm text-muted-foreground">
            Visões consolidadas por período, unidade e filtros específicos. Exportação CSV e
            impressão em folha A4.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4 text-gray-700" /> Imprimir A4 (PDF)
          </Button>
          <Button
            size="sm"
            onClick={handleExportCSV}
            className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
          >
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* PRINT HEADER — EXIBIDO SOMENTE NO @media print */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-black uppercase">NEW WAY ELETRIC</h1>
            <p className="text-xs text-gray-600">
              Unidades: Shopping Jockey Plaza & Rua Cajuru • Curitiba/PR
            </p>
            <h2 className="text-base font-semibold mt-2 text-black">{activeDef.title}</h2>
          </div>
          <div className="text-right text-xs text-gray-600">
            <p>
              <strong>Emissão:</strong> {formatDateBR(new Date().toISOString(), true)}
            </p>
            <p>
              <strong>Período:</strong> {formatDateBR(startDate)} a {formatDateBR(endDate)}
            </p>
            <p>
              <strong>Unidade:</strong>{' '}
              {selectedStore === 'all'
                ? 'Todas as Unidades'
                : stores.find((s) => s.id === selectedStore)?.name}
            </p>
          </div>
        </div>
      </div>

      {/* SELETOR DE RELATÓRIO — NÃO IMPRIME */}
      <Card className="bg-white border shadow-sm rounded-xl print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Selecione o Relatório Desejado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {REPORT_DEFINITIONS.map((def) => {
              const Icon = def.icon
              const isSelected = def.id === reportType
              return (
                <button
                  key={def.id}
                  onClick={() => setReportType(def.id)}
                  type="button"
                  className={`text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'bg-emerald-50/80 border-[#0A8F5C] text-[#0A8F5C] ring-1 ring-[#0A8F5C]'
                      : 'hover:bg-gray-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 mt-0.5 ${
                      isSelected ? 'text-[#0A8F5C]' : 'text-gray-400'
                    }`}
                  />
                  <div className="overflow-hidden">
                    <p className="font-semibold text-xs leading-snug">{def.title}</p>
                    <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">{def.subtitle}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* FILTROS GERAIS — NÃO IMPRIME */}
      <Card className="bg-white border shadow-sm rounded-xl print:hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" /> Parâmetros e Filtros do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            {/* Start Date */}
            <div>
              <label className="font-semibold block mb-1">Data Inicial</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="font-semibold block mb-1">Data Final</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {/* Store */}
            <div>
              <label className="font-semibold block mb-1">Unidade / Loja</label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="h-8 text-xs">
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

            {/* Seller (for vendas / comissoes) */}
            {(reportType === 'vendas' || reportType === 'comissoes') && (
              <div>
                <label className="font-semibold block mb-1">Vendedor</label>
                <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Vendedores</SelectItem>
                    {sellers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Product (for estoque / movimentacoes) */}
            {(reportType === 'estoque' || reportType === 'movimentacoes') && (
              <div>
                <label className="font-semibold block mb-1">Produto Específico</label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Produtos</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Payment method (for pagamentos) */}
            {reportType === 'pagamentos' && (
              <div>
                <label className="font-semibold block mb-1">Modalidade</label>
                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Modalidades</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                    <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Commission Status */}
            {reportType === 'comissoes' && (
              <div>
                <label className="font-semibold block mb-1">Situação Comissão</label>
                <Select
                  value={selectedCommissionStatus}
                  onValueChange={setSelectedCommissionStatus}
                >
                  <SelectTrigger className="h-8 text-xs">
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
            )}

            {/* Refresh button */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={loadReportData}
                disabled={isLoading}
                className="h-8 w-full text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ÁREA DE PRÉ-VISUALIZAÇÃO / IMPRESSÃO */}
      <Card className="bg-white border shadow-sm rounded-xl p-5 print:shadow-none print:border-none print:p-0">
        <div className="flex items-center justify-between mb-4 border-b pb-3">
          <div>
            <h3 className="font-bold text-base text-[#111111] flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#0A8F5C]" />
              {activeDef.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Filtro: {startDate} até {endDate} •{' '}
              {selectedStore === 'all'
                ? 'Todas as Unidades'
                : stores.find((s) => s.id === selectedStore)?.name}
            </p>
          </div>

          <div className="text-right">
            <Badge variant="outline" className="text-xs">
              {reportType === 'demonstrativo'
                ? 'DRE Consolidada'
                : `${currentFilteredData.length} registros`}
            </Badge>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RELATÓRIO 1: VENDAS POR PERÍODO, UNIDADE, PRODUTO E VENDEDOR   */}
        {/* ============================================================== */}
        {reportType === 'vendas' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white print:border-black">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Nº Venda</th>
                  <th className="py-2.5 px-3 font-semibold">Cliente</th>
                  <th className="py-2.5 px-3 font-semibold">Unidade</th>
                  <th className="py-2.5 px-3 font-semibold">Vendedor</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Subtotal</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Desconto</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Total Líquido</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                {currentFilteredData.map((s: SaleRecord) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="py-2 px-3 font-mono font-bold text-gray-900">{s.number}</td>
                    <td className="py-2 px-3">{s.expand?.customer?.name || 'Balcão'}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {s.expand?.store?.name || '-'}
                    </td>
                    <td className="py-2 px-3">{s.expand?.seller?.name || '-'}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {formatBRL(s.subtotal || s.total)}
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-600">
                      {s.total_discount > 0 ? `- ${formatBRL(s.total_discount)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[#0A8F5C]">
                      {formatBRL(s.total)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        variant={
                          s.status === 'confirmada'
                            ? 'default'
                            : s.status === 'cancelada'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {formatDateBR(s.created)}
                    </td>
                  </tr>
                ))}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-400">
                      Nenhuma venda localizada para o período e filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
              {currentFilteredData.length > 0 && (
                <tfoot className="border-t-2 font-bold bg-gray-50/80 print:bg-white">
                  <tr>
                    <td colSpan={4} className="py-2.5 px-3">
                      Total ({currentFilteredData.length} vendas):
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatBRL(
                        currentFilteredData.reduce(
                          (acc, s: SaleRecord) => acc + (s.subtotal || s.total),
                          0,
                        ),
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-600">
                      -{' '}
                      {formatBRL(
                        currentFilteredData.reduce(
                          (acc, s: SaleRecord) => acc + (s.total_discount || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#0A8F5C]">
                      {formatBRL(
                        currentFilteredData.reduce((acc, s: SaleRecord) => acc + (s.total || 0), 0),
                      )}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 2: PAGAMENTOS POR MODALIDADE (Pix, Dinheiro, Cartões) */}
        {/* ============================================================== */}
        {reportType === 'pagamentos' && (
          <div className="space-y-4">
            {/* Cards consolidados por modalidade */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
              {['pix', 'dinheiro', 'cartao_credito', 'cartao_debito'].map((m) => {
                const totalMod = currentFilteredData
                  .filter((p: SalePaymentRecord) => p.method === m)
                  .reduce((acc, p: SalePaymentRecord) => acc + (p.amount || 0), 0)
                const countMod = currentFilteredData.filter(
                  (p: SalePaymentRecord) => p.method === m,
                ).length
                return (
                  <div key={m} className="p-3 border rounded-lg bg-gray-50/50 print:bg-white">
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">
                      {m.replace('_', ' ')}
                    </span>
                    <p className="text-base font-bold text-gray-900 mt-0.5">
                      {formatBRL(totalMod)}
                    </p>
                    <p className="text-[11px] text-gray-400">{countMod} transações</p>
                  </div>
                )
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Venda</th>
                    <th className="py-2.5 px-3 font-semibold">Cliente</th>
                    <th className="py-2.5 px-3 font-semibold">Unidade</th>
                    <th className="py-2.5 px-3 font-semibold">Modalidade</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Valor</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Confirmado</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentFilteredData.map((p: SalePaymentRecord) => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-mono font-bold">
                        {p.expand?.sale?.number || '-'}
                      </td>
                      <td className="py-2 px-3">
                        {p.expand?.sale?.expand?.customer?.name || 'Balcão'}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {p.expand?.sale?.expand?.store?.name || '-'}
                      </td>
                      <td className="py-2 px-3 font-medium capitalize">
                        {p.method.replace('_', ' ')}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-[#0A8F5C]">
                        {formatBRL(p.amount)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge
                          variant={p.confirmed ? 'default' : 'outline'}
                          className="text-[10px]"
                        >
                          {p.confirmed ? 'Confirmado' : 'Pendente'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {formatDateBR(p.created)}
                      </td>
                    </tr>
                  ))}
                  {currentFilteredData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        Nenhum pagamento registrado no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 3: ESTOQUE POR UNIDADE                               */}
        {/* ============================================================== */}
        {reportType === 'estoque' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Produto</th>
                  <th className="py-2.5 px-3 font-semibold">SKU</th>
                  <th className="py-2.5 px-3 font-semibold">Variação</th>
                  <th className="py-2.5 px-3 font-semibold">Unidade</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Saldo em Estoque</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Estoque Mínimo</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentFilteredData.map((st: StockItemRecord) => {
                  const min = st.expand?.product?.min_stock || 0
                  const isLow = st.quantity <= min
                  return (
                    <tr key={st.id} className="hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-medium text-gray-900">
                        {st.expand?.product?.name || '-'}
                      </td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">
                        {st.expand?.product?.sku || '-'}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {st.expand?.variant?.name || '-'}
                      </td>
                      <td className="py-2 px-3">{st.expand?.store?.name || '-'}</td>
                      <td className="py-2 px-3 text-center font-bold text-sm">{st.quantity} un.</td>
                      <td className="py-2 px-3 text-center text-muted-foreground">{min} un.</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={isLow ? 'destructive' : 'outline'} className="text-[10px]">
                          {isLow ? 'Estoque Baixo' : 'Normal'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      Nenhum item em estoque para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 4: MOVIMENTAÇÕES E TRANSFERÊNCIAS                   */}
        {/* ============================================================== */}
        {reportType === 'movimentacoes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Data</th>
                  <th className="py-2.5 px-3 font-semibold">Tipo</th>
                  <th className="py-2.5 px-3 font-semibold">Produto</th>
                  <th className="py-2.5 px-3 font-semibold">Unidade</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Quantidade</th>
                  <th className="py-2.5 px-3 font-semibold">Responsável</th>
                  <th className="py-2.5 px-3 font-semibold">Motivo / Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentFilteredData.map((m: StockMovementRecord) => (
                  <tr key={m.id} className="hover:bg-gray-50/50">
                    <td className="py-2 px-3 text-muted-foreground">
                      {formatDateBR(m.date || m.created)}
                    </td>
                    <td className="py-2 px-3 font-semibold uppercase text-[10px]">
                      <Badge variant="outline" className="capitalize">
                        {m.type.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 font-medium">{m.expand?.product?.name || '-'}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {m.expand?.store?.name || '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-bold">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity} un.
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {m.expand?.user?.name || '-'}
                    </td>
                    <td className="py-2 px-3 text-gray-600 truncate max-w-xs">{m.reason || '-'}</td>
                  </tr>
                ))}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      Nenhuma movimentação de estoque encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 5: COMISSÕES (VENDEDOR, LOJA, SITUAÇÃO)             */}
        {/* ============================================================== */}
        {reportType === 'comissoes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Vendedor</th>
                  <th className="py-2.5 px-3 font-semibold">Venda</th>
                  <th className="py-2.5 px-3 font-semibold">Unidade</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Base de Cálculo</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Taxa</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Comissão (R$)</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Situação</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Competência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentFilteredData.map((c: CommissionRecord) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="py-2 px-3 font-medium">{c.expand?.seller?.name || '-'}</td>
                    <td className="py-2 px-3 font-mono">{c.expand?.sale?.number || '-'}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {c.expand?.store?.name || '-'}
                    </td>
                    <td className="py-2 px-3 text-right">{formatBRL(c.base_amount)}</td>
                    <td className="py-2 px-3 text-center">{c.rate}%</td>
                    <td className="py-2 px-3 text-right font-bold text-[#0A8F5C]">
                      {formatBRL(c.value)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        variant={
                          c.status === 'paga'
                            ? 'default'
                            : c.status === 'estornada'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-[10px] capitalize"
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">
                      {formatDateBR(c.competence_date || c.created)}
                    </td>
                  </tr>
                ))}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Nenhuma comissão registrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
              {currentFilteredData.length > 0 && (
                <tfoot className="border-t-2 font-bold bg-gray-50/80 print:bg-white">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3">
                      Total Comissões:
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#0A8F5C]">
                      {formatBRL(
                        currentFilteredData.reduce(
                          (acc, c: CommissionRecord) => acc + (c.value || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 6: DESPESAS DETALHADAS POR CATEGORIA / SUBCATEGORIA  */}
        {/* ============================================================== */}
        {reportType === 'despesas' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Descrição</th>
                  <th className="py-2.5 px-3 font-semibold">Categoria</th>
                  <th className="py-2.5 px-3 font-semibold">Subcategoria</th>
                  <th className="py-2.5 px-3 font-semibold">Unidade / Alocação</th>
                  <th className="py-2.5 px-3 font-semibold">Favorecido / Fornecedor</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Valor</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Competência</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentFilteredData.map((t: FinancialTransactionRecord) => (
                  <tr key={t.id} className="hover:bg-gray-50/50">
                    <td className="py-2 px-3 font-medium text-gray-900">{t.description}</td>
                    <td className="py-2 px-3">{t.expand?.category?.name || 'Geral'}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {t.expand?.category?.subcategory || '-'}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {t.expand?.store?.name || t.store_allocation || 'Compartilhado'}
                    </td>
                    <td className="py-2 px-3 text-gray-700">{t.recipient_supplier || '-'}</td>
                    <td className="py-2 px-3 text-right font-bold text-red-600">
                      {formatBRL(t.amount)}
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">
                      {formatDateBR(t.competence_date)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        variant={t.status === 'pago' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Nenhuma despesa encontrada para os parâmetros informados.
                    </td>
                  </tr>
                )}
              </tbody>
              {currentFilteredData.length > 0 && (
                <tfoot className="border-t-2 font-bold bg-gray-50/80 print:bg-white">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3">
                      Total Despesas:
                    </td>
                    <td className="py-2.5 px-3 text-right text-red-600">
                      {formatBRL(
                        currentFilteredData.reduce(
                          (acc, t: FinancialTransactionRecord) => acc + (t.amount || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 7: CONTAS A PAGAR E A RECEBER (INCLUINDO VENCIDOS)  */}
        {/* ============================================================== */}
        {reportType === 'contas' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Tipo</th>
                  <th className="py-2.5 px-3 font-semibold">Descrição</th>
                  <th className="py-2.5 px-3 font-semibold">Favorecido / Cliente</th>
                  <th className="py-2.5 px-3 font-semibold">Unidade</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Valor</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Vencimento</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Situação</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentFilteredData.map((t: FinancialTransactionRecord) => {
                  const todayStr = new Date().toISOString().split('T')[0]
                  const isLate = t.status !== 'pago' && t.due_date < todayStr
                  const isPayable =
                    t.type === 'despesa' || t.type === 'compra_estoque' || t.type === 'retirada'
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-semibold">
                        <Badge variant={isPayable ? 'outline' : 'default'} className="text-[10px]">
                          {isPayable ? 'A Pagar' : 'A Receber'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-medium">{t.description}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {t.recipient_supplier || '-'}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {t.expand?.store?.name || '-'}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          isPayable ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {formatBRL(t.amount)}
                      </td>
                      <td className="py-2 px-3 text-center">{formatDateBR(t.due_date)}</td>
                      <td className="py-2 px-3 text-center capitalize">{t.status}</td>
                      <td className="py-2 px-3 text-center">
                        {isLate ? (
                          <Badge variant="destructive" className="text-[10px]">
                            VENCIDO
                          </Badge>
                        ) : t.status === 'pago' ? (
                          <span className="text-emerald-600 font-semibold">Liquidado</span>
                        ) : (
                          <span className="text-gray-500">A vencer</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      Nenhuma obrigação financeira para a data de vencimento filtrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 8: FLUXO DE CAIXA POR PERÍODO                       */}
        {/* ============================================================== */}
        {reportType === 'fluxo_caixa' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 border-b print:bg-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Data Liquidação</th>
                  <th className="py-2.5 px-3 font-semibold">Movimento</th>
                  <th className="py-2.5 px-3 font-semibold">Descrição</th>
                  <th className="py-2.5 px-3 font-semibold">Conta Financeira</th>
                  <th className="py-2.5 px-3 font-semibold">Forma de Pagamento</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Entrada (+)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Saída (-)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentFilteredData.map((t: FinancialTransactionRecord) => {
                  const isEntry = t.type === 'receita_venda' || t.type === 'aporte'
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-medium">
                        {formatDateBR(t.payment_date || t.due_date)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={isEntry ? 'default' : 'secondary'} className="text-[10px]">
                          {isEntry ? 'Entrada' : 'Saída'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-medium text-gray-900">{t.description}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {t.expand?.account?.name || '-'}
                      </td>
                      <td className="py-2 px-3 capitalize">{t.payment_method || '-'}</td>
                      <td className="py-2 px-3 text-right font-bold text-[#0A8F5C]">
                        {isEntry ? formatBRL(t.amount) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-red-600">
                        {!isEntry ? formatBRL(t.amount) : '-'}
                      </td>
                    </tr>
                  )
                })}
                {currentFilteredData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      Nenhuma movimentação liquidada encontrada no fluxo de caixa do período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ============================================================== */}
        {/* RELATÓRIO 9: DEMONSTRATIVO MENSAL (DRE GERENCIAL)             */}
        {/* ============================================================== */}
        {reportType === 'demonstrativo' && dreData && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="border rounded-xl p-5 bg-card space-y-3">
              <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground border-b pb-2">
                Demonstrativo de Resultado do Período (Regime de Competência)
              </h4>

              <div className="divide-y text-xs sm:text-sm">
                <div className="flex justify-between py-2">
                  <span className="font-semibold text-gray-800">
                    (+) Receita Bruta de Vendas ({dreData.salesCount} vendas confirmadas)
                  </span>
                  <span className="font-bold text-[#0A8F5C]">
                    {formatBRL(dreData.grossRevenue)}
                  </span>
                </div>

                <div className="flex justify-between py-2 text-muted-foreground">
                  <span>(-) Descontos Concedidos em Vendas</span>
                  <span className="text-red-500">- {formatBRL(dreData.discounts)}</span>
                </div>

                <div className="flex justify-between py-2.5 font-bold bg-gray-50/70 px-2 rounded">
                  <span>(=) RECEITA OPERACIONAL LÍQUIDA</span>
                  <span className="text-gray-900">{formatBRL(dreData.netRevenue)}</span>
                </div>

                <div className="flex justify-between py-2 text-muted-foreground">
                  <span>(-) Devoluções de Mercadorias e Vendas Canceladas</span>
                  <span className="text-red-500">- {formatBRL(dreData.returnsValue)}</span>
                </div>

                <div className="flex justify-between py-2 text-muted-foreground">
                  <span>(-) Custo de Mercadorias / Compra de Estoque (CMV)</span>
                  <span className="text-red-500">- {formatBRL(dreData.stockPurchases)}</span>
                </div>

                <div className="flex justify-between py-2 text-muted-foreground">
                  <span>(-) Despesas Operacionais (Aluguel, Estrutura, Marketing)</span>
                  <span className="text-red-500">- {formatBRL(dreData.operationalExpenses)}</span>
                </div>

                <div className="flex justify-between py-2 text-muted-foreground">
                  <span>(-) Comissões da Equipe de Vendas</span>
                  <span className="text-red-500">- {formatBRL(dreData.periodCommissions)}</span>
                </div>

                <div
                  className={`flex justify-between py-3 font-bold text-base border-t-2 px-2 rounded mt-2 ${
                    dreData.netOperatingResult >= 0
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  <span>(=) RESULTADO OPERACIONAL LÍQUIDO</span>
                  <span>{formatBRL(dreData.netOperatingResult)}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center italic">
              * O demonstrativo reflete a competência contábil-gerencial do período, apurado
              separadamente do fluxo financeiro de caixa.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

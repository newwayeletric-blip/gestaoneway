import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Search,
  Send,
  UserPlus,
  AlertTriangle,
  CreditCard,
  Banknote,
  QrCode,
  ShieldAlert,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  ProductsService,
  CustomersService,
  StockService,
  SalesService,
  StoresService,
  SettingsService,
} from '@/services/api'
import type {
  ProductRecord,
  ProductVariantRecord,
  CustomerRecord,
  StockItemRecord,
  StoreRecord,
  PaymentMethod,
  SaleStatus,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import { SaleReceipt } from '@/components/SaleReceipt'

interface CartItem {
  id: string
  product: ProductRecord
  variant?: ProductVariantRecord
  quantity: number
  sale_price: number
  cost_price: number
  discount: number
  serial_number?: string
  stockAvailable: number
  commission_rate?: number
}

interface PaymentEntry {
  id: string
  method: PaymentMethod
  amount: number
  received_amount?: number
  change_amount?: number
  installments: number
  installment_value: number
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
}

export function NewSale() {
  const navigate = useNavigate()
  const { user, isAdmin, organization } = useAuth()
  const salesPath = isAdmin ? '/vendas' : '/minhas-vendas'

  // Data states
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [stockItems, setStockItems] = useState<StockItemRecord[]>([])

  // Selection states
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([])
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false)
  const [notes, setNotes] = useState('')

  // Payments array (mixed payment supported)
  const [payments, setPayments] = useState<PaymentEntry[]>([])

  // Modal new payment
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [newPayMethod, setNewPayMethod] = useState<PaymentMethod>('pix')
  const [newPayAmount, setNewPayAmount] = useState<number>(0)
  const [newPayCashGiven, setNewPayCashGiven] = useState<number>(0)
  const [newPayInstallments, setNewPayInstallments] = useState<number>(1)

  // Limites da organização (Configurações): desconto por forma de pagamento e
  // parcelas. Sem limite configurado, qualquer desconto passa pelo administrador.
  const [discountLimits, setDiscountLimits] = useState<Partial<Record<PaymentMethod, number>>>({})
  const [maxInstallmentsLimit, setMaxInstallmentsLimit] = useState<number>(12)
  const [discountReason, setDiscountReason] = useState('')

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerDoc, setNewCustomerDoc] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')

  // Authorization for pending balance
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authReason, setAuthReason] = useState('')

  // Envio: a chave de idempotência evita venda duplicada no duplo clique ou
  // no reenvio depois de uma queda de conexão; muda a cada venda nova.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID())
  const [completedSale, setCompletedSale] = useState<{
    id: string
    number: string
    status: SaleStatus
  } | null>(null)

  // Load Initial Data
  useEffect(() => {
    async function init() {
      try {
        const [storesList, prodsList] = await Promise.all([
          StoresService.list(),
          ProductsService.list("status = 'ativo'"),
        ])
        // O vendedor vende só nas lojas do cadastro dele (o servidor também
        // confere); mesma regra das lojas autorizadas do topo.
        const allowed =
          isAdmin || !user?.stores?.length
            ? storesList
            : storesList.filter((s) => user?.stores?.includes(s.id))
        setStores(allowed)
        setProducts(prodsList)

        if (allowed.length > 0) {
          setSelectedStoreId((allowed.find((s) => user?.stores?.includes(s.id)) || allowed[0]).id)
        }

        // Mesmas chaves que a tela de Configurações grava e o servidor confere.
        const settings = await SettingsService.getAll()
        const limits: Partial<Record<PaymentMethod, number>> = {}
        for (const method of Object.keys(METHOD_LABELS) as PaymentMethod[]) {
          const value = parseFloat(settings[`max_discount_${method}`])
          if (!isNaN(value) && value >= 0) limits[method] = value
        }
        setDiscountLimits(limits)
        setMaxInstallmentsLimit(parseInt(settings.max_installments_cartao_credito, 10) || 12)
      } catch (err: any) {
        toast({
          title: 'Erro ao carregar dados da venda',
          description: err.message,
          variant: 'destructive',
        })
      }
    }
    init()
  }, [user, isAdmin])

  // Load stock when store changes
  useEffect(() => {
    if (!selectedStoreId) return
    StockService.listByStore(selectedStoreId)
      .then(setStockItems)
      .catch((err) => console.error('Erro ao buscar estoque:', err))
  }, [selectedStoreId])

  // Customer Search
  useEffect(() => {
    if (customerSearch.trim().length < 2) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true)
      try {
        const res = await CustomersService.list(customerSearch, 1, 5)
        setCustomerResults(res.items)
      } catch (err) {
        console.error(err)
      } finally {
        setIsSearchingCustomer(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  // Totals calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.sale_price * item.quantity, 0)
  }, [cart])

  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.discount, 0)
  }, [cart])

  const total = useMemo(() => {
    return Math.max(0, subtotal - totalDiscount)
  }, [subtotal, totalDiscount])

  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amount, 0)
  }, [payments])

  const remainingBalance = useMemo(() => {
    return Math.max(0, Number((total - totalPaid).toFixed(2)))
  }, [total, totalPaid])

  const isExactPayment = useMemo(() => {
    return Math.round(totalPaid * 100) === Math.round(total * 100) && total > 0
  }, [totalPaid, total])

  // O limite de desconto vem da forma de pagamento principal (a de maior
  // valor), como o servidor confere. Acima dele, o administrador decide.
  const mainMethod = useMemo<PaymentMethod>(() => {
    let main: PaymentEntry | null = null
    for (const p of payments) if (!main || p.amount > main.amount) main = p
    return main ? main.method : 'pix'
  }, [payments])
  const discountLimit = discountLimits[mainMethod]
  const discountPercent = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0
  const isDiscountOverLimit =
    totalDiscount > 0 &&
    (discountLimit === undefined ||
      Math.round(totalDiscount * 100) > Math.round(subtotal * discountLimit))

  // Add product to cart
  const handleAddToCart = (product: ProductRecord, variant?: ProductVariantRecord) => {
    if (!selectedStoreId) {
      toast({ title: 'Selecione a loja da venda primeiro', variant: 'destructive' })
      return
    }

    const stock = stockItems.find(
      (s) => s.product === product.id && (variant ? s.variant === variant.id : !s.variant),
    )
    const stockQty = stock ? stock.quantity : 0

    const cartKey = variant ? `${product.id}-${variant.id}` : product.id
    const existing = cart.find((i) => i.id === cartKey)
    const currentQtyInCart = existing ? existing.quantity : 0

    if (currentQtyInCart + 1 > stockQty) {
      toast({
        title: 'Estoque insuficiente',
        description: `Disponível na loja: ${stockQty} unidade(s).`,
        variant: 'destructive',
      })
      return
    }

    const price = variant ? variant.sale_price : product.sale_price
    const cost = (variant ? variant.cost_price : product.cost_price) || 0
    const commRate = variant?.commission_rate || product.commission_rate

    if (existing) {
      setCart((prev) =>
        prev.map((i) => (i.id === cartKey ? { ...i, quantity: i.quantity + 1 } : i)),
      )
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: cartKey,
          product,
          variant,
          quantity: 1,
          sale_price: price,
          cost_price: cost,
          discount: 0,
          stockAvailable: stockQty,
          commission_rate: commRate,
        },
      ])
    }
  }

  const handleUpdateQuantity = (id: string, delta: number) => {
    setCart(
      (prev) =>
        prev
          .map((item) => {
            if (item.id === id) {
              const newQty = item.quantity + delta
              if (newQty <= 0) return null
              if (newQty > item.stockAvailable) {
                toast({
                  title: 'Estoque insuficiente',
                  description: `Disponível: ${item.stockAvailable}`,
                  variant: 'destructive',
                })
                return item
              }
              return { ...item, quantity: newQty }
            }
            return item
          })
          .filter(Boolean) as CartItem[],
    )
  }

  // O desconto não é travado aqui: acima do limite, a venda vai para o
  // administrador com o motivo escrito pelo vendedor.
  const handleUpdateDiscount = (id: string, val: number) => {
    const item = cart.find((i) => i.id === id)
    if (!item) return
    const gross = item.sale_price * item.quantity
    const discount = Math.min(Math.max(0, val), gross)
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, discount } : i)))
  }

  const handleRemoveCartItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id))
  }

  // Open add payment modal
  const handleOpenAddPayment = () => {
    setNewPayMethod('pix')
    setNewPayAmount(remainingBalance > 0 ? remainingBalance : 0)
    setNewPayCashGiven(remainingBalance > 0 ? remainingBalance : 0)
    setNewPayInstallments(1)
    setIsPaymentModalOpen(true)
  }

  // Confirm adding a payment entry
  const handleAddPaymentConfirm = () => {
    if (newPayAmount <= 0) {
      toast({ title: 'Valor do pagamento deve ser maior que zero', variant: 'destructive' })
      return
    }

    if (Math.round((totalPaid + newPayAmount) * 100) > Math.round(total * 100)) {
      toast({
        title: 'Valor acima do total da venda',
        description: `Falta receber ${formatBRL(remainingBalance)}. O troco do dinheiro é calculado à parte.`,
        variant: 'destructive',
      })
      return
    }

    let receivedAmount: number | undefined = undefined
    let changeAmount: number | undefined = undefined
    let installmentValue = newPayAmount

    if (newPayMethod === 'dinheiro') {
      if (newPayCashGiven < newPayAmount) {
        toast({
          title: 'Valor entregue insuficiente',
          description:
            'O valor entregue em dinheiro deve ser maior ou igual ao valor aplicado à compra.',
          variant: 'destructive',
        })
        return
      }
      receivedAmount = newPayCashGiven
      changeAmount = Number((newPayCashGiven - newPayAmount).toFixed(2))
    }

    if (newPayMethod === 'cartao_credito') {
      if (newPayInstallments > maxInstallmentsLimit) {
        toast({
          title: 'Parcelamento acima do limite',
          description: `Limite máximo de parcelamento configurado: ${maxInstallmentsLimit}x`,
          variant: 'destructive',
        })
        return
      }
      installmentValue = Number((newPayAmount / newPayInstallments).toFixed(2))
    }

    // A taxa da maquininha só entra com a tabela cadastrada (Fase 2).
    const newEntry: PaymentEntry = {
      id: Math.random().toString(36).substring(2, 9),
      method: newPayMethod,
      amount: newPayAmount,
      received_amount: receivedAmount,
      change_amount: changeAmount,
      installments: newPayMethod === 'cartao_credito' ? newPayInstallments : 1,
      installment_value: installmentValue,
    }

    setPayments((prev) => [...prev, newEntry])
    setIsPaymentModalOpen(false)
  }

  const handleRemovePayment = (id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  // Create new customer quick modal
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      toast({ title: 'Preencha nome e telefone do cliente', variant: 'destructive' })
      return
    }
    try {
      const created = await CustomersService.create({
        name: newCustomerName,
        phone: newCustomerPhone,
        document: newCustomerDoc,
        email: newCustomerEmail,
      })
      setSelectedCustomer(created)
      setIsCustomerModalOpen(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerDoc('')
      setNewCustomerEmail('')
      toast({ title: 'Cliente cadastrado com sucesso!' })
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar cliente',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Regra do dono: a venda do vendedor espera o administrador antes da NF.
  // O servidor reserva o estoque e numera a venda; a venda lançada pelo
  // administrador é aprovada em seguida.
  const handleFinalizeSale = async (allowPendingBalance = false) => {
    if (!selectedStoreId) {
      toast({ title: 'Selecione a loja da venda', variant: 'destructive' })
      return
    }
    if (!selectedCustomer) {
      toast({ title: 'Selecione ou cadastre o cliente', variant: 'destructive' })
      return
    }
    if (cart.length === 0) {
      toast({ title: 'Adicione ao menos um produto no carrinho', variant: 'destructive' })
      return
    }
    if (isDiscountOverLimit && !isAdmin && discountReason.trim().length < 5) {
      toast({
        title: 'Explique o desconto',
        description: 'Escreva o motivo do desconto acima do limite para o administrador.',
        variant: 'destructive',
      })
      return
    }
    // O administrador justifica o saldo pendente antes de confirmar (VEN-06).
    if (isAdmin && !isExactPayment && !allowPendingBalance) {
      setIsAuthModalOpen(true)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await SalesService.submitSale({
        idempotency_key: submissionKey,
        store: selectedStoreId,
        customer: selectedCustomer.id,
        observation: notes,
        discount_reason: isDiscountOverLimit ? discountReason.trim() : '',
        items: cart.map((i) => ({
          product: i.product.id,
          variant: i.variant?.id,
          quantity: i.quantity,
          discount: i.discount,
          serial_number: i.serial_number,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          installments: p.installments,
          received_amount: p.received_amount,
        })),
      })

      let status = res.status
      if (isAdmin && status === 'aguardando_aprovacao') {
        try {
          status = (
            await SalesService.approveSale(res.id, allowPendingBalance ? authReason.trim() : '')
          ).status
        } catch (err: any) {
          toast({
            title: `Venda ${res.number} enviada, mas não foi confirmada`,
            description: `${err.message} Abra a venda para aprovar.`,
            variant: 'destructive',
          })
        }
      }

      toast(
        status === 'confirmada'
          ? { title: `Venda ${res.number} confirmada` }
          : { title: `Venda ${res.number} enviada para aprovação` },
      )
      setCompletedSale({ id: res.id, number: res.number, status })
      setIsAuthModalOpen(false)
    } catch (err: any) {
      toast({
        title: 'A venda não foi registrada',
        description: err.message || 'Tente de novo.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const startNewSale = () => {
    setCompletedSale(null)
    setCart([])
    setPayments([])
    setSelectedCustomer(null)
    setNotes('')
    setDiscountReason('')
    setAuthReason('')
    setSubmissionKey(crypto.randomUUID())
    if (selectedStoreId) {
      StockService.listByStore(selectedStoreId)
        .then(setStockItems)
        .catch(() => {})
    }
  }

  // Venda enviada: aguardando o administrador (vendedor) ou já confirmada.
  if (completedSale && completedSale.status !== 'confirmada') {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
              <Clock className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl text-amber-800">
              Venda {completedSale.number} enviada para aprovação
            </CardTitle>
            <CardDescription className="text-amber-900">
              O produto já está reservado nesta loja. Avise o administrador.{' '}
              <strong>Não emita a nota fiscal antes da aprovação.</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate(`/vendas/${completedSale.id}`)}>
              Ver a venda
            </Button>
            <Button onClick={startNewSale}>
              <Plus className="mr-2 h-4 w-4" />
              Nova venda
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (completedSale) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate(salesPath)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Lista de Vendas
          </Button>
          <Button onClick={startNewSale}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Venda
          </Button>
        </div>

        <Card className="border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl text-emerald-700 dark:text-emerald-400">
              Venda {completedSale.number} confirmada
            </CardTitle>
            <CardDescription>
              Estoque baixado e comissão calculada. A nota fiscal já pode ser emitida e anexada na
              venda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SaleReceipt saleId={completedSale.id} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(salesPath)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nova Venda Balcão</h1>
            <p className="text-sm text-muted-foreground">
              {organization?.name || 'Venda no balcão'}
              {stores.length > 0 ? ` • ${stores.map((s) => s.name).join(', ')}` : ''}
            </p>
          </div>
        </div>

        {/* Store selector */}
        <div className="w-full sm:w-64">
          <Label className="text-xs text-muted-foreground mb-1 block">Unidade da Venda</Label>
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Products catalog & selection */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customer Selection Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  1. Identificação do Cliente
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setIsCustomerModalOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Novo Cliente
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40">
                  <div>
                    <p className="font-medium text-sm">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Tel: {selectedCustomer.phone}{' '}
                      {selectedCustomer.document && `• CPF/CNPJ: ${selectedCustomer.document}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-muted-foreground"
                  >
                    Alterar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, telefone ou CPF..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {isSearchingCustomer && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Buscando clientes...
                    </p>
                  )}

                  {customerResults.length > 0 && (
                    <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                      {customerResults.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 hover:bg-accent cursor-pointer flex justify-between items-center text-sm"
                          onClick={() => {
                            setSelectedCustomer(c)
                            setCustomerSearch('')
                            setCustomerResults([])
                          }}
                        >
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.phone} {c.document && `• ${c.document}`}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Selecionar
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Products Catalog selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                2. Catálogo de Produtos e Veículos
              </CardTitle>
              <CardDescription>
                Patinetes Navee e Segway Ninebot, scooters, bikes e acessórios em estoque na unidade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                {products.map((p) => {
                  const stock = stockItems.find((s) => s.product === p.id && !s.variant)
                  const qty = stock ? stock.quantity : 0
                  const isAvailable = qty > 0

                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isAvailable
                          ? 'hover:border-primary/50 hover:bg-accent/40 cursor-pointer'
                          : 'opacity-50 cursor-not-allowed bg-muted/20'
                      }`}
                      onClick={() => isAvailable && handleAddToCart(p)}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-medium text-sm line-clamp-1">{p.name}</p>
                        <Badge
                          variant={isAvailable ? 'secondary' : 'outline'}
                          className={`text-[10px] shrink-0 ${isAvailable ? 'text-emerald-600' : 'text-red-500'}`}
                        >
                          {isAvailable ? `${qty} em estoque` : 'Esgotado'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">SKU: {p.sku}</p>
                      <div className="flex justify-between items-end mt-2">
                        <span className="text-sm font-semibold text-primary">
                          {formatBRL(p.sale_price)}
                        </span>
                        {isAvailable && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Adicionar
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Cart, Mixed Payments and Checkout */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cart Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  Itens da Venda ({cart.length})
                </CardTitle>
                {cart.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCart([])}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                  Nenhum produto adicionado ao carrinho.
                </div>
              ) : (
                <div className="divide-y max-h-64 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium leading-none">
                            {item.variant
                              ? `${item.product.name} (${item.variant.name})`
                              : item.product.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBRL(item.sale_price)} un.
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={() => handleRemoveCartItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        {/* Quantity changer */}
                        <div className="flex items-center border rounded-md h-7">
                          <button
                            type="button"
                            className="px-2 text-xs hover:bg-muted"
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                          >
                            -
                          </button>
                          <span className="px-2 text-xs font-semibold">{item.quantity}</span>
                          <button
                            type="button"
                            className="px-2 text-xs hover:bg-muted"
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                          >
                            +
                          </button>
                        </div>

                        {/* Item discount */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">Desc:</span>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={item.discount || ''}
                            onChange={(e) =>
                              handleUpdateDiscount(item.id, parseFloat(e.target.value) || 0)
                            }
                            placeholder="0,00"
                            className="h-7 w-20 text-xs text-right"
                          />
                        </div>

                        {/* Item total */}
                        <span className="text-sm font-semibold">
                          {formatBRL(item.sale_price * item.quantity - item.discount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals Breakdown */}
              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatBRL(subtotal)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Desconto Total</span>
                    <span>- {formatBRL(totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-1 border-t">
                  <span>Total a Pagar</span>
                  <span className="text-primary">{formatBRL(total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payments Card (Mixed Payment Allowed) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">3. Formas de Pagamento</CardTitle>
                  <CardDescription className="text-xs">
                    Permite pagamento misto (Pix, Dinheiro, Débito e Crédito)
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAddPayment}
                  disabled={cart.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg">
                  Nenhum pagamento registrado. Clique em "+ Adicionar".
                </div>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {p.method === 'pix' && <QrCode className="h-4 w-4 text-emerald-600" />}
                        {p.method === 'dinheiro' && <Banknote className="h-4 w-4 text-amber-600" />}
                        {p.method === 'cartao_credito' && (
                          <CreditCard className="h-4 w-4 text-blue-600" />
                        )}
                        {p.method === 'cartao_debito' && (
                          <CreditCard className="h-4 w-4 text-indigo-600" />
                        )}
                        <div>
                          <p className="font-medium">
                            {METHOD_LABELS[p.method]}
                            {p.method === 'cartao_credito' &&
                              ` (${p.installments}x de ${formatBRL(p.installment_value)})`}
                          </p>
                          {p.method === 'dinheiro' && p.change_amount ? (
                            <p className="text-[11px] text-muted-foreground">
                              Entregue: {formatBRL(p.received_amount || 0)} • Troco:{' '}
                              {formatBRL(p.change_amount)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{formatBRL(p.amount)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={() => handleRemovePayment(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Balance status */}
              <div className="p-2.5 rounded-lg border bg-muted/30 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Registrado:</span>
                  <span className="font-semibold">{formatBRL(totalPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo Restante:</span>
                  <span
                    className={`font-bold ${
                      remainingBalance === 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {formatBRL(remainingBalance)}
                  </span>
                </div>
              </div>

              {!isAdmin && remainingBalance > 0 && payments.length > 0 && (
                <p className="text-[11px] text-amber-700">
                  Saldo pendente de {formatBRL(remainingBalance)}: o administrador decide ao aprovar
                  a venda.
                </p>
              )}

              {/* Desconto acima do limite: o administrador decide. */}
              {isDiscountOverLimit && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="flex gap-1.5 text-xs font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      Desconto de {discountPercent.toFixed(1).replace('.', ',')}%{' '}
                      {discountLimit === undefined
                        ? `sem limite configurado para ${METHOD_LABELS[mainMethod]}.`
                        : `acima do limite de ${discountLimit}% para ${METHOD_LABELS[mainMethod]}.`}{' '}
                      {isAdmin
                        ? 'Como administrador, você confirma direto.'
                        : 'O administrador vai analisar antes de aprovar.'}
                    </span>
                  </p>
                  {!isAdmin && (
                    <Textarea
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Motivo do desconto (o administrador vai ler)"
                      rows={2}
                      className="text-xs bg-white"
                    />
                  )}
                </div>
              )}

              {/* Observation field */}
              <div>
                <Label className="text-xs text-muted-foreground">Observações da Venda</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais, detalhes de garantia ou entrega..."
                  rows={2}
                  className="text-xs mt-1"
                />
              </div>

              {/* Action button */}
              <div className="pt-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={cart.length === 0 || !selectedCustomer || isSubmitting}
                  onClick={() => handleFinalizeSale(false)}
                >
                  {isSubmitting ? (
                    'Enviando...'
                  ) : !isAdmin ? (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar para aprovação
                    </>
                  ) : isExactPayment ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirmar venda
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Confirmar com saldo pendente
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                  {isAdmin
                    ? 'Na confirmação o estoque baixa e a comissão é calculada.'
                    : 'O produto fica reservado e a venda espera o administrador. A nota fiscal só depois da aprovação.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MODAL: ADD PAYMENT */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Forma de Pagamento</DialogTitle>
            <DialogDescription>
              Pagamento registrado manualmente. Não armazene dados sigilosos de cartão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Modalidade</Label>
              <Select
                value={newPayMethod}
                onValueChange={(val) => setNewPayMethod(val as PaymentMethod)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro Físico</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor Aplicado à Venda (R$)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={newPayAmount || ''}
                onChange={(e) => setNewPayAmount(parseFloat(e.target.value) || 0)}
                className="mt-1 font-semibold"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                Saldo restante da venda: {formatBRL(remainingBalance)}
              </p>
            </div>

            {/* Cash details */}
            {newPayMethod === 'dinheiro' && (
              <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <Label>Valor Entregue pelo Cliente (R$)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={newPayCashGiven || ''}
                  onChange={(e) => setNewPayCashGiven(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 100,00"
                />
                <div className="flex justify-between text-xs pt-1">
                  <span>Troco a devolver:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {formatBRL(Math.max(0, newPayCashGiven - newPayAmount))}
                  </span>
                </div>
              </div>
            )}

            {/* Credit card installments */}
            {newPayMethod === 'cartao_credito' && (
              <div className="space-y-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
                <div>
                  <Label>Parcelamento (Máx: {maxInstallmentsLimit}x)</Label>
                  <Select
                    value={String(newPayInstallments)}
                    onValueChange={(v) => setNewPayInstallments(parseInt(v, 10))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxInstallmentsLimit }, (_, i) => i + 1).map((n) => {
                        const instVal = newPayAmount > 0 ? (newPayAmount / n).toFixed(2) : '0.00'
                        return (
                          <SelectItem key={n} value={String(n)}>
                            {n}x de R$ {instVal} {n === 1 ? '(à vista)' : ''}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddPaymentConfirm}>Adicionar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: NEW CUSTOMER */}
      <Dialog open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateCustomer}>
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>
                Cadastre o cliente para vincular à venda e emissão de recibo/documentos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div>
                <Label>Nome Completo *</Label>
                <Input
                  required
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Telefone / WhatsApp *</Label>
                <Input
                  required
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="(41) 99999-9999"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>CPF ou CNPJ</Label>
                <Input
                  value={newCustomerDoc}
                  onChange={(e) => setNewCustomerDoc(e.target.value)}
                  placeholder="000.000.000-00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCustomerModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Cadastrar e Vincular</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: ADMIN AUTHORIZATION FOR PENDING BALANCE */}
      <Dialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Autorização de Saldo Pendente
            </DialogTitle>
            <DialogDescription>
              O total pago ({formatBRL(totalPaid)}) é inferior ao total da venda ({formatBRL(total)}
              ). O saldo pendente de {formatBRL(remainingBalance)} ficará registrado como contas a
              receber do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label>Justificativa Administrativa *</Label>
              <Textarea
                required
                value={authReason}
                onChange={(e) => setAuthReason(e.target.value)}
                placeholder="Ex: Pagamento da entrada realizado, restante a acertar na entrega ou boleto bancário..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAuthModalOpen(false)}>
              Voltar e Ajustar Pagamentos
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={authReason.trim().length < 5 || isSubmitting}
              onClick={() => handleFinalizeSale(true)}
            >
              Autorizar e Confirmar Venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

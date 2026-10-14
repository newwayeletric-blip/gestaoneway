import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  Plus,
  Trash2,
  Search,
  UserPlus,
  AlertTriangle,
  Receipt,
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
  FinancialService,
} from '@/services/api'
import type {
  ProductRecord,
  ProductVariantRecord,
  CustomerRecord,
  StockItemRecord,
  StoreRecord,
  PaymentMethod,
  FinancialAccountRecord,
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
  financial_account?: string
  card_tax_rate?: number
  card_tax_amount?: number
  net_amount?: number
}

export function NewSale() {
  const navigate = useNavigate()
  const { user, isProfile } = useAuth()
  const isAdmin = isProfile('admin')

  // Data states
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [stockItems, setStockItems] = useState<StockItemRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])

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
  const [newPayAccount, setNewPayAccount] = useState<string>('')

  // Settings for limits
  const [maxDiscountPercent, setMaxDiscountPercent] = useState<number>(10)
  const [maxInstallmentsLimit, setMaxInstallmentsLimit] = useState<number>(12)

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerDoc, setNewCustomerDoc] = useState('')
  const [newCustomerEmail, setNewCustomerEmail] = useState('')

  // Authorization for pending balance
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authReason, setAuthReason] = useState('')

  // Confirmation state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completedSale, setCompletedSale] = useState<{ id: string; number: string } | null>(null)

  // Load Initial Data
  useEffect(() => {
    async function init() {
      try {
        const [storesList, prodsList] = await Promise.all([
          StoresService.list(),
          ProductsService.list("status = 'ativo'"),
        ])
        setStores(storesList)
        setProducts(prodsList)

        if (storesList.length > 0) {
          const userStore =
            user?.stores && user.stores.length > 0 ? user.stores[0] : storesList[0].id
          setSelectedStoreId(userStore)
        }

        // Load settings
        const maxDisc = await SettingsService.get('max_discount_seller', '10')
        setMaxDiscountPercent(parseFloat(maxDisc) || 10)
        const maxInst = await SettingsService.get('max_installments', '12')
        setMaxInstallmentsLimit(parseInt(maxInst, 10) || 12)

        if (isAdmin) {
          const accs = await FinancialService.listAccounts()
          setAccounts(accs.filter((a) => a.active))
        }
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

  const handleUpdateDiscount = (id: string, val: number) => {
    const item = cart.find((i) => i.id === id)
    if (!item) return

    const maxAllowedDiscount = (item.sale_price * item.quantity * maxDiscountPercent) / 100
    if (!isAdmin && val > maxAllowedDiscount) {
      toast({
        title: 'Desconto acima do limite permitido',
        description: `Seu perfil de vendedor permite no máximo ${maxDiscountPercent}% de desconto (R$ ${maxAllowedDiscount.toFixed(2)}).`,
        variant: 'destructive',
      })
      return
    }

    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, discount: Math.max(0, val) } : i)))
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
    if (accounts.length > 0) {
      const matchStoreAcc = accounts.find((a) => a.store === selectedStoreId)
      setNewPayAccount(matchStoreAcc ? matchStoreAcc.id : accounts[0].id)
    }
    setIsPaymentModalOpen(true)
  }

  // Confirm adding a payment entry
  const handleAddPaymentConfirm = () => {
    if (newPayAmount <= 0) {
      toast({ title: 'Valor do pagamento deve ser maior que zero', variant: 'destructive' })
      return
    }

    let receivedAmount: number | undefined = undefined
    let changeAmount: number | undefined = undefined
    let installmentValue = newPayAmount
    let cardTaxRate = 0
    let cardTaxAmount = 0
    let netAmount = newPayAmount

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
      // Standard estimated fee rates for card receivables
      cardTaxRate = newPayInstallments === 1 ? 3.0 : 3.0 + (newPayInstallments - 1) * 0.8
      cardTaxAmount = Number(((newPayAmount * cardTaxRate) / 100).toFixed(2))
      netAmount = Number((newPayAmount - cardTaxAmount).toFixed(2))
    } else if (newPayMethod === 'cartao_debito') {
      cardTaxRate = 1.8
      cardTaxAmount = Number(((newPayAmount * cardTaxRate) / 100).toFixed(2))
      netAmount = Number((newPayAmount - cardTaxAmount).toFixed(2))
    }

    const newEntry: PaymentEntry = {
      id: Math.random().toString(36).substring(2, 9),
      method: newPayMethod,
      amount: newPayAmount,
      received_amount: receivedAmount,
      change_amount: changeAmount,
      installments: newPayInstallments,
      installment_value: installmentValue,
      financial_account: newPayAccount || undefined,
      card_tax_rate: cardTaxRate,
      card_tax_amount: cardTaxAmount,
      net_amount: netAmount,
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

  // Handle final sale confirmation
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

    // Check payment coverage
    if (!isExactPayment && !allowPendingBalance) {
      if (!isAdmin) {
        toast({
          title: 'Saldo pendente não autorizado',
          description: `Venda com saldo restante de ${formatBRL(remainingBalance)} exige autorização administrativa.`,
          variant: 'destructive',
        })
        return
      } else {
        // Admin can authorize or open authorization modal
        setIsAuthModalOpen(true)
        return
      }
    }

    // Submit sale to server
    setIsSubmitting(true)
    try {
      // 1. Create draft sale with items and payments
      const draft = await SalesService.createDraftSale(
        {
          customer: selectedCustomer.id,
          store: selectedStoreId,
          seller: user?.id,
          subtotal,
          total_discount: totalDiscount,
          total,
          observation: notes,
          authorized_by: allowPendingBalance ? user?.id : undefined,
          authorization_note: allowPendingBalance
            ? authReason || 'Saldo pendente autorizado pelo administrador'
            : undefined,
          payment: payments[0]?.method || 'pix',
          installments: payments[0]?.installments || 1,
        },
        cart.map((i) => ({
          product: i.product.id,
          variant: i.variant?.id,
          product_name: i.variant ? `${i.product.name} - ${i.variant.name}` : i.product.name,
          sku: i.variant ? i.variant.sku : i.product.sku,
          sale_price: i.sale_price,
          cost_price: i.cost_price,
          quantity: i.quantity,
          discount: i.discount,
          total: i.sale_price * i.quantity - i.discount,
          serial_number: i.serial_number,
        })),
        payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          received_amount: p.received_amount,
          change_amount: p.change_amount,
          installments: p.installments,
          installment_value: p.installment_value,
          financial_account: p.financial_account,
          card_tax_rate: p.card_tax_rate,
          card_tax_amount: p.card_tax_amount,
          net_amount: p.net_amount,
        })),
      )

      // 2. Call atomic confirmation endpoint on backend
      // Runs in PocketBase transaction: checks monthly closing, validates stock, decrements stock once,
      // writes stock movements, calculates commission item-by-item and creates audit log
      const confRes = await SalesService.confirmSale(draft.id)

      toast({
        title: 'Venda confirmada com sucesso!',
        description: `Venda ${confRes.number} registrada com baixa de estoque consistente.`,
      })

      setCompletedSale({ id: draft.id, number: confRes.number })
      setIsAuthModalOpen(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao confirmar venda',
        description: err.message || 'Falha ao processar confirmação.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // After sale completed modal / receipt
  if (completedSale) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/sales')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Lista de Vendas
          </Button>
          <Button
            onClick={() => {
              setCompletedSale(null)
              setCart([])
              setPayments([])
              setSelectedCustomer(null)
              setNotes('')
            }}
          >
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
              Venda {completedSale.number} Concluída!
            </CardTitle>
            <CardDescription>
              Estoque baixado com sucesso, comissões geradas e pagamentos registrados na tesouraria.
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nova Venda Balcão</h1>
            <p className="text-sm text-muted-foreground">
              New Way Eletric • Unidades Shopping Jockey Plaza e Loja Rua Cajuru
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
                          <p className="font-medium capitalize">
                            {p.method.replace('_', ' ')}
                            {p.method === 'cartao_credito' &&
                              ` (${p.installments}x de ${formatBRL(p.installment_value)})`}
                          </p>
                          {p.method === 'dinheiro' && p.change_amount ? (
                            <p className="text-[11px] text-muted-foreground">
                              Entregue: {formatBRL(p.received_amount || 0)} • Troco:{' '}
                              {formatBRL(p.change_amount)}
                            </p>
                          ) : null}
                          {p.net_amount && p.net_amount !== p.amount ? (
                            <p className="text-[10px] text-muted-foreground">
                              Taxa operadora: {p.card_tax_rate}% (líquido: {formatBRL(p.net_amount)}
                              )
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
                    'Processando Confirmação...'
                  ) : isExactPayment ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirmar Venda e Baixar Estoque
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      {isAdmin
                        ? 'Confirmar com Saldo Pendente (Admin)'
                        : 'Exige Autorização de Saldo'}
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                  Baixa de estoque e cálculo de comissão acontecem na confirmação com controle de
                  concorrência.
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
                <p className="text-[11px] text-muted-foreground">
                  Gera recebíveis da operadora no financeiro sem duplicar receita.
                </p>
              </div>
            )}

            {/* Financial account destination for admin */}
            {isAdmin && accounts.length > 0 && (
              <div>
                <Label>Conta Financeira de Destino</Label>
                <Select value={newPayAccount} onValueChange={setNewPayAccount}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione caixa ou conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type.replace('_', ' ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              disabled={!authReason.trim() || isSubmitting}
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

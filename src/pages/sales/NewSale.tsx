import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  CustomersService,
  ProductsService,
  StockService,
  SettingsService,
  SalesService,
} from '@/services/api'
import type { CustomerRecord, ProductRecord, ProductVariantRecord, StockItemRecord } from '@/types'
import { formatBRL, normalizePhone, normalizeDocument } from '@/lib/formatters'
import {
  UserCheck,
  Search,
  UserPlus,
  Package,
  ShoppingCart,
  Trash2,
  AlertCircle,
  CreditCard,
  DollarSign,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Loader2,
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { SaleReceipt } from '@/components/SaleReceipt'

interface CartItem {
  productId: string
  variantId?: string
  name: string
  sku: string
  unitPrice: number
  costPrice?: number
  quantity: number
  discount: number
  total: number
  trackSerial: boolean
  serialNumber?: string
  availableStock: number
}

export default function NewSale() {
  const { user, activeStoreId, authorizedStores, stores } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Current store for this sale
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    activeStoreId || authorizedStores[0]?.id || '',
  )

  // Step 1: Customer search & selection
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null)
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [isDuplicateAlertOpen, setIsDuplicateAlertOpen] = useState(false)
  const [duplicateCustomerFound, setDuplicateCustomerFound] = useState<CustomerRecord | null>(null)

  // Quick Customer Form
  const [newCustName, setNewCustName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustDoc, setNewCustDoc] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustAddress, setNewCustAddress] = useState('')

  // Step 2: Products & Cart
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})

  // Commercial Rules from Settings
  const [limits, setLimits] = useState({
    maxPix: 10,
    maxCash: 10,
    maxCard: 5,
    maxInstallments: 12,
  })

  // Step 3: Payment
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro' | 'cartao_credito'>('pix')
  const [installments, setInstallments] = useState(1)
  const [saleObservation, setSaleObservation] = useState('')

  // Confirmation state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedSaleData, setConfirmedSaleData] = useState<any | null>(null)

  // Load products, stock, and settings
  useEffect(() => {
    const init = async () => {
      try {
        const [prods, stockItems, setts] = await Promise.all([
          ProductsService.getAll("status = 'ativo'"),
          StockService.getStockItems(selectedStoreId),
          SettingsService.getAll(),
        ])
        setProducts(prods)

        // Map stock quantities by product+variant
        const sMap: Record<string, number> = {}
        for (const it of stockItems) {
          const key = it.variant ? `${it.product}_${it.variant}` : `${it.product}`
          sMap[key] = (sMap[key] || 0) + it.quantity
        }
        setStockMap(sMap)

        setLimits({
          maxPix: Number(setts.max_discount_pix || 10),
          maxCash: Number(setts.max_discount_dinheiro || 10),
          maxCard: Number(setts.max_discount_cartao_credito || 5),
          maxInstallments: Number(setts.max_installments_cartao_credito || 12),
        })
      } catch (err) {
        console.error('Error loading sale prerequisites:', err)
      }
    }
    init()
  }, [selectedStoreId])

  // Customer search debounced
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await CustomersService.getAll(customerSearch)
        setCustomerResults(res)
      } catch {
        // ignore
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [customerSearch])

  // Handle Quick Customer Registration with Duplicate Warning
  const handleQuickCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustName.trim() || !newCustPhone.trim()) {
      toast({
        title: 'Atenção',
        description: 'Nome e telefone são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    const normPhone = normalizePhone(newCustPhone)
    const normDoc = normalizeDocument(newCustDoc)

    // Duplicate check
    const existing = await CustomersService.checkDuplicate(normPhone, normDoc)
    if (existing.length > 0 && !isDuplicateAlertOpen) {
      setDuplicateCustomerFound(existing[0])
      setIsDuplicateAlertOpen(true)
      return
    }

    try {
      const created = await CustomersService.create({
        name: newCustName.trim(),
        phone: normPhone,
        document: normDoc || undefined,
        email: newCustEmail.trim() || undefined,
        address: newCustAddress.trim() || undefined,
        created_by: user?.id,
      })

      setSelectedCustomer(created)
      setIsCustomerModalOpen(false)
      setIsDuplicateAlertOpen(false)
      setNewCustName('')
      setNewCustPhone('')
      setNewCustDoc('')
      setNewCustEmail('')
      setNewCustAddress('')

      toast({ title: 'Cliente cadastrado e selecionado com sucesso!' })
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar cliente',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Add product to cart
  const handleAddToCart = async (prod: ProductRecord) => {
    // Check if product has variants
    const variants = await ProductsService.getVariants(prod.id)
    let chosenVariant: ProductVariantRecord | undefined = undefined

    if (variants.length > 0) {
      // Pick first or default variant
      chosenVariant = variants[0] as unknown as ProductVariantRecord
    }

    const stockKey = chosenVariant ? `${prod.id}_${chosenVariant.id}` : `${prod.id}`
    const available = stockMap[stockKey] || 0

    if (available <= 0) {
      toast({
        title: 'Estoque Esgotado!',
        description: `O produto "${prod.name}" não possui unidades disponíveis na loja selecionada.`,
        variant: 'destructive',
      })
      return
    }

    const price = chosenVariant?.sale_price || prod.sale_price
    const cost = chosenVariant?.cost_price || prod.cost_price

    // Check if already in cart
    const existingIdx = cart.findIndex(
      (c) => c.productId === prod.id && c.variantId === (chosenVariant?.id || undefined),
    )

    if (existingIdx >= 0) {
      const current = cart[existingIdx]
      if (current.quantity + 1 > available) {
        toast({
          title: 'Limite de Estoque',
          description: `Disponível em estoque: apenas ${available} unidades.`,
          variant: 'destructive',
        })
        return
      }
      const updated = [...cart]
      updated[existingIdx].quantity += 1
      updated[existingIdx].total =
        updated[existingIdx].quantity * updated[existingIdx].unitPrice -
        updated[existingIdx].discount
      setCart(updated)
    } else {
      const newItem: CartItem = {
        productId: prod.id,
        variantId: chosenVariant?.id,
        name: chosenVariant ? `${prod.name} (${chosenVariant.name})` : prod.name,
        sku: chosenVariant?.sku || prod.sku,
        unitPrice: price,
        costPrice: cost,
        quantity: 1,
        discount: 0,
        total: price,
        trackSerial: prod.track_serial,
        availableStock: available,
      }
      setCart([...cart, newItem])
    }
  }

  // Cart operations
  const updateQuantity = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(idx)
      return
    }
    const item = cart[idx]
    if (newQty > item.availableStock) {
      toast({
        title: 'Estoque insuficiente',
        description: `Disponível na loja: apenas ${item.availableStock} un.`,
        variant: 'destructive',
      })
      return
    }
    const updated = [...cart]
    updated[idx].quantity = newQty
    updated[idx].total = newQty * updated[idx].unitPrice - updated[idx].discount
    setCart(updated)
  }

  const updateDiscount = (idx: number, discValue: number) => {
    const item = cart[idx]
    const subtotal = item.quantity * item.unitPrice

    // Validate discount against limits
    let maxAllowedPct = limits.maxPix
    if (paymentMethod === 'dinheiro') maxAllowedPct = limits.maxCash
    if (paymentMethod === 'cartao_credito') maxAllowedPct = limits.maxCard

    const maxAllowedReais = (subtotal * maxAllowedPct) / 100

    if (discValue > maxAllowedReais) {
      toast({
        title: 'Desconto não autorizado!',
        description: `O desconto máximo permitido para ${paymentMethod.toUpperCase()} é ${maxAllowedPct}% (${formatBRL(maxAllowedReais)}).`,
        variant: 'destructive',
      })
      return
    }

    const updated = [...cart]
    updated[idx].discount = discValue
    updated[idx].total = subtotal - discValue
    setCart(updated)
  }

  const updateSerialNumber = (idx: number, serial: string) => {
    const updated = [...cart]
    updated[idx].serialNumber = serial
    setCart(updated)
  }

  const removeFromCart = (idx: number) => {
    const updated = cart.filter((_, i) => i !== idx)
    setCart(updated)
  }

  // Totals
  const subtotal = cart.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0)
  const totalDiscount = cart.reduce((acc, it) => acc + (it.discount || 0), 0)
  const finalTotal = subtotal - totalDiscount

  // Confirm Sale
  const handleConfirmSale = async (isDraft = false) => {
    if (!selectedCustomer) {
      toast({
        title: 'Atenção',
        description: 'Selecione ou cadastre o cliente antes de finalizar.',
        variant: 'destructive',
      })
      return
    }
    if (cart.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione pelo menos um produto.',
        variant: 'destructive',
      })
      return
    }

    // Check serial numbers for tracked products
    for (const it of cart) {
      if (it.trackSerial && !it.serialNumber && !isDraft) {
        toast({
          title: 'Número de Série Obrigatório',
          description: `Informe o número de série da unidade para o produto "${it.name}".`,
          variant: 'destructive',
        })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const sale = await SalesService.createSale({
        customer: selectedCustomer.id,
        store: selectedStoreId,
        seller: user!.id,
        items: cart.map((it) => ({
          product: it.productId,
          variant: it.variantId,
          product_name: it.name,
          sku: it.sku,
          sale_price: it.unitPrice,
          costPrice: it.costPrice,
          quantity: it.quantity,
          discount: it.discount,
          total: it.total,
          serial_number: it.serialNumber,
        })),
        subtotal: subtotal,
        total_discount: totalDiscount,
        total: finalTotal,
        payment: paymentMethod,
        allow_installments: paymentMethod === 'cartao_credito' && installments > 1,
        installments: installments,
        observation: saleObservation,
        isDraft: isDraft,
      })

      const fullStore = stores.find((s) => s.id === selectedStoreId)

      setConfirmedSaleData({
        sale: sale,
        items: cart,
        customer: selectedCustomer,
        store: fullStore,
        seller: user,
      })

      toast({
        title: isDraft ? 'Rascunho salvo!' : 'Venda confirmada!',
        description: `Venda ${sale.number} registrada com sucesso.`,
      })
    } catch (err: any) {
      console.error('Sale error:', err)
      toast({ title: 'Erro ao processar venda', description: err.message, variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // If sale confirmed, render printable receipt view
  if (confirmedSaleData) {
    return (
      <SaleReceipt
        sale={confirmedSaleData.sale}
        items={confirmedSaleData.items}
        customer={confirmedSaleData.customer}
        store={confirmedSaleData.store}
        seller={confirmedSaleData.seller}
        onClose={() => {
          setConfirmedSaleData(null)
          setCart([])
          setSelectedCustomer(null)
          setCustomerSearch('')
          navigate('/minhas-vendas')
        }}
      />
    )
  }

  const activeStoreObj = stores.find((s) => s.id === selectedStoreId)

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#111111]">
            Balcão de Atendimento — Nova Venda
          </h2>
          <p className="text-xs text-gray-500">
            Unidade: <strong>{activeStoreObj?.name}</strong> • Vendedor:{' '}
            <strong>{user?.name}</strong>
          </p>
        </div>

        {/* Change Store (if multiple authorized) */}
        {authorizedStores.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-600">Loja da Venda:</Label>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-52 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {authorizedStores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: CLIENTE & CATÁLOGO DE PRODUTOS (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. SELEÇÃO DE CLIENTE */}
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-[#111111] flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[#0A8F5C]" /> 1. Identificação do Cliente
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCustomerModalOpen(true)}
                className="text-xs text-[#0A8F5C] border-[#0A8F5C] hover:bg-emerald-50"
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Cadastro Rápido
              </Button>
            </div>

            {selectedCustomer ? (
              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/60 flex items-center justify-between">
                <div>
                  <p className="font-bold text-xs text-gray-900">{selectedCustomer.name}</p>
                  <p className="text-[11px] text-gray-600">
                    Tel: {selectedCustomer.phone}{' '}
                    {selectedCustomer.document && `• CPF: ${selectedCustomer.document}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Pesquisar cliente por nome, telefone ou CPF..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-9 h-10 text-xs"
                  />
                </div>

                {customerResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
                    {customerResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c)
                          setCustomerSearch('')
                          setCustomerResults([])
                        }}
                        className="p-2.5 text-xs hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                      >
                        <div>
                          <p className="font-semibold text-gray-800">{c.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {c.phone} {c.document && `• ${c.document}`}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Selecionar
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* 2. CATÁLOGO RÁPIDO DE PRODUTOS */}
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-[#111111] flex items-center gap-2">
                <Package className="h-4 w-4 text-[#0A8F5C]" /> 2. Adicionar Produtos ao Pedido
              </h3>
              <Input
                placeholder="Buscar produto..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-48 h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {products
                .filter(
                  (p) =>
                    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                    p.brand?.toLowerCase().includes(productSearch.toLowerCase()),
                )
                .map((prod) => {
                  const stock = stockMap[prod.id] || 0
                  return (
                    <div
                      key={prod.id}
                      className="p-3 rounded-lg border border-gray-200 bg-white hover:border-[#0A8F5C] hover:shadow-sm transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-xs text-[#111111] leading-snug">
                            {prod.name}
                          </p>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              stock > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {stock > 0 ? `${stock} em estoque` : 'Esgotado'}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {prod.brand} • {prod.model}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="font-extrabold text-sm text-[#0A8F5C]">
                          {formatBRL(prod.sale_price)}
                        </span>
                        <Button
                          size="sm"
                          disabled={stock <= 0}
                          onClick={() => handleAddToCart(prod)}
                          className="h-7 text-xs bg-[#111111] hover:bg-[#0A8F5C] text-white"
                        >
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: CARRINHO & FECHAMENTO (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <h3 className="font-bold text-sm text-[#111111] mb-3 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-[#0A8F5C]" /> 3. Itens do Pedido ({cart.length})
            </h3>

            {/* CART ITEMS LIST */}
            <div className="space-y-3 max-h-72 overflow-y-auto divide-y divide-gray-100">
              {cart.map((item, idx) => (
                <div key={idx} className="pt-2 first:pt-0">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-semibold text-xs text-[#111111] leading-snug">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-gray-400">Unit: {formatBRL(item.unitPrice)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFromCart(idx)}
                      className="h-6 w-6 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Quantity & Discount Inputs */}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-500">Qtd:</span>
                      <Input
                        type="number"
                        min="1"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(idx, Number(e.target.value))}
                        className="h-7 w-16 text-xs text-center"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[11px] text-gray-500">Desc R$:</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={item.discount}
                        onChange={(e) => updateDiscount(idx, Number(e.target.value))}
                        className="h-7 w-20 text-xs text-right"
                      />
                    </div>
                  </div>

                  {/* Serial Number if tracked */}
                  {item.trackSerial && (
                    <div className="mt-2">
                      <Input
                        placeholder="Nº de Série da unidade (Obrigatório)*"
                        value={item.serialNumber || ''}
                        onChange={(e) => updateSerialNumber(idx, e.target.value)}
                        className="h-7 text-[11px] bg-amber-50/50 border-amber-200"
                      />
                    </div>
                  )}

                  <div className="mt-1 text-right font-bold text-xs text-[#111111]">
                    Subtotal: {formatBRL(item.total)}
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="py-8 text-center text-xs text-gray-400">
                  Nenhum item adicionado ao pedido ainda.
                </div>
              )}
            </div>

            {/* PAYMENT METHOD SELECTION */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <Label className="text-xs font-semibold text-gray-700">Forma de Pagamento</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('pix')}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    paymentMethod === 'pix'
                      ? 'border-[#11C76F] bg-emerald-50 text-emerald-900 font-bold ring-1 ring-[#11C76F]'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <QrCode className="h-4 w-4 mx-auto mb-1 text-[#11C76F]" />
                  <span className="text-[11px] block">Pix (à vista)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('dinheiro')}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    paymentMethod === 'dinheiro'
                      ? 'border-[#F59E0B] bg-amber-50 text-amber-900 font-bold ring-1 ring-[#F59E0B]'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <DollarSign className="h-4 w-4 mx-auto mb-1 text-[#F59E0B]" />
                  <span className="text-[11px] block">Dinheiro</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('cartao_credito')}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    paymentMethod === 'cartao_credito'
                      ? 'border-[#3B82F6] bg-blue-50 text-blue-900 font-bold ring-1 ring-[#3B82F6]'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <CreditCard className="h-4 w-4 mx-auto mb-1 text-[#3B82F6]" />
                  <span className="text-[11px] block">Cartão</span>
                </button>
              </div>

              {/* Installments selector if card */}
              {paymentMethod === 'cartao_credito' && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Número de Parcelas:</span>
                    <span className="text-gray-400 text-[10px]">
                      limite da loja: {limits.maxInstallments}x
                    </span>
                  </div>
                  <Select
                    value={String(installments)}
                    onValueChange={(val) => setInstallments(Number(val))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: limits.maxInstallments }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}x de {formatBRL(finalTotal / n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* TOTALS SUMMARY */}
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Desconto:</span>
                  <span>-{formatBRL(totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-[#111111] pt-1">
                <span>TOTAL A PAGAR:</span>
                <span className="text-[#0A8F5C]">{formatBRL(finalTotal)}</span>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="mt-6 space-y-2">
              <Button
                disabled={isSubmitting || cart.length === 0}
                onClick={() => handleConfirmSale(false)}
                className="w-full h-11 bg-[#0A8F5C] hover:bg-[#087A4D] text-white font-bold text-sm shadow-md rounded-lg flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Confirmar Venda & Emitir Comprovante
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                disabled={isSubmitting || cart.length === 0}
                onClick={() => handleConfirmSale(true)}
                className="w-full h-9 text-xs text-gray-600"
              >
                Salvar apenas como Rascunho
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* MODAL QUICK CUSTOMER REGISTRATION */}
      <Dialog open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen}>
        <DialogContent className="sm:max-w-[460px] bg-white">
          <DialogHeader>
            <DialogTitle>Cadastro Rápido de Cliente</DialogTitle>
            <DialogDescription>
              Base compartilhada única para as lojas Shopping Jockey Plaza e Cajuru.
            </DialogDescription>
          </DialogHeader>

          {isDuplicateAlertOpen && duplicateCustomerFound && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Possível duplicidade detectada!
              </p>
              <p>
                Já existe um cliente cadastrado com este telefone/documento:{' '}
                <strong>{duplicateCustomerFound.name}</strong> ({duplicateCustomerFound.phone}).
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedCustomer(duplicateCustomerFound)
                    setIsCustomerModalOpen(false)
                    setIsDuplicateAlertOpen(false)
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7"
                >
                  Usar Cliente Existente
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleQuickCustomer}
                  className="text-xs h-7"
                >
                  Cadastrar Mesmo Assim
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleQuickCustomer} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome Completo *</Label>
              <Input
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Ex: João Silva"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Telefone / WhatsApp *</Label>
                <Input
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="(41) 99999-9999"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">CPF ou CNPJ (opcional)</Label>
                <Input
                  value={newCustDoc}
                  onChange={(e) => setNewCustDoc(e.target.value)}
                  placeholder="Apenas números"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">E-mail (opcional)</Label>
              <Input
                type="email"
                value={newCustEmail}
                onChange={(e) => setNewCustEmail(e.target.value)}
                placeholder="cliente@email.com"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Endereço (opcional)</Label>
              <Input
                value={newCustAddress}
                onChange={(e) => setNewCustAddress(e.target.value)}
                placeholder="Rua, número, bairro, Curitiba/PR"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsCustomerModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                Cadastrar e Selecionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

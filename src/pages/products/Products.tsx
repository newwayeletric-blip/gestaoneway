import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ProductsService, StockService } from '@/services/api'
import type { ProductRecord, CategoryRecord } from '@/types'
import { formatBRL } from '@/lib/formatters'
import {
  Package,
  PlusCircle,
  Search,
  Layers,
  ShieldCheck,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

export default function Products() {
  const { isAdmin, stores } = useAuth()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [stockMap, setStockMap] = useState<Record<string, { jockey: number; cajuru: number }>>({})
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // New Product Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pName, setPName] = useState('')
  const [pSku, setPSku] = useState('')
  const [pCat, setPCat] = useState('')
  const [pBrand, setPBrand] = useState('Navee')
  const [pModel, setPModel] = useState('')
  const [pSalePrice, setPSalePrice] = useState('')
  const [pCostPrice, setPCostPrice] = useState('')
  const [pMinStock, setPMinStock] = useState('2')
  const [pDesc, setPDesc] = useState('')
  const [pTrackSerial, setPTrackSerial] = useState(true)

  const { toast } = useToast()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [prodList, catList, stockList] = await Promise.all([
        ProductsService.getAll(),
        ProductsService.getCategories(),
        StockService.getStockItems(),
      ])
      setProducts(prodList)
      setCategories(catList)

      const sMap: Record<string, { jockey: number; cajuru: number }> = {}
      stockList.forEach((stk) => {
        if (!sMap[stk.product]) sMap[stk.product] = { jockey: 0, cajuru: 0 }
        const isJockey = stk.expand?.store?.slug === 'jockey-plaza'
        if (isJockey) {
          sMap[stk.product].jockey += stk.quantity
        } else {
          sMap[stk.product].cajuru += stk.quantity
        }
      })
      setStockMap(sMap)
    } catch (err) {
      console.error('Error loading products:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return

    if (!pName.trim() || !pSku.trim() || !pSalePrice) {
      toast({
        title: 'Atenção',
        description: 'Nome, SKU e Preço de Venda são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    try {
      await ProductsService.create({
        name: pName.trim(),
        sku: pSku.trim().toUpperCase(),
        category: pCat || undefined,
        brand: pBrand.trim(),
        model: pModel.trim(),
        sale_price: Number(pSalePrice),
        cost_price: pCostPrice ? Number(pCostPrice) : undefined,
        min_stock: Number(pMinStock || 2),
        description: pDesc.trim(),
        track_serial: pTrackSerial,
        status: 'ativo',
      })

      toast({ title: 'Produto cadastrado com sucesso!' })
      setIsModalOpen(false)
      setPName('')
      setPSku('')
      setPModel('')
      setPSalePrice('')
      setPCostPrice('')
      setPDesc('')
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao criar produto', description: err.message, variant: 'destructive' })
    }
  }

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase())
    const matchesCat = selectedCategory ? p.category === selectedCategory : true
    return matchesSearch && matchesCat
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            {isAdmin ? 'Catálogo de Produtos' : 'Consulta de Produtos & Estoque'}
          </h2>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? 'Gestão de catálogo unificado, variações, preços de venda e custos de aquisição.'
              : 'Consulte os preços e saldos disponíveis nas unidades Shopping Jockey Plaza e Cajuru.'}
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Novo Produto
          </Button>
        )}
      </div>

      {/* FILTER BAR */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome, marca (Navee / Segway) ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 text-xs"
            />
          </div>

          <div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Categoria: Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as Categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* PRODUCTS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((prod) => {
          const stkJockey = stockMap[prod.id]?.jockey || 0
          const stkCajuru = stockMap[prod.id]?.cajuru || 0
          const totalStock = stkJockey + stkCajuru

          return (
            <Card
              key={prod.id}
              className="bg-white border-0 shadow-sm rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] font-mono uppercase bg-gray-50">
                    {prod.brand || 'Elétrico'}
                  </Badge>
                  <span className="text-[10px] font-mono text-gray-400">SKU: {prod.sku}</span>
                </div>

                <h3 className="font-bold text-base text-[#111111] leading-snug">{prod.name}</h3>
                {prod.model && <p className="text-xs text-gray-500 mt-0.5">{prod.model}</p>}

                {prod.description && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2 leading-relaxed">
                    {prod.description}
                  </p>
                )}

                {/* STOCK PER STORE */}
                <div className="mt-4 p-3 rounded-lg bg-gray-50/80 border border-gray-100 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Shopping Jockey Plaza:</span>
                    <span
                      className={`font-bold ${stkJockey > 0 ? 'text-[#0A8F5C]' : 'text-red-500'}`}
                    >
                      {stkJockey} un
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Loja de rua (Cajuru):</span>
                    <span
                      className={`font-bold ${stkCajuru > 0 ? 'text-[#0A8F5C]' : 'text-red-500'}`}
                    >
                      {stkCajuru} un
                    </span>
                  </div>
                </div>
              </div>

              {/* PRICING & ADMIN COST */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase font-medium">
                    Preço de Venda
                  </span>
                  <span className="text-lg font-black text-[#0A8F5C]">
                    {formatBRL(prod.sale_price)}
                  </span>
                </div>

                {isAdmin && (
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block uppercase font-medium">
                      Custo (Admin)
                    </span>
                    <span className="text-xs font-semibold text-gray-700">
                      {prod.cost_price ? formatBRL(prod.cost_price) : 'N/D'}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* MODAL NOVO PRODUTO (ADMIN ONLY) */}
      {isAdmin && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-[520px] bg-white">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Produto</DialogTitle>
              <DialogDescription>
                Catálogo comercial das marcas Navee e Segway Ninebot.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateProduct} className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Nome do Veículo / Produto *</Label>
                <Input
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Ex: Patinete Elétrico Segway Ninebot F40"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">SKU / Código Único *</Label>
                  <Input
                    value={pSku}
                    onChange={(e) => setPSku(e.target.value)}
                    placeholder="SEG-F40-01"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Categoria</Label>
                  <Select value={pCat} onValueChange={setPCat}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Marca</Label>
                  <Select value={pBrand} onValueChange={setPBrand}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Navee">Navee</SelectItem>
                      <SelectItem value="Segway Ninebot">Segway Ninebot</SelectItem>
                      <SelectItem value="Acessórios New Way">Acessórios New Way</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Modelo</Label>
                  <Input
                    value={pModel}
                    onChange={(e) => setPModel(e.target.value)}
                    placeholder="KickScooter F40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Preço de Venda (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pSalePrice}
                    onChange={(e) => setPSalePrice(e.target.value)}
                    placeholder="4500.00"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-emerald-800">
                    Custo de Aquisição (Admin)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={pCostPrice}
                    onChange={(e) => setPCostPrice(e.target.value)}
                    placeholder="2800.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Estoque Mínimo (Alerta)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={pMinStock}
                    onChange={(e) => setPMinStock(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="chkSerial"
                    type="checkbox"
                    checked={pTrackSerial}
                    onChange={(e) => setPTrackSerial(e.target.checked)}
                    className="rounded border-gray-300 text-[#0A8F5C]"
                  />
                  <Label htmlFor="chkSerial" className="text-xs font-medium cursor-pointer">
                    Controlar Número de Série
                  </Label>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Descrição Técnica & Recursos</Label>
                <Textarea
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  rows={2}
                  placeholder="Potência do motor, autonomia, garantia de 1 ano, suspensão..."
                />
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                  Cadastrar Produto
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

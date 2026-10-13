import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { StockService, ProductsService } from '@/services/api'
import type { StockItemRecord, ProductRecord, TransferRecord } from '@/types'
import { formatDateBR } from '@/lib/formatters'
import useRealtime from '@/hooks/use-realtime'
import {
  Layers,
  ArrowRightLeft,
  PlusCircle,
  Truck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

export default function Stock() {
  const { isAdmin, stores, activeStoreId, user } = useAuth()
  const [stockItems, setStockItems] = useState<any[]>([])
  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  // Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [originStore, setOriginStore] = useState(stores[0]?.id || '')
  const [destStore, setDestStore] = useState(stores[1]?.id || '')
  const [transferProduct, setTransferProduct] = useState('')
  const [transferQty, setTransferQty] = useState('1')
  const [transferNote, setTransferNote] = useState('')

  // Entry / Adjustment Modal State (Admin only)
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false)
  const [entryType, setEntryType] = useState<'entrada' | 'ajuste' | 'perda' | 'avaria'>('entrada')
  const [entryStore, setEntryStore] = useState(stores[0]?.id || '')
  const [entryProduct, setEntryProduct] = useState('')
  const [entryQty, setEntryQty] = useState('1')
  const [entryReason, setEntryReason] = useState('')

  const { toast } = useToast()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [stocks, trans, prods, movs] = await Promise.all([
        StockService.getStockItems(selectedStore),
        StockService.getTransfers(),
        ProductsService.getAll(),
        StockService.getMovements(selectedStore, 30),
      ])
      setStockItems(stocks)
      setTransfers(trans)
      setProducts(prods)
      setMovements(movs.items || [])
    } catch (err) {
      console.error('Error loading stock:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedStore])

  useRealtime('stock_items', () => loadData())
  useRealtime('transfers', () => loadData())
  useRealtime('stock_movements', () => loadData())

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!originStore || !destStore || !transferProduct || Number(transferQty) <= 0) {
      toast({
        title: 'Atenção',
        description: 'Preencha todos os campos da transferência.',
        variant: 'destructive',
      })
      return
    }
    if (originStore === destStore) {
      toast({
        title: 'Atenção',
        description: 'Origem e destino não podem ser a mesma loja.',
        variant: 'destructive',
      })
      return
    }

    try {
      await StockService.createTransfer(
        originStore,
        destStore,
        [{ product: transferProduct, quantity: Number(transferQty) }],
        transferNote,
      )

      toast({
        title: 'Transferência iniciada!',
        description: 'Saldo retirado da origem e colocado em trânsito com segurança.',
      })
      setIsTransferModalOpen(false)
      setTransferProduct('')
      setTransferQty('1')
      setTransferNote('')
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro na transferência', description: err.message, variant: 'destructive' })
    }
  }

  const handleReceiveTransfer = async (transferId: string) => {
    try {
      await StockService.receiveTransfer(transferId)
      toast({
        title: 'Transferência Recebida!',
        description: 'Itens incorporados ao estoque da loja de destino.',
      })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleCancelTransfer = async (transferId: string) => {
    if (!confirm('Deseja cancelar esta transferência? Os itens retornarão ao estoque de origem.'))
      return
    try {
      await StockService.cancelTransfer(transferId)
      toast({ title: 'Transferência cancelada', description: 'Saldo devolvido à loja de origem.' })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleRecordEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entryProduct || !entryStore || Number(entryQty) <= 0) {
      toast({
        title: 'Atenção',
        description: 'Preencha o produto, loja e quantidade.',
        variant: 'destructive',
      })
      return
    }

    if (['perda', 'avaria', 'ajuste'].includes(entryType) && !entryReason.trim()) {
      toast({
        title: 'Atenção',
        description: 'O motivo é obrigatório para perdas, avarias e ajustes.',
        variant: 'destructive',
      })
      return
    }

    try {
      await StockService.recordMovement({
        type: entryType,
        product: entryProduct,
        store: entryStore,
        quantity: Number(entryQty),
        reason: entryReason.trim() || 'Entrada manual pelo administrador',
        source_ref: 'MANUAL-ADMIN',
      })

      toast({ title: 'Movimentação registrada com sucesso!' })
      setIsEntryModalOpen(false)
      setEntryProduct('')
      setEntryQty('1')
      setEntryReason('')
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER + ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            Estoque & Transferências
          </h2>
          <p className="text-sm text-gray-500">
            Controle de saldos por unidade, alerta de estoque mínimo e transferências em trânsito.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsEntryModalOpen(true)}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 text-xs"
              >
                <PlusCircle className="mr-1.5 h-4 w-4" /> Entrada / Ajuste
              </Button>

              <Button
                onClick={() => setIsTransferModalOpen(true)}
                className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white text-xs"
              >
                <ArrowRightLeft className="mr-1.5 h-4 w-4" /> Nova Transferência
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="posicao" className="space-y-4">
        <TabsList className="bg-white border border-gray-200">
          <TabsTrigger
            value="posicao"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <Layers className="h-4 w-4 mr-1.5" /> Posição de Estoque por Loja
          </TabsTrigger>
          <TabsTrigger
            value="transferencias"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <Truck className="h-4 w-4 mr-1.5" /> Transferências entre Unidades
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <Clock className="h-4 w-4 mr-1.5" /> Histórico de Movimentações
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: POSIÇÃO DE ESTOQUE */}
        <TabsContent value="posicao" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-700">Filtrar por Unidade:</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="w-56 h-9 text-xs">
                  <SelectValue placeholder="Todas as Unidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as Unidades</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Produto / Variação</th>
                    <th className="py-2.5 px-3 font-semibold">SKU</th>
                    <th className="py-2.5 px-3 font-semibold">Loja / Unidade</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Saldo Atual</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Estoque Mínimo</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stockItems.map((stk) => {
                    const min = stk.expand?.product?.min_stock || 0
                    const isLow = min > 0 && stk.quantity <= min
                    const isZero = stk.quantity === 0

                    return (
                      <tr key={stk.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-3">
                          <p className="font-semibold text-gray-900">{stk.expand?.product?.name}</p>
                          {stk.expand?.variant && (
                            <p className="text-[11px] text-gray-500">{stk.expand?.variant?.name}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-500">
                          {stk.expand?.variant?.sku || stk.expand?.product?.sku}
                        </td>
                        <td className="py-3 px-3 font-medium text-gray-700">
                          {stk.expand?.store?.name?.includes('Jockey')
                            ? 'Shopping Jockey Plaza'
                            : 'Loja de rua (Cajuru)'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded font-bold text-xs ${
                              isZero
                                ? 'bg-red-100 text-red-800'
                                : isLow
                                  ? 'bg-amber-100 text-amber-900 font-extrabold'
                                  : 'bg-emerald-50 text-[#0A8F5C]'
                            }`}
                          >
                            {stk.quantity} un
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center text-gray-400 font-mono">{min} un</td>
                        <td className="py-3 px-3 text-right">
                          {isZero ? (
                            <Badge className="bg-red-100 text-red-800 text-[10px]">Esgotado</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-100 text-amber-800 text-[10px] animate-pulse">
                              Estoque Baixo
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                              Regular
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {stockItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Nenhum item em estoque encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: TRANSFERÊNCIAS ENTRE LOJAS */}
        <TabsContent value="transferencias" className="space-y-4">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-[#111111]">Transferências de Estoque</h3>
                <p className="text-xs text-gray-500">
                  Itens transferidos entre Shopping Jockey Plaza e Loja de rua (Cajuru).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Origem → Destino</th>
                    <th className="py-2.5 px-3 font-semibold">Enviado Por</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Data Envio</th>
                    <th className="py-2.5 px-3 font-semibold">Observação</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-3 font-semibold text-gray-800">
                        {t.expand?.origin_store?.name?.includes('Jockey') ? 'Jockey' : 'Cajuru'}
                        {' → '}
                        {t.expand?.destination_store?.name?.includes('Jockey')
                          ? 'Jockey'
                          : 'Cajuru'}
                      </td>
                      <td className="py-3 px-3 text-gray-600">
                        {t.expand?.user?.name || 'Administrador'}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          className={
                            t.status === 'em_transito'
                              ? 'bg-blue-100 text-blue-800 animate-pulse'
                              : t.status === 'recebida'
                                ? 'bg-emerald-100 text-[#0A8F5C]'
                                : 'bg-red-100 text-red-800'
                          }
                        >
                          {t.status === 'em_transito'
                            ? 'Em Trânsito'
                            : t.status === 'recebida'
                              ? 'Recebida'
                              : 'Cancelada'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-gray-400">
                        {formatDateBR(t.date || t.created)}
                      </td>
                      <td className="py-3 px-3 text-gray-500 italic max-w-xs truncate">
                        {t.note || '-'}
                      </td>
                      <td className="py-3 px-3 text-right space-x-1">
                        {isAdmin && t.status === 'em_transito' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleReceiveTransfer(t.id)}
                              className="h-7 text-xs bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
                            >
                              Confirmar Recebimento
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelTransfer(t.id)}
                              className="h-7 text-xs text-red-600 hover:bg-red-50"
                            >
                              Cancelar
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {transfers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Nenhuma transferência registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: HISTÓRICO DE MOVIMENTAÇÕES */}
        <TabsContent value="historico">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <h3 className="font-bold text-base text-[#111111] mb-4">
              Auditoria de Movimentações de Estoque
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Tipo</th>
                    <th className="py-2.5 px-3 font-semibold">Produto</th>
                    <th className="py-2.5 px-3 font-semibold">Loja</th>
                    <th className="py-2.5 px-3 font-semibold">Quantidade</th>
                    <th className="py-2.5 px-3 font-semibold">Motivo / Origem</th>
                    <th className="py-2.5 px-3 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-3">
                        <span className="font-semibold uppercase text-[10px] tracking-wider text-gray-700">
                          {m.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-gray-900">
                        {m.expand?.product?.name}
                      </td>
                      <td className="py-3 px-3 text-gray-600">
                        {m.expand?.store?.name?.includes('Jockey') ? 'Jockey' : 'Cajuru'}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-gray-800">
                        {['entrada', 'transferencia_recebimento', 'devolucao'].includes(m.type)
                          ? '+'
                          : '-'}
                        {m.quantity} un
                      </td>
                      <td className="py-3 px-3 text-gray-500 truncate max-w-xs">
                        {m.reason || m.source_ref || '-'}
                      </td>
                      <td className="py-3 px-3 text-gray-400">{formatDateBR(m.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL NOVA TRANSFERÊNCIA (ADMIN) */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white">
          <DialogHeader>
            <DialogTitle>Transferir Estoque entre Unidades</DialogTitle>
            <DialogDescription>
              O saldo será debitado da origem e colocado "em trânsito" até que a loja receptora
              confirme.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTransfer} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Loja de Origem</Label>
                <Select value={originStore} onValueChange={setOriginStore}>
                  <SelectTrigger>
                    <SelectValue />
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

              <div className="space-y-1">
                <Label className="text-xs">Loja de Destino</Label>
                <Select value={destStore} onValueChange={setDestStore}>
                  <SelectTrigger>
                    <SelectValue />
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

            <div className="space-y-1">
              <Label className="text-xs">Produto a Transferir</Label>
              <Select value={transferProduct} onValueChange={setTransferProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Observação / Instrução de Envio</Label>
              <Textarea
                placeholder="Ex: Envio via motoboy para atendimento urgente de balcão..."
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsTransferModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                Enviar em Trânsito
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL ENTRADA / AJUSTE (ADMIN) */}
      <Dialog open={isEntryModalOpen} onOpenChange={setIsEntryModalOpen}>
        <DialogContent className="sm:max-w-[460px] bg-white">
          <DialogHeader>
            <DialogTitle>Lançamento Manual de Estoque</DialogTitle>
            <DialogDescription>
              Entrada de mercadorias novas de fornecedor, avarias ou ajustes de contagem física.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordEntry} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Movimentação</Label>
                <Select value={entryType} onValueChange={(val: any) => setEntryType(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada (Adicionar)</SelectItem>
                    <SelectItem value="ajuste">Ajuste de Balanço</SelectItem>
                    <SelectItem value="avaria">Avaria (Retirar)</SelectItem>
                    <SelectItem value="perda">Perda / Extravio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Loja</Label>
                <Select value={entryStore} onValueChange={setEntryStore}>
                  <SelectTrigger>
                    <SelectValue />
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

            <div className="space-y-1">
              <Label className="text-xs">Produto</Label>
              <Select value={entryProduct} onValueChange={setEntryProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={entryQty}
                onChange={(e) => setEntryQty(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Motivo / Justificativa Obrigatória</Label>
              <Textarea
                value={entryReason}
                onChange={(e) => setEntryReason(e.target.value)}
                placeholder="Ex: Recebimento lote fábrica Navee, quebra de retrovisor..."
                rows={2}
                required={['perda', 'avaria', 'ajuste'].includes(entryType)}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsEntryModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                Salvar Movimentação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

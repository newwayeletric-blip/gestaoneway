import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Ban,
  RotateCcw,
  FileText,
  Upload,
  User,
  Store,
  DollarSign,
  Package,
  Calendar,
  AlertTriangle,
  FileCheck,
  CreditCard,
  Truck,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SalesService, FinancialService } from '@/services/api'
import type {
  SaleRecord,
  SaleItemRecord,
  SalePaymentRecord,
  SaleDocumentRecord,
  FinancialAccountRecord,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import { SaleReceipt } from '@/components/SaleReceipt'
import { pb } from '@/lib/pocketbase/client'

export function SaleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isProfile } = useAuth()
  const isAdmin = isProfile('admin')

  const [sale, setSale] = useState<SaleRecord | null>(null)
  const [items, setItems] = useState<SaleItemRecord[]>([])
  const [payments, setPayments] = useState<SalePaymentRecord[]>([])
  const [documents, setDocuments] = useState<SaleDocumentRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Cancellation Modal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)

  // Return Modal (Devolução total / parcial)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [returnType, setReturnType] = useState<'devolucao_total' | 'devolucao_parcial'>(
    'devolucao_total',
  )
  const [returnReason, setReturnReason] = useState('')
  const [productCondition, setProductCondition] = useState<
    'perfeito_retorna_venda' | 'avariado_indisponivel' | 'nao_entregue_liberado'
  >('perfeito_retorna_venda')
  const [refundStatus, setRefundStatus] = useState<'pendente' | 'reembolsado' | 'sem_reembolso'>(
    'pendente',
  )
  const [refundMethod, setRefundMethod] = useState<'pix' | 'dinheiro' | 'estorno_cartao'>('pix')
  const [refundAccount, setRefundAccount] = useState<string>('')
  const [refundAmount, setRefundAmount] = useState<number>(0)
  const [returnItemQuantities, setReturnItemQuantities] = useState<Record<string, number>>({})
  const [isReturning, setIsReturning] = useState(false)

  // Delivery Modal
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false)
  const [isRegisteringDelivery, setIsRegisteringDelivery] = useState(false)

  // Document Upload Modal
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docLabel, setDocLabel] = useState('')
  const [docType, setDocType] = useState<
    'nota_fiscal' | 'comprovante_pagamento' | 'recibo_entrega' | 'termo_garantia' | 'outro'
  >('nota_fiscal')
  const [isUploadingDoc, setIsUploadingDoc] = useState(false)

  const loadData = async () => {
    if (!id) return
    try {
      setLoading(true)
      const [saleData, itemsData, paymentsData, docsData] = await Promise.all([
        SalesService.getById(id),
        SalesService.getItems(id),
        SalesService.getPayments(id),
        SalesService.getDocuments(id),
      ])
      setSale(saleData)
      setItems(itemsData)
      setPayments(paymentsData)
      setDocuments(docsData)

      if (isAdmin) {
        const accs = await FinancialService.listAccounts()
        setAccounts(accs.filter((a) => a.active))
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar venda',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id, isAdmin])

  // Open Return Modal
  const handleOpenReturnModal = () => {
    if (!sale) return
    setReturnType('devolucao_total')
    setReturnReason('')
    setProductCondition(
      sale.delivery_status === 'entregue' ? 'perfeito_retorna_venda' : 'nao_entregue_liberado',
    )
    setRefundStatus('pendente')
    setRefundMethod('pix')
    setRefundAmount(sale.total)
    if (accounts.length > 0) setRefundAccount(accounts[0].id)

    // Init item return quantities
    const map: Record<string, number> = {}
    for (const it of items) {
      const remaining = it.quantity - (it.returned_quantity || 0)
      map[it.id] = remaining
    }
    setReturnItemQuantities(map)
    setIsReturnModalOpen(true)
  }

  // Handle Cancel
  const handleConfirmCancel = async () => {
    if (!sale || !cancelReason.trim()) {
      toast({ title: 'Justificativa de cancelamento é obrigatória', variant: 'destructive' })
      return
    }
    setIsCanceling(true)
    try {
      await SalesService.cancelSale(sale.id, cancelReason, user!.id)
      toast({ title: 'Venda cancelada com sucesso!' })
      setIsCancelModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao cancelar venda', description: err.message, variant: 'destructive' })
    } finally {
      setIsCanceling(false)
    }
  }

  // Handle Register Delivery
  const handleConfirmDelivery = async () => {
    if (!sale) return
    setIsRegisteringDelivery(true)
    try {
      await SalesService.registerDelivery(sale.id, user!.id)
      toast({ title: 'Entrega registrada com sucesso! (Sem duplicar baixa de estoque)' })
      setIsDeliveryModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar entrega',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsRegisteringDelivery(false)
    }
  }

  // Handle Return Submission
  const handleConfirmReturn = async () => {
    if (!sale || !returnReason.trim()) {
      toast({ title: 'Preencha o motivo da devolução', variant: 'destructive' })
      return
    }

    // Build return items detail
    const returnItemsPayload = items
      .map((it) => {
        const qtyToReturn = returnItemQuantities[it.id] || 0
        if (qtyToReturn <= 0) return null
        return {
          sale_item_id: it.id,
          product_id: it.product || '',
          variant_id: it.variant,
          product_name: it.product_name,
          quantity: qtyToReturn,
          unit_price: it.sale_price,
          cost_price: it.cost_price_snapshot || it.cost_price || 0,
          condition: productCondition,
        }
      })
      .filter(Boolean) as any[]

    if (returnItemsPayload.length === 0) {
      toast({
        title: 'Selecione ao menos um item com quantidade para devolver',
        variant: 'destructive',
      })
      return
    }

    setIsReturning(true)
    try {
      await SalesService.registerReturn(sale.id, {
        type: returnType,
        reason: returnReason,
        refund_amount: refundAmount,
        refund_status: refundStatus,
        refund_date: new Date().toISOString(),
        refund_method: refundStatus === 'reembolsado' ? refundMethod : undefined,
        refund_account: refundStatus === 'reembolsado' ? refundAccount : undefined,
        product_condition: productCondition,
        performed_by: user!.id,
        items: returnItemsPayload,
      })

      toast({
        title: 'Devolução registrada com sucesso!',
        description:
          productCondition === 'avariado_indisponivel'
            ? 'Produto marcado como avariado (indisponível para venda).'
            : 'Estoque ajustado e financeiro/comissões atualizados.',
      })
      setIsReturnModalOpen(false)
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao processar devolução',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsReturning(false)
    }
  }

  // Handle Document Upload
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sale || !selectedFile) {
      toast({ title: 'Selecione um arquivo para envio', variant: 'destructive' })
      return
    }

    // Validate size (max 10MB) and format
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande. Limite máximo: 10MB.', variant: 'destructive' })
      return
    }

    setIsUploadingDoc(true)
    try {
      await SalesService.uploadDocument(
        sale.id,
        selectedFile,
        docLabel || selectedFile.name,
        docType,
      )
      toast({ title: 'Documento anexado com segurança!' })
      setIsDocModalOpen(false)
      setSelectedFile(null)
      setDocLabel('')
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao enviar documento', description: err.message, variant: 'destructive' })
    } finally {
      setIsUploadingDoc(false)
    }
  }

  // Handle Delete Document
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Deseja realmente remover este documento?')) return
    try {
      await SalesService.deleteDocument(docId)
      toast({ title: 'Documento removido.' })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao remover documento',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Carregando detalhes da venda...</div>
    )
  }

  if (!sale) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 font-semibold mb-2">Venda não encontrada.</p>
        <Button onClick={() => navigate('/sales')}>Voltar</Button>
      </div>
    )
  }

  const isConfirmed = sale.status === 'confirmada'
  const isCanceled = sale.status === 'cancelada'
  const isDelivered = sale.delivery_status === 'entregue'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Venda {sale.number}</h1>
              <Badge
                variant={
                  sale.status === 'confirmada'
                    ? 'default'
                    : sale.status === 'cancelada'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {sale.status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Pagamento: {sale.payment_status || 'pago'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Entrega: {sale.delivery_status || 'pendente'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Criada em {formatDateBR(sale.created)} • Unidade: {sale.expand?.store?.name}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mark delivery if confirmed and pending */}
          {isConfirmed && !isDelivered && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeliveryModalOpen(true)}
              className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
            >
              <Truck className="h-4 w-4 mr-1.5" />
              Registrar Entrega
            </Button>
          )}

          {/* Admin Cancel / Return actions */}
          {isAdmin && isConfirmed && !isCanceled && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenReturnModal}
                className="text-amber-600 border-amber-300 hover:bg-amber-50"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Registrar Devolução
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <Ban className="h-4 w-4 mr-1.5" />
                Cancelar Venda
              </Button>
            </>
          )}

          {/* Add Document button */}
          <Button size="sm" variant="default" onClick={() => setIsDocModalOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Anexar Documento / NF
          </Button>
        </div>
      </div>

      {/* Cancellation Notice if canceled */}
      {isCanceled && (
        <Card className="border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="pt-4 flex items-start gap-3 text-red-800 dark:text-red-300 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Venda Cancelada</p>
              <p className="mt-0.5">
                Motivo: {sale.cancellation_reason || 'Cancelamento registrado pela administração.'}
              </p>
              {sale.canceled_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Cancelado em {formatDateBR(sale.canceled_at)} por{' '}
                  {sale.expand?.canceled_by?.name || 'Administrador'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details Grid */}
      <Tabs defaultValue="detalhes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes e Itens</TabsTrigger>
          <TabsTrigger value="recibo">Recibo e Comprovante</TabsTrigger>
          <TabsTrigger value="documentos">Documentos e NF ({documents.length})</TabsTrigger>
        </TabsList>

        {/* TAB: DETALHES */}
        <TabsContent value="detalhes" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Customer info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium text-base">
                  {sale.expand?.customer?.name || 'Não identificado'}
                </p>
                <p className="text-muted-foreground">Tel: {sale.expand?.customer?.phone || '-'}</p>
                {sale.expand?.customer?.document && (
                  <p className="text-muted-foreground">
                    CPF/CNPJ: {sale.expand?.customer?.document}
                  </p>
                )}
                {sale.expand?.customer?.email && (
                  <p className="text-muted-foreground">E-mail: {sale.expand?.customer?.email}</p>
                )}
              </CardContent>
            </Card>

            {/* Sale metadata */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" />
                  Loja e Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{sale.expand?.store?.name || 'Unidade'}</p>
                <p className="text-muted-foreground">
                  Vendedor:{' '}
                  <span className="font-medium text-foreground">
                    {sale.expand?.seller?.name || '-'}
                  </span>
                </p>
                {sale.expand?.authorized_by && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Autorizado por: {sale.expand.authorized_by.name} (
                    {sale.authorization_note || 'Saldo liberado'})
                  </p>
                )}
                {isDelivered && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Entregue em: {formatDateBR(sale.delivered_at || '')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Financial summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Resumo Financeiro
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span>{formatBRL(sale.subtotal)}</span>
                </div>
                {sale.total_discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Desconto:</span>
                    <span>- {formatBRL(sale.total_discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t pt-1">
                  <span>Total da Venda:</span>
                  <span className="text-primary">{formatBRL(sale.total)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Items Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Produtos e Veículos Vendidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-left text-xs uppercase font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Item / Descrição</th>
                      <th className="py-2.5 px-3 text-center">Qtd</th>
                      <th className="py-2.5 px-3 text-right">Preço Un.</th>
                      <th className="py-2.5 px-3 text-right">Desconto</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      {isAdmin && <th className="py-2.5 px-3 text-right">Custo Snapshot</th>}
                      {isAdmin && <th className="py-2.5 px-3 text-right">Comissão</th>}
                      <th className="py-2.5 px-3 text-center">Devolvido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-muted/40">
                        <td className="py-2.5 px-3">
                          <p className="font-medium">{it.product_name}</p>
                          {it.sku && <p className="text-xs text-muted-foreground">SKU: {it.sku}</p>}
                          {it.serial_number && (
                            <p className="text-xs text-blue-600">Nº de Série: {it.serial_number}</p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium">{it.quantity}</td>
                        <td className="py-2.5 px-3 text-right">{formatBRL(it.sale_price)}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {it.discount > 0 ? `- ${formatBRL(it.discount)}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          {formatBRL(it.total)}
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">
                            {formatBRL(it.cost_price_snapshot || it.cost_price || 0)}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="py-2.5 px-3 text-right text-xs text-emerald-600 font-medium">
                            {it.commission_value
                              ? `${formatBRL(it.commission_value)} (${it.commission_rate}%)`
                              : '-'}
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-center">
                          {it.returned_quantity && it.returned_quantity > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-amber-600 border-amber-300"
                            >
                              {it.returned_quantity} un.
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Payments registered */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Registros de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border text-sm gap-2"
                  >
                    <div>
                      <p className="font-semibold capitalize">
                        {p.method.replace('_', ' ')}
                        {p.method === 'cartao_credito' && ` (${p.installments || 1}x parcelas)`}
                      </p>
                      {p.method === 'dinheiro' && p.change_amount ? (
                        <p className="text-xs text-muted-foreground">
                          Recebido: {formatBRL(p.received_amount || 0)} • Troco:{' '}
                          {formatBRL(p.change_amount)}
                        </p>
                      ) : null}
                      {isAdmin && p.expand?.financial_account && (
                        <p className="text-xs text-muted-foreground">
                          Conta: {p.expand.financial_account.name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-base text-primary">{formatBRL(p.amount)}</p>
                      <Badge variant="outline" className="text-[10px] text-emerald-600">
                        {p.confirmed ? 'Confirmado' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: RECIBO */}
        <TabsContent value="recibo">
          <Card>
            <CardContent className="pt-6">
              <SaleReceipt saleId={sale.id} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: DOCUMENTOS E NOTAS FISCAIS */}
        <TabsContent value="documentos" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">
                  Notas Fiscais e Documentos Privados
                </CardTitle>
                <CardDescription>
                  PDF, XML da nota fiscal externa, termos de garantia e comprovantes assinados
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setIsDocModalOpen(true)}>
                <Upload className="h-4 w-4 mr-1.5" />
                Novo Anexo
              </Button>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                  Nenhum documento ou nota fiscal anexada a esta venda.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {documents.map((doc) => {
                    const fileUrl = pb.files.getURL(doc, doc.file)
                    return (
                      <div
                        key={doc.id}
                        className="p-3.5 rounded-lg border flex items-start justify-between gap-3 bg-card"
                      >
                        <div className="flex items-start gap-3">
                          <FileCheck className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-sm">{doc.label}</p>
                            <Badge variant="outline" className="text-[10px] capitalize mt-0.5">
                              {doc.doc_type?.replace('_', ' ') || 'Documento'}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              Enviado em {formatDateBR(doc.created)} por{' '}
                              {doc.expand?.uploaded_by?.name || 'Usuário'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent h-8 px-2.5"
                          >
                            Abrir
                          </a>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => handleDeleteDoc(doc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL: CANCEL SALE */}
      <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Cancelar Venda {sale.number}
            </DialogTitle>
            <DialogDescription>
              Apenas administradores podem cancelar. O estoque será liberado (se não entregue) e as
              comissões serão estornadas proporcionalmente. Registros não são apagados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label>Justificativa do Cancelamento *</Label>
              <Textarea
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo formal do cancelamento para fins de auditoria..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || isCanceling}
              onClick={handleConfirmCancel}
            >
              Confirmar Cancelamento com Auditoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: REGISTER RETURN */}
      <Dialog open={isReturnModalOpen} onOpenChange={setIsReturnModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RotateCcw className="h-5 w-5" />
              Registrar Devolução / Estorno
            </DialogTitle>
            <DialogDescription>
              Devolução total ou parcial com conferência da condição do produto e ajuste financeiro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[460px] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Devolução</Label>
                <Select
                  value={returnType}
                  onValueChange={(v) => {
                    setReturnType(v as any)
                    if (v === 'devolucao_total') setRefundAmount(sale.total)
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="devolucao_total">Devolução Total</SelectItem>
                    <SelectItem value="devolucao_parcial">Devolução Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Condição do Produto Recebido</Label>
                <Select
                  value={productCondition}
                  onValueChange={(v) => setProductCondition(v as any)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perfeito_retorna_venda">
                      Perfeito (Retorna ao estoque)
                    </SelectItem>
                    <SelectItem value="avariado_indisponivel">
                      Avariado (Indisponível p/ venda)
                    </SelectItem>
                    <SelectItem value="nao_entregue_liberado">Não entregue (Liberado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quantities per item */}
            <div className="border rounded-md p-3 space-y-2 bg-muted/20">
              <Label className="text-xs font-semibold">Itens a Devolver</Label>
              {items.map((it) => {
                const maxReturnable = it.quantity - (it.returned_quantity || 0)
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between text-xs py-1 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">{it.product_name}</p>
                      <p className="text-muted-foreground">
                        Vendido: {it.quantity} | Já devolvido: {it.returned_quantity || 0}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Qtd:</span>
                      <Input
                        type="number"
                        min="0"
                        max={maxReturnable}
                        value={returnItemQuantities[it.id] ?? 0}
                        onChange={(e) => {
                          const val = Math.min(
                            maxReturnable,
                            Math.max(0, parseInt(e.target.value, 10) || 0),
                          )
                          setReturnItemQuantities((prev) => ({ ...prev, [it.id]: val }))
                        }}
                        className="h-7 w-16 text-center text-xs"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Refund handling */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Situação do Reembolso</Label>
                <Select value={refundStatus} onValueChange={(v) => setRefundStatus(v as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente de Reembolso</SelectItem>
                    <SelectItem value="reembolsado">Reembolsado ao Cliente</SelectItem>
                    <SelectItem value="sem_reembolso">Sem Reembolso (Crédito)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor a Reembolsar (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={refundAmount || ''}
                  onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>

            {refundStatus === 'reembolsado' && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20">
                <div>
                  <Label>Forma de Reembolso</Label>
                  <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="estorno_cartao">Estorno Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {accounts.length > 0 && (
                  <div>
                    <Label>Conta Financeira de Saída</Label>
                    <Select value={refundAccount} onValueChange={setRefundAccount}>
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
                )}
              </div>
            )}

            <div>
              <Label>Motivo e Observações *</Label>
              <Textarea
                required
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Ex: Cliente desistiu por insatisfação; veículo recebido com avaria no paralamas..."
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReturnModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={!returnReason.trim() || isReturning}
              onClick={handleConfirmReturn}
            >
              Registrar Devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: REGISTER DELIVERY */}
      <Dialog open={isDeliveryModalOpen} onOpenChange={setIsDeliveryModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Truck className="h-5 w-5" />
              Confirmar Entrega do Produto
            </DialogTitle>
            <DialogDescription>
              Registra que o cliente retirou o veículo na loja ou recebeu no endereço. O estoque já
              foi baixado na confirmação da venda e NÃO gera nova baixa.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-sm space-y-2">
            <p>
              <strong>Venda:</strong> {sale.number}
            </p>
            <p>
              <strong>Cliente:</strong> {sale.expand?.customer?.name}
            </p>
            <p>
              <strong>Responsável pelo registro:</strong> {user?.name}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeliveryModalOpen(false)}>
              Voltar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={isRegisteringDelivery}
              onClick={handleConfirmDelivery}
            >
              Confirmar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: ATTACH DOCUMENT */}
      <Dialog open={isDocModalOpen} onOpenChange={setIsDocModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleUploadDocument}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Anexar Nota Fiscal ou Documento
              </DialogTitle>
              <DialogDescription>
                Armazenamento privado e seguro. Permite PDF, imagens ou XML da NF.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div>
                <Label>Tipo de Documento</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as any)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nota_fiscal">Nota Fiscal (PDF ou XML)</SelectItem>
                    <SelectItem value="comprovante_pagamento">Comprovante de Pagamento</SelectItem>
                    <SelectItem value="recibo_entrega">Recibo / Termo de Entrega</SelectItem>
                    <SelectItem value="termo_garantia">Termo de Garantia Assinado</SelectItem>
                    <SelectItem value="outro">Outro Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Título / Rótulo</Label>
                <Input
                  value={docLabel}
                  onChange={(e) => setDocLabel(e.target.value)}
                  placeholder="Ex: DANFE NF-e 4521"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Arquivo *</Label>
                <Input
                  type="file"
                  required
                  accept=".pdf,.xml,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0])
                    }
                  }}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos aceitos: PDF, XML, JPG, PNG (máx. 10MB)
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDocModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedFile || isUploadingDoc}>
                {isUploadingDoc ? 'Enviando...' : 'Fazer Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

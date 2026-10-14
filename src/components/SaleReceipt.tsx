import React from 'react'
import { formatBRL, formatDateBR, formatDocumentBR, formatPhoneBR } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft, CheckCircle2, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

interface SaleReceiptProps {
  sale?: any
  saleId?: string
  items?: any[]
  customer?: any
  store?: any
  seller?: any
  onClose?: () => void
}

export const SaleReceipt: React.FC<SaleReceiptProps> = ({
  sale: propSale,
  saleId,
  items: propItems,
  customer: propCustomer,
  store: propStore,
  seller: propSeller,
  onClose,
}) => {
  const [loadedSale, setLoadedSale] = React.useState<any>(propSale || null)
  const [loadedItems, setLoadedItems] = React.useState<any[]>(propItems || [])

  React.useEffect(() => {
    if (!loadedSale && saleId) {
      import('@/services/api').then(({ SalesService }) => {
        SalesService.getById(saleId).then((s) => {
          setLoadedSale(s)
          SalesService.getItems(saleId).then((its) => setLoadedItems(its))
        })
      })
    }
  }, [saleId, loadedSale])

  const sale = loadedSale || propSale
  const items = propItems && propItems.length > 0 ? propItems : loadedItems
  const customer = propCustomer || sale?.expand?.customer
  const store = propStore || sale?.expand?.store
  const seller = propSeller || sale?.expand?.seller
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* ACTION BAR (HIDDEN IN PRINT) */}
      <div className="flex items-center justify-between no-print bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-[#0A8F5C]" />
          <span className="font-semibold text-sm">Venda Confirmada com Sucesso!</span>
        </div>
        <div className="flex items-center gap-3">
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Button>
          )}
          <Button onClick={handlePrint} className="bg-[#111111] hover:bg-black text-white">
            <Printer className="h-4 w-4 mr-2" /> Imprimir Comprovante
          </Button>
        </div>
      </div>

      {/* PRINTABLE RECEIPT CONTAINER */}
      <div className="printable-receipt mx-auto max-w-xl bg-white p-8 rounded-2xl shadow-md border border-gray-200 text-xs text-gray-800">
        {/* HEADER */}
        <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
          <div className="flex justify-center items-center gap-2 mb-1">
            <Zap className="h-5 w-5 fill-[#0A8F5C] text-[#0A8F5C]" />
            <h2 className="text-lg font-black tracking-wider text-[#111111]">NEW WAY ELETRIC</h2>
          </div>
          <p className="font-semibold text-gray-700">{store?.name || 'New Way Eletric'}</p>
          <p className="text-gray-500 text-[11px]">{store?.address}</p>
          <p className="text-gray-500 text-[11px]">
            WhatsApp: {formatPhoneBR(store?.whatsapp || store?.phone)}
          </p>

          <div className="mt-3 inline-block border-2 border-red-500 px-3 py-1 text-red-600 font-extrabold uppercase tracking-widest text-[11px]">
            DOCUMENTO INTERNO — SEM VALOR FISCAL
          </div>
        </div>

        {/* SALE & CUSTOMER METADATA */}
        <div className="grid grid-cols-2 gap-2 border-b border-dashed border-gray-300 pb-3 mb-3">
          <div>
            <p className="text-gray-500">Nº da Venda:</p>
            <p className="font-bold text-sm text-[#111111]">{sale?.number}</p>
          </div>
          <div>
            <p className="text-gray-500">Data e Horário:</p>
            <p className="font-medium text-gray-800">{formatDateBR(sale?.created, true)}</p>
          </div>
          <div>
            <p className="text-gray-500">Vendedor(a):</p>
            <p className="font-medium text-gray-800">{seller?.name || 'Balcão'}</p>
          </div>
          <div>
            <p className="text-gray-500">Cliente:</p>
            <p className="font-bold text-gray-800">{customer?.name || 'Consumidor Final'}</p>
            {customer?.document && (
              <p className="text-gray-500 text-[10px]">
                CPF/CNPJ: {formatDocumentBR(customer.document)}
              </p>
            )}
            {customer?.phone && (
              <p className="text-gray-500 text-[10px]">Tel: {formatPhoneBR(customer.phone)}</p>
            )}
          </div>
        </div>

        {/* ITEMS LIST */}
        <div className="border-b border-dashed border-gray-300 pb-3 mb-3">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="pb-1.5 font-semibold">Item / Descrição</th>
                <th className="pb-1.5 font-semibold text-center">Qtd</th>
                <th className="pb-1.5 font-semibold text-right">Unitário</th>
                <th className="pb-1.5 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((it, idx) => (
                <tr key={it.id || idx}>
                  <td className="py-2 pr-2">
                    <p className="font-semibold text-gray-900">{it.product_name}</p>
                    {it.sku && <p className="text-[10px] text-gray-400">SKU: {it.sku}</p>}
                    {it.serial_number && (
                      <p className="text-[10px] text-gray-600 font-mono">
                        Nº Série: {it.serial_number}
                      </p>
                    )}
                  </td>
                  <td className="py-2 text-center align-top">{it.quantity}</td>
                  <td className="py-2 text-right align-top">{formatBRL(it.sale_price)}</td>
                  <td className="py-2 text-right align-top font-bold text-gray-900">
                    {formatBRL(it.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TOTALS & PAYMENT */}
        <div className="space-y-1.5 border-b border-dashed border-gray-300 pb-3 mb-4">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal dos Produtos:</span>
            <span>{formatBRL(sale?.subtotal || sale?.total)}</span>
          </div>
          {sale?.total_discount > 0 && (
            <div className="flex justify-between text-red-600 font-medium">
              <span>Desconto Concedido:</span>
              <span>-{formatBRL(sale.total_discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-black text-[#111111] pt-1">
            <span>TOTAL PAGO:</span>
            <span className="text-[#0A8F5C]">{formatBRL(sale?.total)}</span>
          </div>
          <div className="flex justify-between text-gray-600 pt-1 text-[11px]">
            <span>Forma de Pagamento:</span>
            <span className="font-semibold uppercase">
              {sale?.payment === 'cartao_credito'
                ? `Cartão de Crédito (${sale.installments || 1}x)`
                : sale?.payment}
            </span>
          </div>
        </div>

        {/* WARRANTY & TERMS */}
        <div className="text-[10px] text-gray-500 space-y-1.5 leading-relaxed">
          <p className="font-bold text-gray-700 uppercase">
            Termos de Garantia & Assistência Especializada:
          </p>
          <p>
            • <strong>Garantia legal e contratual de 1 ano</strong> conforme certificado fornecido
            pelo fabricante (Navee / Segway Ninebot).
          </p>
          <p>
            • Assistência técnica especializada em baterias e componentes elétricos realizada na
            oficina da <strong>Home Lithium</strong> (Loja Cajuru).
          </p>
          <p>
            • O cliente declara ter recebido os itens em perfeito estado de funcionamento e
            inspecionados no ato da entrega.
          </p>
        </div>

        {/* SIGNATURE AREA */}
        <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-2 gap-6 text-center text-[10px]">
          <div>
            <div className="border-b border-gray-400 mb-1 h-6" />
            <p className="font-medium text-gray-700">Assinatura do Cliente</p>
          </div>
          <div>
            <div className="border-b border-gray-400 mb-1 h-6" />
            <p className="font-medium text-gray-700">Responsável New Way Eletric</p>
          </div>
        </div>
      </div>
    </div>
  )
}

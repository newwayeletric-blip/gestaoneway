import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Boxes, Printer, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ProductsService, StockService } from '@/services/api'
import type { ProductRecord } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBRL } from '@/lib/formatters'
import { code128Widths } from '@/lib/code128'

// Etiquetas por modelo (dono, 11/11/2026): QR Code ou código de barras com o
// SKU, o mesmo código que o leitor ou a câmera procuram na Nova venda.
// Produto repetido leva a mesma etiqueta; a quantidade pode vir do estoque
// (uma por unidade). A página fica fora do layout do sistema para imprimir só
// as etiquetas.
const LAYOUTS = {
  a4: {
    label: 'Folha A4: 21 etiquetas de 63,5 × 38,1 mm',
    page: '@page { size: A4; margin: 15.1mm 7.2mm; }',
    width: 63.5,
    height: 38.1,
    perPage: 21,
    sheet: 'grid grid-cols-[repeat(3,63.5mm)] gap-x-[2.5mm] auto-rows-[38.1mm]',
  },
  t50: {
    label: 'Térmica: 50 × 30 mm (uma por etiqueta)',
    page: '@page { size: 50mm 30mm; margin: 0; }',
    width: 50,
    height: 30,
    perPage: 1,
    sheet: '',
  },
  t40: {
    label: 'Térmica: 40 × 25 mm (uma por etiqueta)',
    page: '@page { size: 40mm 25mm; margin: 0; }',
    width: 40,
    height: 25,
    perPage: 1,
    sheet: '',
  },
} as const
type LayoutKey = keyof typeof LAYOUTS
type CodeKind = 'qr' | 'barras'

// Código de barras em SVG, com a margem branca que o leitor precisa dos lados.
function Barcode({ value, heightMm }: { value: string; heightMm: number }) {
  const widths = useMemo(() => {
    try {
      return code128Widths(value)
    } catch {
      return null
    }
  }, [value])
  if (!widths) return <p className="text-[7pt] text-red-600">Código com caractere inválido</p>
  const quiet = 10
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2
  let x = quiet
  return (
    <svg
      role="img"
      aria-label={`Código de barras ${value}`}
      viewBox={`0 0 ${total} 10`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ width: '100%', height: `${heightMm}mm`, display: 'block' }}
    >
      <rect width={total} height="10" fill="#fff" />
      {widths.map((w, i) => {
        const bar = i % 2 === 0 ? <rect key={i} x={x} width={w} height="10" fill="#000" /> : null
        x += w
        return bar
      })}
    </svg>
  )
}

export default function ProductLabels() {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<LayoutKey>('a4')
  const [showPrice, setShowPrice] = useState(false)
  const [kind, setKind] = useState<CodeKind>('qr')
  const [qr, setQr] = useState<Record<string, string>>({})
  const { stores } = useAuth()
  const [stockStore, setStockStore] = useState('')
  const [loadingStock, setLoadingStock] = useState(false)
  const [stockNote, setStockNote] = useState('')

  useEffect(() => {
    ProductsService.list("status = 'ativo'")
      .then((list) => setProducts([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => console.error('Error loading products:', err))
  }, [])

  const chosen = products.filter((p) => (quantities[p.id] || 0) > 0 && p.sku)
  const labels = chosen.flatMap((p) => Array.from({ length: quantities[p.id] }, () => p))
  const skus = chosen.map((p) => p.sku).join('\n')

  useEffect(() => {
    const missing = skus.split('\n').filter((sku) => sku && !qr[sku])
    if (missing.length === 0) return
    // O gerador de QR só baixa nesta página.
    import('qrcode')
      .then(({ default: QRCode }) =>
        Promise.all(
          missing.map(async (sku) => [
            sku,
            await QRCode.toDataURL(sku, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
          ]),
        ),
      )
      .then((pairs) => setQr((prev) => ({ ...prev, ...Object.fromEntries(pairs) })))
  }, [skus, qr])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q),
    )
  }, [products, search])

  const setQty = (id: string, value: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, Math.min(500, value || 0)) }))

  // Uma etiqueta por unidade em estoque (na loja escolhida ou em todas).
  const fillFromStock = async () => {
    setLoadingStock(true)
    try {
      const items = await StockService.getStockItems(stockStore || undefined)
      const byProduct: Record<string, number> = {}
      for (const it of items) {
        if (it.quantity > 0) byProduct[it.product] = (byProduct[it.product] || 0) + it.quantity
      }
      const next: Record<string, number> = {}
      let units = 0
      let noSku = 0
      for (const p of products) {
        const qty = Math.min(500, Math.floor(byProduct[p.id] || 0))
        if (qty <= 0) continue
        if (!p.sku) {
          noSku++
          continue
        }
        next[p.id] = qty
        units += qty
      }
      setQuantities(next)
      setStockNote(
        units === 0
          ? 'Nenhum produto com estoque nesta escolha.'
          : `${units} etiqueta(s) de ${Object.keys(next).length} produto(s), uma por unidade em estoque.` +
              (noSku ? ` ${noSku} produto(s) sem código ficaram de fora.` : ''),
      )
    } catch (err: any) {
      setStockNote(`Não consegui ler o estoque: ${err.message}`)
    } finally {
      setLoadingStock(false)
    }
  }

  const size = LAYOUTS[layout]
  const qrSize = Math.min(size.height - 4, size.width * 0.45)
  // Uma folha (ou uma etiqueta térmica) por página impressa.
  const pages: ProductRecord[][] = []
  for (let i = 0; i < labels.length; i += size.perPage) {
    pages.push(labels.slice(i, i + size.perPage))
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] print:bg-white">
      <style>{`@media print { ${size.page} html, body { background: #fff; } }`}</style>

      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              to="/produtos"
              className="mb-1 inline-flex items-center text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Produtos
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
              Etiquetas dos produtos
            </h1>
            <p className="text-sm text-gray-500">
              Cada etiqueta leva o QR Code ou o código de barras com o código (SKU) do produto. Na
              Nova venda, o leitor ou a câmera do celular encontram o produto por ele. Produto
              repetido usa a mesma etiqueta.
            </p>
          </div>
          <Button
            onClick={() => window.print()}
            disabled={labels.length === 0}
            className="bg-[#0A8F5C] text-white hover:bg-[#087A4D]"
          >
            <Printer className="mr-2 h-4 w-4" /> Imprimir {labels.length} etiqueta(s)
          </Button>
        </div>

        <div className="grid gap-4 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="labelLayout" className="text-xs font-semibold">
              Formato
            </Label>
            <select
              id="labelLayout"
              value={layout}
              onChange={(e) => setLayout(e.target.value as LayoutKey)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(LAYOUTS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
            />
            Mostrar o preço
          </label>
          <div className="space-y-1 sm:col-span-3">
            <p className="text-xs font-semibold">Código na etiqueta</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="codeKind"
                  checked={kind === 'qr'}
                  onChange={() => setKind('qr')}
                />
                QR Code (câmera do celular)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="codeKind"
                  checked={kind === 'barras'}
                  onChange={() => setKind('barras')}
                />
                Código de barras (leitor de mão e câmera)
              </label>
            </div>
            <p className="text-[11px] text-gray-500">
              Leitor de mão comum (como o de supermercado) só lê código de barras. Na térmica 40 ×
              25 mm, o QR Code lê melhor.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="space-y-1">
            <Label htmlFor="stockStore" className="text-xs font-semibold">
              Quantidade pelo estoque
            </Label>
            <select
              id="stockStore"
              value={stockStore}
              onChange={(e) => setStockStore(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas as lojas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={fillFromStock} disabled={loadingStock}>
            <Boxes className="mr-2 h-4 w-4" />
            {loadingStock ? 'Lendo o estoque...' : 'Uma etiqueta por unidade em estoque'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuantities({})
              setStockNote('')
            }}
          >
            Zerar quantidades
          </Button>
          {stockNote && <p className="w-full text-sm text-gray-600">{stockNote}</p>}
        </div>

        <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar produto por nome ou código"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-80 divide-y overflow-y-auto">
            {visible.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="font-mono text-xs text-gray-500">
                    {p.sku || 'Sem código: cadastre o SKU para imprimir'}
                  </p>
                </div>
                <Input
                  type="number"
                  min="0"
                  max="500"
                  aria-label={`Quantidade de etiquetas de ${p.name}`}
                  disabled={!p.sku}
                  value={quantities[p.id] || ''}
                  placeholder="0"
                  onChange={(e) => setQty(p.id, parseInt(e.target.value, 10))}
                  className="h-8 w-20 text-right"
                />
              </div>
            ))}
          </div>
        </div>

        {labels.length > 0 ? (
          <p className="text-sm font-semibold text-gray-700">Prévia</p>
        ) : (
          <p className="text-sm text-gray-500">
            Digite a quantidade de um produto (ou use o estoque) e a prévia das etiquetas aparece
            aqui embaixo.
          </p>
        )}
      </div>

      <div className="mx-auto w-fit space-y-6 pb-10 print:space-y-0 print:p-0">
        {pages.map((page, pageIndex) => (
          <div
            key={pageIndex}
            className={`${size.sheet} ${pageIndex < pages.length - 1 ? 'break-after-page' : ''}`}
          >
            {page.map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                style={{ width: `${size.width}mm`, height: `${size.height}mm` }}
                className={`${
                  kind === 'barras'
                    ? 'flex flex-col justify-center text-center'
                    : 'flex items-center gap-[2mm]'
                } overflow-hidden border border-dashed border-gray-300 bg-white px-[2mm] text-black print:border-0`}
              >
                {kind === 'barras' ? (
                  <>
                    <p className="line-clamp-2 text-[7pt] font-bold leading-tight">{p.name}</p>
                    <div className="my-[1mm]">
                      <Barcode value={p.sku} heightMm={Math.max(8, size.height * 0.4)} />
                    </div>
                    <p className="font-mono text-[7pt] leading-none">{p.sku}</p>
                    {showPrice && (
                      <p className="mt-[0.5mm] text-[7pt] font-bold leading-none">
                        {formatBRL(p.sale_price)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {qr[p.sku] && (
                      <img
                        src={qr[p.sku]}
                        alt={`QR ${p.sku}`}
                        style={{ width: `${qrSize}mm`, height: `${qrSize}mm` }}
                        className="shrink-0"
                      />
                    )}
                    <div className="min-w-0 leading-tight">
                      <p className="line-clamp-3 text-[8pt] font-bold">{p.name}</p>
                      <p className="mt-[1mm] font-mono text-[7pt]">{p.sku}</p>
                      {showPrice && (
                        <p className="mt-[1mm] text-[8pt] font-bold">{formatBRL(p.sale_price)}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

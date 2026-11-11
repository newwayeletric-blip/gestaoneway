import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, Search } from 'lucide-react'
import { ProductsService } from '@/services/api'
import type { ProductRecord } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBRL } from '@/lib/formatters'

// Etiquetas com QR Code por modelo (dono, 11/11/2026): o QR guarda o SKU, o
// mesmo código que o leitor ou a câmera procuram na Nova venda. A página fica
// fora do layout do sistema para imprimir só as etiquetas.
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

export default function ProductLabels() {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<LayoutKey>('a4')
  const [showPrice, setShowPrice] = useState(false)
  const [qr, setQr] = useState<Record<string, string>>({})

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
              Etiquetas com QR Code
            </h1>
            <p className="text-sm text-gray-500">
              O QR Code guarda o código (SKU) do modelo. Na Nova venda, o leitor ou a câmera
              encontram o produto por ele.
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

        {labels.length > 0 && <p className="text-sm font-semibold text-gray-700">Prévia</p>}
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
                className="flex items-center gap-[2mm] overflow-hidden border border-dashed border-gray-300 bg-white px-[2mm] text-black print:border-0"
              >
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
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

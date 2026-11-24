import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, FileSpreadsheet, ImageDown, Upload, XCircle } from 'lucide-react'
import {
  ProductImportService,
  type ProductImportResponse,
  type ProductImportRow,
} from '@/services/api'
import { decodeCsvFile, parseCsv } from '@/lib/csv'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

// Importação de produtos (admin): a planilha revisada pelo dono (catálogo +
// Bling, salva como CSV) cria ou atualiza os produtos pelo SKU. Primeiro a
// prévia do servidor, sem gravar; depois a importação e as fotos do catálogo.
// Com a coluna "estoque", o saldo da loja escolhida passa a ser esse número.
type Line = ProductImportRow & { foto_principal?: string; origem?: string; duvidas?: string }

const COLUMNS = [
  'sku',
  'nome',
  'marca',
  'categoria',
  'descricao',
  'preco_venda',
  'custo',
  'pede_chassi',
  'limite_desconto',
  'ncm',
  'status',
  'estoque',
] as const

export default function ProductImport() {
  const { stores } = useAuth()
  const [store, setStore] = useState('')
  const [fileName, setFileName] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [preview, setPreview] = useState<ProductImportResponse | null>(null)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [withPhotos, setWithPhotos] = useState(true)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState<{
    summary: ProductImportResponse['summary']
    photos: number
    photoErrors: number
  } | null>(null)

  const toRows = (list: Line[]): ProductImportRow[] =>
    list.map(
      (l) => Object.fromEntries(COLUMNS.map((c) => [c, l[c] || ''])) as unknown as ProductImportRow,
    )

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setDone(null)
    setPreview(null)
    setSkipped(new Set())
    try {
      const parsed = parseCsv(decodeCsvFile(await file.arrayBuffer())) as unknown as Line[]
      if (parsed.length === 0 || !('sku' in parsed[0]) || !('nome' in parsed[0])) {
        throw new Error(
          'A planilha precisa das colunas "sku" e "nome". Salve como CSV (separado por ponto e vírgula).',
        )
      }
      setFileName(file.name)
      setLines(parsed)
      setBusy('Conferindo a planilha...')
      setPreview(await ProductImportService.run(toRows(parsed), true, store))
    } catch (err: any) {
      setLines([])
      toast({
        title: 'Não foi possível ler a planilha',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setBusy('')
    }
  }

  const toggle = (line: number) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })

  // Trocar a loja refaz a prévia, para mostrar o saldo atual dela.
  const changeStore = async (id: string) => {
    setStore(id)
    if (lines.length === 0) return
    setBusy('Conferindo a planilha...')
    try {
      setPreview(await ProductImportService.run(toRows(lines), true, id))
    } catch (err: any) {
      toast({
        title: 'Não foi possível conferir',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setBusy('')
    }
  }

  const resultFor = (index: number) => preview?.results.find((r) => r.line === index + 2)
  // Linhas marcadas e sem erro; a resposta do servidor vem na mesma ordem.
  const valid = lines.filter((_, i) => !skipped.has(i + 2) && resultFor(i)?.action !== 'erro')
  const hasStock = lines.some((l) => (l.estoque || '').trim() !== '')

  const handleImport = async () => {
    if (valid.length === 0) return
    if (hasStock && !store) {
      toast({ title: 'Escolha a loja do estoque', variant: 'destructive' })
      return
    }
    setBusy('Importando produtos...')
    try {
      const res = await ProductImportService.run(toRows(valid), false, store)
      let photos = 0
      let photoErrors = 0
      if (withPhotos) {
        const pending = res.results
          .map((r, i) => ({ r, url: valid[i].foto_principal || '' }))
          .filter(({ r, url }) => r.product && url && !r.has_photo)
        for (let i = 0; i < pending.length; i++) {
          setBusy(`Baixando fotos do catálogo: ${i + 1} de ${pending.length}...`)
          try {
            await ProductImportService.photoFromUrl(pending[i].r.product, pending[i].url)
            photos++
          } catch {
            photoErrors++
          }
        }
      }
      setDone({ summary: res.summary, photos, photoErrors })
      setLines([])
      setPreview(null)
      toast({ title: 'Importação concluída' })
    } catch (err: any) {
      toast({ title: 'A importação falhou', description: err.message, variant: 'destructive' })
    } finally {
      setBusy('')
    }
  }

  const importable = valid.length

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/produtos"
          className="mb-1 inline-flex items-center text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Produtos
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Importar produtos</h2>
        <p className="text-sm text-gray-500">
          Suba a planilha revisada (CSV). Cada linha cria o produto ou atualiza o que já tem o mesmo
          código (SKU). Se a planilha tiver a coluna &quot;estoque&quot;, o saldo da loja escolhida
          passa a ser esse número (como uma contagem); sem a coluna, o estoque não muda.
        </p>
      </div>

      <Card className="bg-white border-0 shadow-sm rounded-xl">
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <label className="inline-flex cursor-pointer items-center rounded-md bg-[#0A8F5C] px-4 py-2 text-sm font-medium text-white hover:bg-[#087A4D]">
            <Upload className="mr-2 h-4 w-4" /> Escolher planilha (.csv)
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </label>
          {fileName && (
            <span className="inline-flex items-center text-sm text-gray-600">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> {fileName}
            </span>
          )}
          {busy && <span className="text-sm font-medium text-[#0A8F5C]">{busy}</span>}
        </CardContent>
      </Card>

      {done && (
        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#0A8F5C]">
              <CheckCircle2 className="h-5 w-5" /> Importação concluída
            </CardTitle>
            <CardDescription>
              {done.summary.criar} produto(s) criado(s), {done.summary.atualizar} atualizado(s)
              {done.summary.estoque > 0 &&
                `, estoque de ${done.summary.estoque} produto(s) lançado`}
              .
              {withPhotos &&
                ` ${done.photos} foto(s) baixada(s)${
                  done.photoErrors > 0
                    ? `, ${done.photoErrors} foto(s) não baixaram (dá para importar de novo)`
                    : ''
                }.`}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {preview && lines.length > 0 && (
        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-base text-[#111111]">Prévia</CardTitle>
            <CardDescription>
              {preview.summary.criar} novo(s), {preview.summary.atualizar} para atualizar,{' '}
              {preview.summary.erro} com erro. Desmarque o que não quiser importar agora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasStock && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm">
                <label htmlFor="importStore" className="font-medium text-amber-900">
                  Loja do estoque:
                </label>
                <select
                  id="importStore"
                  value={store}
                  disabled={!!busy}
                  onChange={(e) => changeStore(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Escolha a loja</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-amber-800">
                  O saldo desta loja passa a ser o número da coluna &quot;estoque&quot;.
                </span>
              </div>
            )}
            <div className="max-h-[520px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs font-medium uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Importar</th>
                    <th className="px-3 py-2">Situação</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2 text-right">Preço</th>
                    <th className="px-3 py-2 text-right">Custo</th>
                    <th className="px-3 py-2 text-center">Chassi</th>
                    {hasStock && <th className="px-3 py-2 text-right">Estoque</th>}
                    <th className="px-3 py-2 text-center">Foto</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => {
                    const r = resultFor(i)
                    const line = i + 2
                    const isError = r?.action === 'erro'
                    return (
                      <tr
                        key={line}
                        className={isError ? 'bg-red-50/60' : skipped.has(line) ? 'opacity-50' : ''}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Importar linha ${line}`}
                            disabled={isError}
                            checked={!isError && !skipped.has(line)}
                            onChange={() => toggle(line)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {isError ? (
                            <span className="inline-flex items-start gap-1 text-xs text-red-700">
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{' '}
                              {r?.errors.join('; ')}
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                {r?.action === 'atualizar' ? 'atualizar' : 'novo'}
                              </Badge>
                              {(l.status || '').trim().toLowerCase() === 'inativo' && (
                                <Badge variant="outline" className="text-[10px] text-gray-500">
                                  inativo
                                </Badge>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{l.nome}</p>
                          {l.duvidas && <p className="text-xs text-amber-700">{l.duvidas}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs">{l.categoria}</td>
                        <td className="px-3 py-2 text-right text-xs">{l.preco_venda || '-'}</td>
                        <td className="px-3 py-2 text-right text-xs">{l.custo || '-'}</td>
                        <td className="px-3 py-2 text-center text-xs">{l.pede_chassi}</td>
                        {hasStock && (
                          <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                            {r?.stock === null || r?.stock === undefined
                              ? '-'
                              : r.stock_before === null || r.stock_before === r.stock
                                ? r.stock
                                : `${r.stock_before} → ${r.stock}`}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center">
                          {l.foto_principal ? (
                            <ImageDown className="inline h-4 w-4 text-gray-500" />
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                onClick={handleImport}
                disabled={!!busy || importable === 0 || (hasStock && !store)}
                className="bg-[#0A8F5C] text-white hover:bg-[#087A4D]"
              >
                Importar {importable} produto(s)
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withPhotos}
                  onChange={(e) => setWithPhotos(e.target.checked)}
                />
                Baixar as fotos do catálogo (só de quem ainda não tem foto)
              </label>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

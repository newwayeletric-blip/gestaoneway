import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileCheck, Hash, ScanLine, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SalesService, type SerialHistoryItem } from '@/services/api'
import { formatDateBR } from '@/lib/formatters'
import { saleStatusClass, saleStatusLabel } from '@/lib/saleStatus'
import { toast } from '@/hooks/use-toast'

// Números de série (admin): onde cada série foi vendida, para quem e se a NF
// já foi anexada. A série é informada na venda (Nova venda).
export function SerialNumbers() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SerialHistoryItem[] | null>(null)
  const [searching, setSearching] = useState(false)

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 3) {
      toast({ title: 'Digite ao menos 3 caracteres do chassi', variant: 'destructive' })
      return
    }
    setSearching(true)
    try {
      setResults(await SalesService.findSerial(q))
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err.message, variant: 'destructive' })
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Consulta de chassi</h2>
        <p className="text-sm text-gray-500">
          Bipe ou digite o chassi (ou parte dele) para ver onde a unidade foi vendida.
        </p>
      </div>

      <Card className="bg-white border-0 shadow-sm rounded-xl">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-3 max-w-xl">
            <div className="relative flex-1">
              <ScanLine className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Ex.: HOPSKD7C7SC042047"
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                className="pl-9 font-mono"
              />
            </div>
            <Button
              type="submit"
              disabled={searching}
              className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white shrink-0"
            >
              <Search className="h-4 w-4 mr-1.5" /> {searching ? 'Buscando...' : 'Buscar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results !== null && (
        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-base text-[#111111] flex items-center gap-2">
              <Hash className="h-4 w-4" /> {results.length} resultado(s)
            </CardTitle>
            {results.length === 0 && (
              <CardDescription>Nenhuma venda com esse chassi.</CardDescription>
            )}
          </CardHeader>
          {results.length > 0 && (
            <CardContent>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-left text-xs uppercase font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Chassi</th>
                      <th className="py-2.5 px-3">Produto</th>
                      <th className="py-2.5 px-3">Venda</th>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Loja / vendedor</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3 text-center">NF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {results.map((r) => (
                      <tr key={`${r.sale_id}-${r.serial_number}`} className="hover:bg-muted/40">
                        <td className="py-2.5 px-3 font-mono text-xs font-semibold">
                          {r.serial_number}
                          {r.returned && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              devolvido
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-medium">{r.product_name}</p>
                          {r.sku && <p className="text-xs text-muted-foreground">{r.sku}</p>}
                        </td>
                        <td className="py-2.5 px-3">
                          <Link
                            to={`/vendas/${r.sale_id}`}
                            className="font-semibold text-[#0A8F5C] hover:underline"
                          >
                            {r.sale_number}
                          </Link>
                          <div>
                            <Badge className={`mt-1 text-[10px] ${saleStatusClass(r.sale_status)}`}>
                              {saleStatusLabel(r.sale_status)}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          {r.date ? formatDateBR(r.date) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          <p>{r.store}</p>
                          <p className="text-muted-foreground">{r.seller}</p>
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          <p className="font-medium">{r.customer_name}</p>
                          <p className="text-muted-foreground">
                            {[r.customer_phone, r.customer_document].filter(Boolean).join(' • ')}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.has_nf ? (
                            <FileCheck className="h-4 w-4 text-emerald-600 inline" />
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
          )}
        </Card>
      )}
    </div>
  )
}

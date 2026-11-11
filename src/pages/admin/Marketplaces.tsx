import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpFromLine,
  Download,
  Link2,
  Plus,
  RefreshCw,
  Settings2,
  Store as StoreIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  MarketplaceService,
  ProductsService,
  type ChannelKind,
  type ChannelStockRow,
  type MarketplaceOrder,
  type SalesChannel,
} from '@/services/api'
import type { ProductRecord, UserRecord } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBRL } from '@/lib/formatters'
import { useToast } from '@/hooks/use-toast'

// Marketplaces pelo Bling (dono, 11/11/2026): os pedidos do Mercado Livre (e
// da Amazon, quando ligada no Bling) viram vendas da loja do canal (a Loja de
// rua), sem aprovação e sem outra NF; o estoque da loja volta para o Bling,
// que atualiza os anúncios. Só o administrador.
const KIND_LABELS: Record<ChannelKind, string> = {
  mercado_livre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee',
  magalu: 'Magalu',
  outro: 'Outro',
}
const STATUS_LABELS: Record<MarketplaceOrder['status'], string> = {
  importado: 'Venda criada',
  aguardando_vinculo: 'Falta vincular produto',
  ignorado: 'Cancelado antes de entrar',
  cancelado: 'Cancelado (venda cancelada)',
  erro: 'Erro',
}
const STATUS_CLASS: Record<MarketplaceOrder['status'], string> = {
  importado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  aguardando_vinculo: 'bg-amber-50 text-amber-800 border-amber-200',
  ignorado: 'bg-gray-50 text-gray-600 border-gray-200',
  cancelado: 'bg-gray-100 text-gray-700 border-gray-300',
  erro: 'bg-red-50 text-red-700 border-red-200',
}
const guessKind = (text: string): ChannelKind =>
  /mercado\s*livre|mercadolivre/i.test(text)
    ? 'mercado_livre'
    : /amazon/i.test(text)
      ? 'amazon'
      : /shopee/i.test(text)
        ? 'shopee'
        : /magalu|magazine/i.test(text)
          ? 'magalu'
          : 'outro'
const today = () => new Date().toLocaleDateString('sv-SE')
const when = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString('pt-BR') : 'ainda não')

interface ChannelDraft {
  bling_store_id: string
  name: string
  kind: ChannelKind
  active: boolean
  stock_store: string
  seller: string
  import_from: string
  sync_stock: boolean
  bling_deposit_id: string
}

export default function Marketplaces() {
  const { toast } = useToast()
  const { stores, user } = useAuth()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [channels, setChannels] = useState<SalesChannel[]>([])
  const [orders, setOrders] = useState<MarketplaceOrder[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [staff, setStaff] = useState<UserRecord[]>([])
  const [discovered, setDiscovered] = useState<Awaited<
    ReturnType<typeof MarketplaceService.discover>
  > | null>(null)
  const [draft, setDraft] = useState<ChannelDraft | null>(null)
  const [busy, setBusy] = useState('')
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({})
  const [stockChannel, setStockChannel] = useState('')
  const [stockRows, setStockRows] = useState<ChannelStockRow[] | null>(null)

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name || '—'
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name || '—'

  const load = async () => {
    try {
      const data = await MarketplaceService.overview()
      setConnected(data.connected)
      setChannels(data.channels)
      if (!stockChannel && data.channels[0]) setStockChannel(data.channels[0].id)
      setOrders(await MarketplaceService.orders(statusFilter))
    } catch (err: any) {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    load()
    ProductsService.list("status = 'ativo'")
      .then((list) => setProducts([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
    MarketplaceService.staff()
      .then(setStaff)
      .catch(() => {})
  }, [])

  useEffect(() => {
    MarketplaceService.orders(statusFilter)
      .then(setOrders)
      .catch(() => {})
  }, [statusFilter])

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what)
    try {
      await fn()
    } catch (err: any) {
      toast({ title: 'Não deu certo', description: err.message, variant: 'destructive' })
    } finally {
      setBusy('')
    }
  }

  const openDiscover = () =>
    run('discover', async () => {
      setDiscovered(await MarketplaceService.discover())
    })

  const startDraft = (c: Partial<SalesChannel> & { bling_store_id: string }, hint = '') =>
    setDraft({
      bling_store_id: c.bling_store_id,
      name: c.name || (hint ? KIND_LABELS[guessKind(hint)] : '') || `Canal ${c.bling_store_id}`,
      kind: c.kind || guessKind(hint || c.name || ''),
      active: c.active ?? false,
      stock_store:
        c.stock_store ??
        stores.find((s) => /rua|cajuru/i.test(s.name + ' ' + (s.slug || '')))?.id ??
        '',
      seller: c.seller ?? user?.id ?? '',
      import_from: c.import_from || today(),
      sync_stock: c.sync_stock ?? false,
      bling_deposit_id: c.bling_deposit_id || '',
    })

  const editChannel = async (c: SalesChannel) => {
    startDraft(c)
    if (!discovered) {
      try {
        setDiscovered(await MarketplaceService.discover())
      } catch {
        // Sem a lista do Bling, o canal ainda pode ser editado.
      }
    }
  }

  const saveDraft = (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    run('save', async () => {
      await MarketplaceService.saveChannel(draft)
      setDraft(null)
      toast({ title: 'Canal salvo!' })
      await load()
    })
  }

  const importNow = (c: SalesChannel) =>
    run('import-' + c.id, async () => {
      const s = await MarketplaceService.importNow(c.id)
      toast({
        title: `${c.name}: ${s.imported} venda(s) nova(s)`,
        description:
          [
            s.waiting ? `${s.waiting} esperando vincular produto` : '',
            s.canceled ? `${s.canceled} cancelada(s)` : '',
            s.errors ? `${s.errors} com erro` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Tudo em dia.',
      })
      await load()
    })

  const linkProduct = (o: MarketplaceOrder, item: NonNullable<MarketplaceOrder['missing']>[0]) => {
    const product = linkChoice[item.bling_product_id]
    if (!product) {
      toast({ title: 'Escolha o produto do sistema', variant: 'destructive' })
      return
    }
    run('link-' + item.bling_product_id, async () => {
      await MarketplaceService.link({
        bling_product_id: item.bling_product_id,
        bling_code: item.code,
        bling_name: item.name,
        product,
      })
      const channel = channels.find((c) => c.id === o.channel)
      if (channel) await MarketplaceService.importNow(channel.id)
      toast({ title: 'Produto vinculado!', description: 'Os pedidos que esperavam já entraram.' })
      await load()
    })
  }

  const compareStock = () =>
    run('stock', async () => {
      setStockRows(await MarketplaceService.stock(stockChannel))
    })

  const pushStock = () =>
    run('push', async () => {
      const res = await MarketplaceService.pushStock(stockChannel)
      toast({
        title: `Estoque de ${res.sent} produto(s) foi para o Bling`,
        description: res.failures.length ? res.failures.join('; ') : undefined,
        variant: res.failures.length ? 'destructive' : undefined,
      })
      setStockRows(await MarketplaceService.stock(stockChannel))
      await load()
    })

  const waiting = useMemo(() => orders.filter((o) => o.status === 'aguardando_vinculo'), [orders])
  const configuredIds = new Set(channels.map((c) => c.bling_store_id))
  const selectedChannel = channels.find((c) => c.id === stockChannel)
  const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Marketplaces</h2>
        <p className="text-sm text-gray-500">
          Os pedidos do Mercado Livre e da Amazon chegam pelo Bling e viram vendas da loja do canal,
          sem aprovação e sem outra nota (a nota sai pelo Bling). O estoque da loja volta para o
          Bling, que atualiza os anúncios.
        </p>
      </div>

      {connected === false && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="flex items-start gap-3 pt-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              O Bling não está conectado.{' '}
              <Link to="/configuracoes" className="font-semibold underline">
                Conecte em Configurações → Bling
              </Link>{' '}
              para os marketplaces funcionarem.
            </p>
          </CardContent>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <Link2 className="h-4 w-4" /> {waiting.length} pedido(s) esperando vincular produto
            </CardTitle>
            <CardDescription className="text-amber-900/80">
              O produto do pedido no Bling não tem um produto igual no sistema (pelo código).
              Escolha o produto do sistema uma vez e o pedido entra; os próximos já entram sozinhos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {waiting.map((o) => (
              <div key={o.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                <p className="font-semibold">
                  {channelName(o.channel)} · pedido {o.external_number} · {o.customer_name} ·{' '}
                  {formatBRL(o.total)}
                </p>
                {(o.missing || []).map((item) => (
                  <div
                    key={item.bling_product_id}
                    className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
                    <p className="min-w-0 flex-1 text-gray-700">
                      No Bling: <span className="font-mono">{item.code || 'sem código'}</span> —{' '}
                      {item.name}
                    </p>
                    <select
                      aria-label={`Produto do sistema para ${item.code || item.name}`}
                      value={linkChoice[item.bling_product_id] || ''}
                      onChange={(e) =>
                        setLinkChoice((prev) => ({
                          ...prev,
                          [item.bling_product_id]: e.target.value,
                        }))
                      }
                      className={`${selectClass} sm:w-72`}
                    >
                      <option value="">Escolha o produto do sistema</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => linkProduct(o, item)}
                      disabled={!!busy}
                      className="bg-[#0A8F5C] text-white hover:bg-[#087A4D]"
                    >
                      Vincular
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="canais" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="canais">Canais</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
        </TabsList>

        <TabsContent value="canais" className="space-y-4">
          {channels.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhum canal ainda. Clique em "Adicionar canal do Bling" para escolher o Mercado
              Livre.
            </p>
          )}
          {channels.map((c) => (
            <Card key={c.id} className="border-0 bg-white shadow-sm">
              <CardContent className="flex flex-col gap-3 pt-5 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {c.name}
                    <Badge variant="outline">{KIND_LABELS[c.kind] || c.kind}</Badge>
                    {c.active ? (
                      <Badge className="bg-emerald-600 text-white">Importando</Badge>
                    ) : (
                      <Badge variant="outline">Desligado</Badge>
                    )}
                    {c.sync_stock && (
                      <Badge className="bg-sky-600 text-white">Estoque indo para o Bling</Badge>
                    )}
                  </div>
                  <p className="text-gray-600">
                    Estoque: <strong>{storeName(c.stock_store)}</strong> · pedidos desde{' '}
                    {c.import_from || '—'} · última busca: {when(c.last_import_at)}
                  </p>
                  <p className="text-gray-600">
                    {c.imported} venda(s) criada(s)
                    {c.waiting ? ` · ${c.waiting} esperando vínculo` : ''}
                    {c.errors ? ` · ${c.errors} com erro` : ''}
                  </p>
                  {c.last_error && (
                    <p className="flex items-start gap-1 text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {c.last_error}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => importNow(c)}
                    disabled={!!busy || !c.stock_store}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    {busy === 'import-' + c.id ? 'Buscando...' : 'Buscar pedidos agora'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => editChannel(c)}>
                    <Settings2 className="mr-1.5 h-4 w-4" /> Configurar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed bg-white shadow-none">
            <CardContent className="space-y-3 pt-5 text-sm">
              <Button
                variant="outline"
                onClick={openDiscover}
                disabled={!!busy || connected === false}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {busy === 'discover' ? 'Lendo o Bling...' : 'Adicionar canal do Bling'}
              </Button>
              {discovered && (
                <div className="space-y-2">
                  {discovered.source === 'pedidos' && (
                    <p className="text-xs text-gray-500">
                      Canais achados pelos pedidos dos últimos 120 dias. O pedido do Mercado Livre
                      começa com 2000.
                    </p>
                  )}
                  {discovered.channels.filter((d) => !configuredIds.has(d.bling_store_id))
                    .length === 0 && <p className="text-gray-500">Nenhum canal novo no Bling.</p>}
                  {discovered.channels
                    .filter((d) => !configuredIds.has(d.bling_store_id))
                    .map((d) => (
                      <div
                        key={d.bling_store_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <p>
                          <StoreIcon className="mr-1 inline h-4 w-4" />
                          <strong>{d.name || `Canal ${d.bling_store_id}`}</strong>{' '}
                          {d.type && <span className="text-gray-500">({d.type})</span>}
                          {d.orders ? (
                            <span className="text-gray-500">
                              {' '}
                              · {d.orders} pedido(s), ex.: {d.sample}
                            </span>
                          ) : null}
                        </p>
                        <Button
                          size="sm"
                          onClick={() =>
                            startDraft(
                              { bling_store_id: d.bling_store_id, name: d.name },
                              `${d.name} ${d.type} ${d.sample?.startsWith('2000') ? 'Mercado Livre' : ''}`,
                            )
                          }
                        >
                          Configurar este canal
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pedidos" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="orderStatus" className="text-xs font-semibold">
              Mostrar
            </Label>
            <select
              id="orderStatus"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                      Nenhum pedido ainda.
                    </td>
                  </tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {o.order_date.split('-').reverse().join('/')}
                    </td>
                    <td className="px-3 py-2">{channelName(o.channel)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{o.external_number}</td>
                    <td className="px-3 py-2">{o.customer_name}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(o.total)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={STATUS_CLASS[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                      {o.note && <p className="mt-1 text-xs text-gray-500">{o.note}</p>}
                    </td>
                    <td className="px-3 py-2">
                      {o.sale ? (
                        <Link to={`/vendas/${o.sale}`} className="text-[#0A8F5C] underline">
                          {o.sale_number || 'abrir'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="estoque" className="space-y-3">
          <Card className="border-0 bg-white shadow-sm">
            <CardContent className="space-y-3 pt-5 text-sm">
              <p className="text-gray-600">
                Compare o estoque da loja do canal com o do Bling (o que os anúncios mostram). Com
                "Mandar o estoque da loja para o Bling" ligado no canal, o sistema manda o saldo a
                cada 5 minutos, e o Bling atualiza os anúncios.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="stockChannel" className="text-xs font-semibold">
                    Canal
                  </Label>
                  <select
                    id="stockChannel"
                    value={stockChannel}
                    onChange={(e) => {
                      setStockChannel(e.target.value)
                      setStockRows(null)
                    }}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="outline" onClick={compareStock} disabled={!stockChannel || !!busy}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  {busy === 'stock' ? 'Comparando...' : 'Comparar com o Bling'}
                </Button>
                {selectedChannel?.sync_stock && (
                  <Button
                    onClick={pushStock}
                    disabled={!!busy}
                    className="bg-[#0A8F5C] text-white hover:bg-[#087A4D]"
                  >
                    <ArrowUpFromLine className="mr-1.5 h-4 w-4" />
                    {busy === 'push' ? 'Mandando...' : 'Mandar estoque agora'}
                  </Button>
                )}
              </div>
              {stockRows && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="border-b text-left text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-2 pr-3">Produto</th>
                        <th className="py-2 pr-3">Código no Bling</th>
                        <th className="py-2 pr-3 text-right">
                          {storeName(selectedChannel?.stock_store || '')}
                        </th>
                        <th className="py-2 pr-3 text-right">Bling</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stockRows.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-gray-500">
                            Nenhum produto vinculado ainda. Os vínculos aparecem quando os pedidos
                            entram.
                          </td>
                        </tr>
                      )}
                      {stockRows.map((r) => (
                        <tr key={r.bling_product_id}>
                          <td className="py-2 pr-3">
                            {r.product_name}{' '}
                            <span className="font-mono text-xs text-gray-500">{r.sku}</span>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{r.bling_code}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{r.system_qty}</td>
                          <td
                            className={`py-2 pr-3 text-right ${r.system_qty !== r.bling_qty ? 'font-semibold text-amber-700' : ''}`}
                          >
                            {r.bling_qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          {draft && (
            <form onSubmit={saveDraft} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Canal do Bling {draft.bling_store_id}</DialogTitle>
                <DialogDescription>
                  Os pedidos deste canal viram vendas confirmadas da loja escolhida.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="chName" className="text-xs font-semibold">
                    Nome
                  </Label>
                  <Input
                    id="chName"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chKind" className="text-xs font-semibold">
                    Marketplace
                  </Label>
                  <select
                    id="chKind"
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as ChannelKind })}
                    className={selectClass}
                  >
                    {Object.entries(KIND_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chStore" className="text-xs font-semibold">
                    Loja do estoque
                  </Label>
                  <select
                    id="chStore"
                    value={draft.stock_store}
                    onChange={(e) => setDraft({ ...draft, stock_store: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Escolha a loja</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chSeller" className="text-xs font-semibold">
                    Responsável pelas vendas
                  </Label>
                  <select
                    id="chSeller"
                    value={draft.seller}
                    onChange={(e) => setDraft({ ...draft, seller: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Escolha</option>
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="chFrom" className="text-xs font-semibold">
                    Importar pedidos a partir de
                  </Label>
                  <Input
                    id="chFrom"
                    type="date"
                    value={draft.import_from}
                    onChange={(e) => setDraft({ ...draft, import_from: e.target.value })}
                  />
                  <p className="text-[11px] text-gray-500">
                    Pedido antigo também baixa o estoque da loja. Para não baixar de novo o que já
                    saiu, comece de hoje.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Importar os pedidos deste canal (a cada 5 minutos)
              </label>
              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={draft.sync_stock}
                    onChange={(e) => setDraft({ ...draft, sync_stock: e.target.checked })}
                  />
                  Mandar o estoque da loja para o Bling (atualiza os anúncios)
                </label>
                <select
                  aria-label="Depósito do Bling"
                  value={draft.bling_deposit_id}
                  onChange={(e) => setDraft({ ...draft, bling_deposit_id: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Depósito do Bling</option>
                  {(discovered?.deposits || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.standard ? ' (padrão)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-sky-900">
                  O saldo do sistema substitui o do Bling. Ligue só depois de lançar o estoque certo
                  da loja e conferir na aba Estoque: produto com zero no sistema para de vender no
                  marketplace.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={busy === 'save'}
                  className="bg-[#0A8F5C] text-white hover:bg-[#087A4D]"
                >
                  {busy === 'save' ? 'Salvando...' : 'Salvar canal'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

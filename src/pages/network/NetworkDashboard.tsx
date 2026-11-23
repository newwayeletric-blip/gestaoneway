// PNR-01/02/03: painel da rede, para o admin da rede (dono, 23/11/2026: "eu
// como adm tenho que ter acesso" às vendas e ao desempenho das franquias).
// Vendas, estoque e desempenho das lojas próprias e das franquias por mês.
// Clientes, custos e despesas das franquias continuam só com o franqueado
// (R.2, ESC-07): o servidor nem manda esses dados.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Info,
  Loader2,
  PackageX,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import type {
  NetworkOrgPerformance,
  NetworkPerformance,
  NetworkStock,
  NetworkTotals,
} from '@/types'
import { NetworkService } from '@/services/api'
import { formatBRL, formatDateBR, formatNumberBR } from '@/lib/formatters'
import { saleStatusClass, saleStatusLabel } from '@/lib/saleStatus'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { StatusBadge } from './franchiseForm'

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Débito',
  cartao_credito: 'Crédito',
  marketplace: 'Marketplace',
}

// Mês de Brasília (AAAA-MM), "delta" meses a partir do atual.
const brMonth = (delta = 0) => {
  const now = new Date(Date.now() - 3 * 3600000)
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthName = (month: string, style: 'long' | 'short' = 'long') => {
  const [y, m] = month.split('-').map(Number)
  const text = new Intl.DateTimeFormat('pt-BR', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)))
  return text.replace('.', '')
}
const capFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
// O banco grava "2026-11-23 21:00:22.123Z"; o Safari só aceita com "T".
const parseDate = (value: string) => new Date(value.replace(' ', 'T'))
const daysSince = (value: string) =>
  value ? Math.floor((Date.now() - parseDate(value).getTime()) / 86400000) : null
const compactBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)

const emptyTotals = (): NetworkTotals => ({
  revenue: 0,
  sales: 0,
  ticket: 0,
  items: 0,
  discounts: 0,
  canceled: 0,
  canceled_value: 0,
  returned: 0,
  rejected: 0,
  pending: 0,
  prev_revenue: 0,
  prev_sales: 0,
})
const sumTotals = (list: NetworkTotals[]): NetworkTotals => {
  const t = emptyTotals()
  for (const x of list) {
    for (const key of Object.keys(t) as (keyof NetworkTotals)[]) t[key] += x[key]
  }
  t.ticket = t.sales > 0 ? t.revenue / t.sales : 0
  return t
}
const sumStock = (list: NetworkStock[]): NetworkStock =>
  list.reduce(
    (acc, s) => ({
      units: acc.units + s.units,
      products: acc.products + s.products,
      value: acc.value + s.value,
    }),
    { units: 0, products: 0, value: 0 },
  )

// Variação contra o período anterior. Sem base para comparar: um aviso curto
// nos cartões e um traço nas tabelas.
function Delta({ now, before, compact }: { now: number; before: number; compact?: boolean }) {
  if (before <= 0) {
    if (compact) return <span className="text-[11px] text-gray-400">—</span>
    return now > 0 ? (
      <span className="text-[11px] font-medium text-gray-500">sem vendas no período anterior</span>
    ) : null
  }
  const pct = ((now - before) / before) * 100
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        up ? 'text-[#0A8F5C]' : 'text-red-600'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? '+' : '−'}
      {Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  )
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <Card className="bg-white border-0 shadow-sm rounded-xl">
      <CardContent className="p-4 space-y-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-xl font-bold text-[#111111] tabular-nums">{value}</p>
        {detail ? <div className="min-h-[16px]">{detail}</div> : null}
      </CardContent>
    </Card>
  )
}

// Faturamento dos últimos 6 meses: uma série, uma cor; o valor aparece no mês
// apontado (ou no último), e a tabela traz todos os números.
function HistoryChart({ history }: { history: NetworkOrgPerformance['history'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(0, ...history.map((h) => h.revenue))
  const shown = history[hover ?? history.length - 1]

  return (
    <Card className="bg-white border-0 shadow-sm rounded-xl">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm font-bold text-[#111111]">
            Faturamento nos últimos 6 meses
          </CardTitle>
          <CardDescription className="text-xs">Vendas confirmadas, por mês.</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </Button>
      </CardHeader>
      <CardContent>
        {asTable ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 font-medium">Mês</th>
                <th className="py-1 font-medium text-right">Faturamento</th>
                <th className="py-1 font-medium text-right">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.month} className="border-t border-gray-100">
                  <td className="py-1.5">{capFirst(monthName(h.month))}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatBRL(h.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{h.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : max === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            Nenhuma venda confirmada nos últimos 6 meses.
          </p>
        ) : (
          <div>
            <p className="text-xs text-gray-600 min-h-[18px]" aria-live="polite">
              <span className="font-semibold text-[#111111]">
                {capFirst(monthName(shown.month))}
              </span>
              : {formatBRL(shown.revenue)} · {shown.sales} {shown.sales === 1 ? 'venda' : 'vendas'}
            </p>
            {/* Rótulo do maior valor acima da linha de grade, fora das colunas. */}
            <p className="mt-3 text-[10px] text-gray-400 tabular-nums">{compactBRL(max)}</p>
            <div className="relative h-32 border-t border-gray-100">
              <div
                className="absolute inset-0 flex items-end border-b border-gray-200"
                onMouseLeave={() => setHover(null)}
              >
                {history.map((h, i) => (
                  <button
                    key={h.month}
                    type="button"
                    aria-label={`${monthName(h.month)}: ${formatBRL(h.revenue)}, ${h.sales} vendas`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className={`flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0A8F5C]/40 ${
                      hover === i ? 'bg-gray-50' : ''
                    }`}
                  >
                    <span
                      className="block w-6 max-w-[60%] rounded-t bg-[#0A8F5C]"
                      style={{
                        height: h.revenue > 0 ? `max(2px, ${(h.revenue / max) * 100}%)` : 0,
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1 flex">
              {history.map((h) => (
                <span key={h.month} className="flex-1 text-center text-[11px] text-gray-500">
                  {monthName(h.month, 'short')}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface Alert {
  org: string
  level: 'critico' | 'atencao' | 'info'
  text: string
}

// PNR-03: pontos de atenção de cada franquia.
const franchiseAlerts = (org: NetworkOrgPerformance): Alert[] => {
  const out: Alert[] = []
  if (org.active_products === 0) {
    out.push({
      org: org.name,
      level: 'critico',
      text: 'Nenhum produto cadastrado: a franquia ainda não consegue vender.',
    })
  } else if (org.stock.units === 0) {
    out.push({ org: org.name, level: 'atencao', text: 'Sem estoque lançado nas lojas.' })
  }
  const days = daysSince(org.last_sale_at)
  if (days === null) {
    out.push({ org: org.name, level: 'atencao', text: 'Ainda não fez nenhuma venda.' })
  } else if (days >= 7) {
    out.push({ org: org.name, level: 'atencao', text: `Sem vendas há ${days} dias.` })
  }
  if (org.totals.pending > 0) {
    out.push({
      org: org.name,
      level: 'atencao',
      text: `${org.totals.pending} ${
        org.totals.pending === 1 ? 'venda esperando' : 'vendas esperando'
      } a aprovação do franqueado.`,
    })
  }
  if (org.status === 'implantacao') {
    out.push({ org: org.name, level: 'info', text: 'Em implantação.' })
  } else if (org.status === 'suspensa') {
    out.push({ org: org.name, level: 'critico', text: 'Franquia suspensa.' })
  }
  if (org.users <= 1) {
    out.push({
      org: org.name,
      level: 'info',
      text: 'Só o proprietário tem acesso: nenhum vendedor cadastrado.',
    })
  }
  return out
}

const ALERT_STYLE: Record<Alert['level'], { icon: typeof Info; className: string; label: string }> =
  {
    critico: { icon: PackageX, className: 'text-red-600', label: 'Crítico' },
    atencao: { icon: AlertTriangle, className: 'text-amber-600', label: 'Atenção' },
    info: { icon: Info, className: 'text-gray-500', label: 'Informação' },
  }

export default function NetworkDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const scope = searchParams.get('escopo') || 'rede'
  const [month, setMonth] = useState(brMonth())
  const [data, setData] = useState<NetworkPerformance | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const load = async (m = month) => {
    setLoading(true)
    try {
      setData(await NetworkService.performance(m))
      setLoadError('')
    } catch (err: any) {
      if (err?.isAbort) return
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar o painel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(month)
  }, [month])

  const setScope = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'rede') next.delete('escopo')
    else next.set('escopo', value)
    setSearchParams(next, { replace: true })
  }

  const orgs = useMemo(() => data?.organizations || [], [data])
  const franchises = useMemo(() => orgs.filter((o) => o.type === 'franquia'), [orgs])
  // Link antigo (franquia que não existe mais) volta para a rede inteira.
  const scopeKnown =
    scope === 'rede' ||
    scope === 'franquias' ||
    scope === 'proprias' ||
    orgs.some((o) => o.id === scope)
  const activeScope = scopeKnown ? scope : 'rede'
  const scoped = useMemo(() => {
    if (activeScope === 'franquias') return orgs.filter((o) => o.type === 'franquia')
    if (activeScope === 'proprias') return orgs.filter((o) => o.type === 'propria')
    if (activeScope === 'rede') return orgs
    return orgs.filter((o) => o.id === activeScope)
  }, [orgs, activeScope])
  const single = ['rede', 'franquias', 'proprias'].includes(activeScope) ? null : scoped[0] || null

  const totals = useMemo(() => sumTotals(scoped.map((o) => o.totals)), [scoped])
  const stock = useMemo(() => sumStock(scoped.map((o) => o.stock)), [scoped])
  const history = useMemo(() => {
    if (scoped.length === 0) return []
    return scoped[0].history.map((h, i) => ({
      month: h.month,
      revenue: scoped.reduce((sum, o) => sum + o.history[i].revenue, 0),
      sales: scoped.reduce((sum, o) => sum + o.history[i].sales, 0),
    }))
  }, [scoped])
  const stores = useMemo(
    () =>
      scoped
        .flatMap((o) => o.stores.map((s) => ({ ...s, orgName: o.name, orgType: o.type })))
        .sort((a, b) => b.totals.revenue - a.totals.revenue || a.name.localeCompare(b.name)),
    [scoped],
  )
  const alerts = useMemo(
    () => scoped.filter((o) => o.type === 'franquia').flatMap(franchiseAlerts),
    [scoped],
  )

  const monthOptions = Array.from({ length: 12 }, (_, i) => brMonth(-i))
  const compareText = data
    ? data.current
      ? `contra 1 a ${data.compare_until_day} de ${monthName(previousMonth(data.month))}`
      : `contra ${monthName(previousMonth(data.month))}`
    : ''
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Painel da rede</h2>
          <p className="text-sm text-gray-500">
            Vendas, estoque e desempenho das lojas próprias e das franquias.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="networkScope" className="text-xs font-semibold">
              Ver
            </Label>
            <select
              id="networkScope"
              value={activeScope}
              onChange={(e) => setScope(e.target.value)}
              className="h-9 w-full sm:w-auto rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="rede">Rede inteira</option>
              <option value="franquias">Só as franquias</option>
              <option value="proprias">Lojas próprias</option>
              {franchises.map((o) => (
                <option key={o.id} value={o.id}>
                  Franquia: {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="networkMonth" className="text-xs font-semibold">
              Mês
            </Label>
            <select
              id="networkMonth"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {capFirst(monthName(m))}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => load()}
            disabled={loading}
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin text-[#0A8F5C]" /> Carregando o painel...
        </div>
      ) : loadError && !data ? (
        <Card className="bg-white border-0 shadow-sm rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-red-700">Não foi possível carregar o painel: {loadError}</p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Tentar de novo
          </Button>
        </Card>
      ) : data ? (
        <>
          {loadError ? (
            <p className="text-sm text-red-700">Não foi possível atualizar: {loadError}</p>
          ) : null}

          {single ? (
            <Card className="bg-white border-0 shadow-sm rounded-xl">
              <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-base font-bold text-[#111111]">{single.name}</span>
                <StatusBadge status={single.status} />
                <span className="text-xs text-gray-500">
                  {single.region ? `${single.region} · ` : ''}
                  {single.stores.length} {single.stores.length === 1 ? 'loja' : 'lojas'} ·{' '}
                  {single.users} {single.users === 1 ? 'usuário ativo' : 'usuários ativos'} ·{' '}
                  {single.active_products} produtos ativos · desde{' '}
                  {formatDateBR(parseDate(single.created))}
                </span>
              </CardContent>
            </Card>
          ) : null}

          <div>
            <p className="mb-2 text-xs text-gray-500">
              {capFirst(monthName(data.month))}
              {data.current ? ' (até hoje)' : ''} · variação {compareText}
              {scoped.length > 1
                ? ` · ${stores.length} ${stores.length === 1 ? 'loja' : 'lojas'} somadas`
                : ''}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile
                label="Faturamento"
                value={formatBRL(totals.revenue)}
                detail={<Delta now={totals.revenue} before={totals.prev_revenue} />}
              />
              <StatTile
                label="Vendas confirmadas"
                value={formatNumberBR(totals.sales)}
                detail={<Delta now={totals.sales} before={totals.prev_sales} />}
              />
              <StatTile label="Ticket médio" value={formatBRL(totals.ticket)} />
              <StatTile label="Itens vendidos" value={formatNumberBR(totals.items)} />
              <StatTile label="Descontos concedidos" value={formatBRL(totals.discounts)} />
              <StatTile
                label="Canceladas no mês"
                value={formatNumberBR(totals.canceled)}
                detail={
                  totals.canceled > 0 ? (
                    <span className="text-[11px] text-gray-500">
                      {formatBRL(totals.canceled_value)}
                    </span>
                  ) : null
                }
              />
              <StatTile
                label="Esperando aprovação"
                value={formatNumberBR(totals.pending)}
                detail={<span className="text-[11px] text-gray-500">situação de agora</span>}
              />
              <StatTile
                label="Estoque"
                value={`${formatNumberBR(stock.units)} un.`}
                detail={
                  <span className="text-[11px] text-gray-500">
                    {formatBRL(stock.value)} a preço de venda
                  </span>
                }
              />
            </div>
          </div>

          {alerts.length > 0 ? (
            <Card className="bg-white border-0 shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#111111]">
                  Pontos de atenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {alerts.map((a, i) => {
                    const style = ALERT_STYLE[a.level]
                    const Icon = style.icon
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Icon
                          className={`mt-0.5 h-4 w-4 shrink-0 ${style.className}`}
                          aria-label={style.label}
                        />
                        <span>
                          {single ? null : <span className="font-semibold">{a.org}: </span>}
                          {a.text}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {alerts.some((a) => a.text.startsWith('Nenhum produto')) ? (
                  <p className="mt-3 text-xs text-gray-500">
                    O proprietário cadastra os produtos da franquia em Produtos → Importar produtos,
                    com a mesma planilha usada pela New Way.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-1">
              <HistoryChart history={history} />
            </div>

            <Card className="bg-white border-0 shadow-sm rounded-xl xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#111111]">Ranking de lojas</CardTitle>
                <CardDescription className="text-xs">
                  Pelo faturamento de {monthName(data.month)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {stores.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">
                    Nenhuma loja neste filtro.
                  </p>
                ) : (
                  <table className="w-full min-w-[640px] text-xs">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1.5 pr-2 font-medium">#</th>
                        <th className="py-1.5 pr-2 font-medium">Loja</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Faturamento</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Variação</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Vendas</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Ticket</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Estoque</th>
                        <th className="py-1.5 font-medium text-right">Última venda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.map((s, i) => (
                        <tr key={s.id} className="border-t border-gray-100">
                          <td className="py-2 pr-2 text-gray-500 tabular-nums">{i + 1}</td>
                          <td className="py-2 pr-2">
                            <p className="font-semibold text-[#111111]">{s.name}</p>
                            {single ? null : (
                              <p className="text-[11px] text-gray-500">
                                {s.orgType === 'propria' ? 'Própria' : s.orgName}
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums font-semibold">
                            {formatBRL(s.totals.revenue)}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <Delta now={s.totals.revenue} before={s.totals.prev_revenue} compact />
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {s.totals.sales}
                            {s.totals.pending > 0 ? (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-amber-700">
                                <Clock className="h-3 w-3" aria-hidden />
                                {s.totals.pending}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {formatBRL(s.totals.ticket)}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{s.stock.units} un.</td>
                          <td className="py-2 text-right text-gray-600">
                            {s.last_sale_at ? formatDateBR(parseDate(s.last_sale_at)) : 'nunca'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {stores.some((s) => s.totals.pending > 0) ? (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
                    <Clock className="h-3 w-3" aria-hidden /> vendas esperando aprovação
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {!single && activeScope !== 'proprias' && franchises.length > 0 ? (
            <Card className="bg-white border-0 shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#111111]">Franquias</CardTitle>
                <CardDescription className="text-xs">
                  Abra uma franquia para ver as vendas e os produtos mais vendidos.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1.5 pr-2 font-medium">Franquia</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Faturamento</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Vendas</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Produtos</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Estoque</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Última venda</th>
                      <th className="py-1.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {franchises.map((o) => (
                      <tr key={o.id} className="border-t border-gray-100">
                        <td className="py-2 pr-2">
                          <p className="font-semibold text-[#111111]">{o.name}</p>
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums font-semibold">
                          {formatBRL(o.totals.revenue)}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{o.totals.sales}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{o.active_products}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{o.stock.units} un.</td>
                        <td className="py-2 pr-2 text-right text-gray-600">
                          {o.last_sale_at ? formatDateBR(parseDate(o.last_sale_at)) : 'nunca'}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setScope(o.id)}
                          >
                            Abrir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}

          {single ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="bg-white border-0 shadow-sm rounded-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-[#111111]">
                    Produtos mais vendidos
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {capFirst(monthName(data.month))}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {single.top_products.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500">
                      Nenhuma venda confirmada no mês.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {single.top_products.map((p) => (
                        <li key={p.sku + p.name} className="flex justify-between gap-3 text-xs">
                          <span>
                            <span className="font-semibold text-[#111111]">{p.name}</span>
                            <span className="block text-[11px] text-gray-500">
                              {p.sku ? `${p.sku} · ` : ''}
                              {p.quantity} un.
                            </span>
                          </span>
                          <span className="tabular-nums font-semibold">{formatBRL(p.revenue)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-0 shadow-sm rounded-xl xl:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-[#111111]">Últimas vendas</CardTitle>
                  <CardDescription className="text-xs">
                    Até 20 vendas do mês. O cliente não aparece: os dados pessoais ficam com o
                    franqueado (LGPD).
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {single.recent_sales.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500">Nenhuma venda no mês.</p>
                  ) : (
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-1.5 pr-2 font-medium">Data</th>
                          <th className="py-1.5 pr-2 font-medium">Venda</th>
                          <th className="py-1.5 pr-2 font-medium">Loja</th>
                          <th className="py-1.5 pr-2 font-medium">Vendedor</th>
                          <th className="py-1.5 pr-2 font-medium text-right">Itens</th>
                          <th className="py-1.5 pr-2 font-medium text-right">Total</th>
                          <th className="py-1.5 pr-2 font-medium">Pagamento</th>
                          <th className="py-1.5 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {single.recent_sales.map((s) => (
                          <tr key={s.id} className="border-t border-gray-100">
                            <td className="py-2 pr-2 text-gray-600 whitespace-nowrap">
                              {formatDateBR(parseDate(s.created), true)}
                            </td>
                            <td className="py-2 pr-2 font-mono whitespace-nowrap">
                              {s.number || '—'}
                            </td>
                            <td className="py-2 pr-2">{s.store}</td>
                            <td className="py-2 pr-2">{s.seller || '—'}</td>
                            <td className="py-2 pr-2 text-right tabular-nums">{s.items}</td>
                            <td className="py-2 pr-2 text-right tabular-nums font-semibold">
                              {formatBRL(s.total)}
                            </td>
                            <td className="py-2 pr-2">
                              {PAYMENT_LABELS[s.payment] || s.payment || '—'}
                            </td>
                            <td className="py-2">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${saleStatusClass(s.status)}`}
                              >
                                {saleStatusLabel(s.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            Das franquias, a rede vê vendas, estoque e desempenho. Clientes, custos, despesas e
            comissões ficam só com o franqueado.
          </p>
        </>
      ) : null}
    </div>
  )
}

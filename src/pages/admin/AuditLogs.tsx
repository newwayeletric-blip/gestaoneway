import { useState, useEffect } from 'react'
import {
  ShieldAlert,
  Search,
  Filter,
  Calendar,
  User,
  Activity,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FinancialService } from '@/services/api'
import type { AuditLogRecord } from '@/types'
import { formatDateBR } from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Filters
  const [entityFilter, setEntityFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const loadLogs = async (currentPage = 1) => {
    try {
      setLoading(true)
      let filter = ''
      const conditions: string[] = []

      if (entityFilter !== 'all') {
        conditions.push(`entity = '${entityFilter}'`)
      }
      if (actionFilter !== 'all') {
        conditions.push(`action = '${actionFilter}'`)
      }
      if (searchTerm.trim()) {
        const q = searchTerm.trim()
        conditions.push(`(reason ~ '${q}' || record_id ~ '${q}' || user.name ~ '${q}')`)
      }

      if (conditions.length > 0) {
        filter = conditions.join(' && ')
      }

      const res = await FinancialService.listAuditLogs(filter, currentPage, 30)
      setLogs(res.items)
      setPage(res.page)
      setTotalPages(res.totalPages)
      setTotalItems(res.totalItems)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar auditoria',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs(1)
  }, [entityFilter, actionFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadLogs(1)
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'criacao':
        return <Badge className="bg-emerald-600 text-white text-[10px]">Criação</Badge>
      case 'alteracao':
        return (
          <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600">
            Alteração
          </Badge>
        )
      case 'cancelamento':
        return (
          <Badge variant="destructive" className="text-[10px]">
            Cancelamento
          </Badge>
        )
      case 'devolucao':
        return <Badge className="bg-amber-600 text-white text-[10px]">Devolução</Badge>
      case 'estorno':
        return <Badge className="bg-purple-600 text-white text-[10px]">Estorno</Badge>
      case 'reabertura':
        return <Badge className="bg-red-700 text-white text-[10px] font-bold">Reabertura</Badge>
      case 'ajuste':
        return (
          <Badge variant="secondary" className="text-[10px]">
            Ajuste
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {action}
          </Badge>
        )
    }
  }

  const getEntityLabel = (entity: string) => {
    switch (entity) {
      case 'products':
        return 'Produtos & Preços'
      case 'users':
        return 'Usuários & Permissões'
      case 'stock_movements':
        return 'Estoque'
      case 'sales':
        return 'Vendas'
      case 'sale_returns':
        return 'Devoluções'
      case 'financial_transactions':
        return 'Financeiro & Despesas'
      case 'commissions':
        return 'Comissões'
      case 'monthly_closings':
        return 'Fechamento Mensal'
      default:
        return entity
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Trilha de Auditoria do Sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro imutável de alterações de preços, custos, estoque, permissões, vendas e
            financeiro
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={() => loadLogs(page)}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Entidade / Módulo</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Entidades</SelectItem>
                  <SelectItem value="products">Produtos & Preços</SelectItem>
                  <SelectItem value="users">Usuários & Permissões</SelectItem>
                  <SelectItem value="stock_movements">Estoque</SelectItem>
                  <SelectItem value="sales">Vendas</SelectItem>
                  <SelectItem value="sale_returns">Devoluções</SelectItem>
                  <SelectItem value="financial_transactions">Financeiro & Despesas</SelectItem>
                  <SelectItem value="commissions">Comissões</SelectItem>
                  <SelectItem value="monthly_closings">Fechamento Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Tipo de Ação</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Ações</SelectItem>
                  <SelectItem value="criacao">Criação</SelectItem>
                  <SelectItem value="alteracao">Alteração</SelectItem>
                  <SelectItem value="ajuste">Ajuste Manual</SelectItem>
                  <SelectItem value="cancelamento">Cancelamento</SelectItem>
                  <SelectItem value="devolucao">Devolução</SelectItem>
                  <SelectItem value="estorno">Estorno</SelectItem>
                  <SelectItem value="reabertura">Reabertura de Mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Buscar por Motivo / ID</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Search className="h-4 w-4 mr-1.5" />
                Filtrar ({totalItems})
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Eventos Registrados ({totalItems})
          </CardTitle>
          <CardDescription>
            Histórico cronológico de operações críticas para conformidade e segurança da
            administração
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Carregando registros de auditoria...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
              Nenhum registro de auditoria encontrado para os critérios selecionados.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground text-left text-xs uppercase font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Data / Hora</th>
                    <th className="py-2.5 px-3">Usuário Responsável</th>
                    <th className="py-2.5 px-3">Módulo</th>
                    <th className="py-2.5 px-3 text-center">Ação</th>
                    <th className="py-2.5 px-3">Motivo / Justificativa</th>
                    <th className="py-2.5 px-3">Valores Anteriores vs Novos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/40">
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateBR(log.created)}{' '}
                        {new Date(log.created).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {log.expand?.user?.name || log.expand?.user?.email || 'Sistema'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className="font-medium text-foreground">
                          {getEntityLabel(log.entity)}
                        </span>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          ID: {log.record_id.slice(0, 8)}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-center">{getActionBadge(log.action)}</td>
                      <td className="py-2.5 px-3 text-xs">
                        <p className="font-medium">{log.reason || '-'}</p>
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {log.previous_values || log.new_values ? (
                          <div className="max-w-xs space-y-1 bg-muted/40 p-2 rounded text-[11px] font-mono">
                            {log.previous_values && (
                              <div className="text-red-700">
                                <strong>Antes:</strong> {JSON.stringify(log.previous_values)}
                              </div>
                            )}
                            {log.new_values && (
                              <div className="text-emerald-700">
                                <strong>Depois:</strong> {JSON.stringify(log.new_values)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages} ({totalItems} registros)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadLogs(page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => loadLogs(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
export default AuditLogs

// FRQ-01: franquias da rede, para o admin da rede. Mostra só o cadastro de
// cada franquia; vendas, clientes e financeiro ficam com o franqueado (R.2).
import { useEffect, useState } from 'react'
import type { FranchiseSummary } from '@/types'
import { NetworkService } from '@/services/api'
import { formatDateBR, formatDocumentBR } from '@/lib/formatters'
import { Building2, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from './franchiseForm'
import { NewFranchiseDialog } from './NewFranchiseDialog'
import { FranchiseDetailDialog } from './FranchiseDetailDialog'

export default function Franchises() {
  const [items, setItems] = useState<FranchiseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = async () => {
    try {
      setItems(await NetworkService.listFranchises())
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar as franquias.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selected = items.find((f) => f.id === selectedId) || null

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Franquias</h2>
          <p className="text-sm text-gray-500">
            Cadastro dos franqueados da rede: empresa (CNPJ), lojas e quem administra. Vendas,
            clientes e financeiro de cada franquia ficam só com o franqueado.
          </p>
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" /> Nova franquia
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin text-[#0A8F5C]" /> Carregando franquias...
        </div>
      ) : loadError ? (
        <Card className="bg-white border-0 shadow-sm rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-red-700">
            Não foi possível carregar as franquias: {loadError}
          </p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Tentar de novo
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="bg-white border-0 shadow-sm rounded-xl p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-[#0A8F5C]">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="font-semibold text-[#111111]">Nenhuma franquia cadastrada ainda</p>
          <p className="mx-auto max-w-md text-sm text-gray-500">
            Tenha em mãos o cartão CNPJ do franqueado, o endereço de cada loja e o e-mail do
            proprietário. O cadastro cria o acesso dele, e a franquia já começa separada da New Way.
          </p>
          <Button
            onClick={() => setWizardOpen(true)}
            className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
          >
            <Plus className="mr-2 h-4 w-4" /> Cadastrar a primeira franquia
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((f) => {
            const company = f.legal_entities[0]
            const owner = f.admins[0]
            return (
              <Card key={f.id} className="bg-white border-0 shadow-sm rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-[#111111]">{f.name}</p>
                    <p className="text-xs text-gray-500">
                      {f.region ? `${f.region} · ` : ''}desde {formatDateBR(f.created)}
                    </p>
                  </div>
                  <StatusBadge status={f.status} />
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    <span className="font-semibold text-gray-700">CNPJ:</span>{' '}
                    {company
                      ? `${formatDocumentBR(company.cnpj)} · ${company.razao_social}`
                      : 'não cadastrado'}
                    {f.legal_entities.length > 1 ? ` (+${f.legal_entities.length - 1})` : ''}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-700">Proprietário:</span>{' '}
                    {owner ? `${owner.name} · ${owner.email}` : 'não cadastrado'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {f.stores.map((s) => (
                    <span
                      key={s.id}
                      className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedId(f.id)}
                    className="h-8 text-xs"
                  >
                    Ver e editar
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <NewFranchiseDialog open={wizardOpen} onOpenChange={setWizardOpen} onCreated={load} />
      <FranchiseDetailDialog
        key={selected?.id || 'nenhuma'}
        franchise={selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onChanged={load}
      />
    </div>
  )
}

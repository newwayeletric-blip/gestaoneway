// Detalhes de uma franquia para o admin da rede: dados, empresas (CNPJs),
// lojas e acesso. Os ajustes usam a API comum; o servidor confere tudo
// (organização das relações, CNPJ válido, CNPJ com movimento travado).
import React, { useState } from 'react'
import { ClientResponseError } from 'pocketbase'
import type { FranchiseSummary, OrganizationRecord } from '@/types'
import { NetworkService, StoresService } from '@/services/api'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { formatDateBR, formatDocumentBR } from '@/lib/formatters'
import { Building2, Pencil, Plus, Save, Store as StoreIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  CompanyFields,
  FieldError,
  ORG_STATUS,
  REGIME_LABELS,
  StatusBadge,
  StoreFields,
  changedKeys,
  companyAddressText,
  companyFromRecord,
  companyToPayload,
  emptyCompany,
  emptyStore,
  storeFromRecord,
  validateCompany,
  withoutKeys,
  type CompanyForm,
  type FormErrors,
  type StoreForm,
} from './franchiseForm'

interface Props {
  franchise: FranchiseSummary | null
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void>
}

const errorMessage = (err: unknown) =>
  err instanceof ClientResponseError || err instanceof Error ? err.message : 'Erro inesperado.'

// A página monta um diálogo por franquia (key = id), então o formulário
// começa com os dados dela.
export function FranchiseDetailDialog({ franchise, onOpenChange, onChanged }: Props) {
  const { toast } = useToast()

  const [info, setInfo] = useState({
    name: franchise?.name || '',
    region: franchise?.region || '',
    status: franchise?.status || ('implantacao' as OrganizationRecord['status']),
  })
  const [infoErrors, setInfoErrors] = useState<FormErrors>({})
  const [savingInfo, setSavingInfo] = useState(false)

  // Empresa ou loja em edição: id do registro, 'new' para uma nova, ou null.
  const [editingCompany, setEditingCompany] = useState<string | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompany)
  const [companyErrors, setCompanyErrors] = useState<FormErrors>({})
  const [editingStore, setEditingStore] = useState<string | null>(null)
  const [storeForm, setStoreForm] = useState<StoreForm>(emptyStore)
  const [storeError, setStoreError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!franchise) return null
  const companies = franchise.legal_entities
  const companyById = (id?: string) => companies.find((c) => c.id === id)

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!info.name.trim()) {
      setInfoErrors({ name: 'Informe o nome da franquia.' })
      return
    }
    setSavingInfo(true)
    try {
      await NetworkService.updateFranchise(franchise.id, {
        name: info.name.trim(),
        region: info.region.trim(),
        status: info.status,
      })
      setInfoErrors({})
      toast({ title: 'Dados da franquia salvos' })
      await onChanged()
    } catch (err) {
      setInfoErrors(extractFieldErrors(err))
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSavingInfo(false)
    }
  }

  const startCompany = (id: string | null) => {
    const record = companyById(id || undefined)
    setCompanyForm(record ? companyFromRecord(record) : emptyCompany())
    setCompanyErrors({})
    setEditingCompany(id || 'new')
  }

  const saveCompany = async () => {
    const errors = validateCompany(companyForm)
    setCompanyErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      const payload = companyToPayload(companyForm)
      if (editingCompany === 'new') await NetworkService.addLegalEntity(franchise.id, payload)
      else await NetworkService.updateLegalEntity(editingCompany as string, payload)
      toast({ title: editingCompany === 'new' ? 'CNPJ adicionado' : 'Empresa atualizada' })
      setEditingCompany(null)
      await onChanged()
    } catch (err) {
      setCompanyErrors(extractFieldErrors(err))
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const startStore = (id: string | null) => {
    const record = franchise.stores.find((s) => s.id === id)
    setStoreForm(
      record ? storeFromRecord(record) : emptyStore(companies.length === 1 ? companies[0].id : ''),
    )
    setStoreError('')
    setEditingStore(id || 'new')
  }

  const saveStore = async () => {
    if (!storeForm.name.trim()) {
      setStoreError('Informe o nome da loja.')
      return
    }
    if (!storeForm.legal_entity) {
      setStoreError('Escolha o CNPJ da loja.')
      return
    }
    setSaving(true)
    try {
      const data = {
        name: storeForm.name.trim(),
        address: storeForm.address.trim(),
        phone: storeForm.phone.trim(),
        whatsapp: storeForm.whatsapp.trim(),
        legal_entity: storeForm.legal_entity,
      }
      if (editingStore === 'new') await NetworkService.addStore(franchise.id, data)
      else await StoresService.update(editingStore as string, data)
      toast({
        title: editingStore === 'new' ? 'Loja adicionada' : 'Loja atualizada',
        description:
          editingStore === 'new'
            ? 'O proprietário já vê a loja nova. Os vendedores precisam ser autorizados nela.'
            : undefined,
      })
      setEditingStore(null)
      await onChanged()
    } catch (err) {
      setStoreError(errorMessage(err))
      toast({
        title: 'Não foi possível salvar',
        description: errorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Situações que a rede escolhe hoje. Suspender e encerrar dependem de
  // bloqueios que ainda não existem (RED-03), então só aparecem se já estiverem gravadas.
  const statusOptions: OrganizationRecord['status'][] = ['implantacao', 'ativa']
  if (!statusOptions.includes(franchise.status)) statusOptions.push(franchise.status)

  const companyEditor = (
    <div className="space-y-3 rounded-lg border border-[#0A8F5C]/30 bg-white p-4">
      <CompanyFields
        value={companyForm}
        onChange={(v) => {
          setCompanyErrors((prev) => withoutKeys(prev, changedKeys(companyForm, v)))
          setCompanyForm(v)
        }}
        errors={companyErrors}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditingCompany(null)}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={saveCompany}
          disabled={saving}
          className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Salvando...' : 'Salvar empresa'}
        </Button>
      </div>
    </div>
  )

  const storeEditor = (
    <div className="space-y-3 rounded-lg border border-[#0A8F5C]/30 bg-white p-4">
      <StoreFields
        idPrefix="st-edit"
        value={storeForm}
        onChange={(v) => {
          setStoreError('')
          setStoreForm(v)
        }}
        companies={companies}
        companyAddress={(() => {
          const c = companyById(storeForm.legal_entity)
          return c ? companyAddressFromRecord(c) : undefined
        })()}
      />
      <FieldError message={storeError} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditingStore(null)} disabled={saving}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={saveStore}
          disabled={saving}
          className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Salvando...' : 'Salvar loja'}
        </Button>
      </div>
    </div>
  )

  return (
    <Dialog open={!!franchise} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] bg-white">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {franchise.name} <StatusBadge status={franchise.status} />
          </DialogTitle>
          <DialogDescription>
            {franchise.region ? `${franchise.region} · ` : ''}Cadastrada em{' '}
            {formatDateBR(franchise.created)}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados" className="space-y-4">
          <TabsList className="bg-gray-100 flex-wrap h-auto">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="empresas">Empresas ({companies.length})</TabsTrigger>
            <TabsTrigger value="lojas">Lojas ({franchise.stores.length})</TabsTrigger>
            <TabsTrigger value="acesso">Acesso</TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <form onSubmit={saveInfo} className="space-y-4 max-w-lg">
              <div className="space-y-1.5">
                <Label htmlFor="fd-name">Nome da franquia</Label>
                <Input
                  id="fd-name"
                  value={info.name}
                  onChange={(e) => {
                    setInfoErrors((prev) => withoutKeys(prev, ['name']))
                    setInfo({ ...info, name: e.target.value })
                  }}
                />
                <FieldError message={infoErrors.name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fd-region">Cidade ou região</Label>
                <Input
                  id="fd-region"
                  value={info.region}
                  onChange={(e) => setInfo({ ...info, region: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fd-status">Situação</Label>
                <Select
                  value={info.status}
                  onValueChange={(v) =>
                    setInfo({ ...info, status: v as OrganizationRecord['status'] })
                  }
                >
                  <SelectTrigger id="fd-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ORG_STATUS[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-500">
                  "Em implantação" e "Ativa" só informam a fase da franquia; o acesso é o mesmo nas
                  duas.
                </p>
              </div>
              <Button
                type="submit"
                disabled={savingInfo}
                className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
              >
                <Save className="h-4 w-4 mr-1.5" /> {savingInfo ? 'Salvando...' : 'Salvar dados'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="empresas" className="space-y-3">
            {companies.map((c) =>
              editingCompany === c.id ? (
                <div key={c.id}>{companyEditor}</div>
              ) : (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4"
                >
                  <div className="space-y-0.5 text-xs text-gray-600">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <Building2 className="h-4 w-4 text-[#0A8F5C]" /> {c.razao_social}
                    </p>
                    <p>
                      CNPJ {formatDocumentBR(c.cnpj)} ·{' '}
                      {c.matriz_filial === 'filial' ? 'Filial' : 'Matriz'}
                      {c.regime ? ` · ${REGIME_LABELS[c.regime]}` : ' · regime não informado'}
                    </p>
                    <p>IE: {c.ie_isento ? 'isenta' : c.ie || 'não informada'}</p>
                    {c.address && <p>{companyAddressFromRecord(c)}</p>}
                    <p>
                      Lojas neste CNPJ:{' '}
                      {franchise.stores
                        .filter((s) => s.legal_entity === c.id)
                        .map((s) => s.name)
                        .join(', ') || 'nenhuma'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startCompany(c.id)}
                    disabled={editingCompany !== null}
                    className="h-8 shrink-0 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                </div>
              ),
            )}
            {editingCompany === 'new' ? (
              companyEditor
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startCompany(null)}
                disabled={editingCompany !== null}
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar CNPJ
              </Button>
            )}
            <p className="text-[11px] text-gray-500">
              Depois que a empresa tem vendas ou lançamentos, o número do CNPJ não muda. Para usar
              outro, adicione um CNPJ e ligue a loja a ele.
            </p>
          </TabsContent>

          <TabsContent value="lojas" className="space-y-3">
            {franchise.stores.map((st) =>
              editingStore === st.id ? (
                <div key={st.id}>{storeEditor}</div>
              ) : (
                <div
                  key={st.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4"
                >
                  <div className="space-y-0.5 text-xs text-gray-600">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <StoreIcon className="h-4 w-4 text-[#0A8F5C]" /> {st.name}
                    </p>
                    <p>{st.address || 'Endereço não informado'}</p>
                    {(st.phone || st.whatsapp) && (
                      <p>
                        {[st.phone && `Tel. ${st.phone}`, st.whatsapp && `WhatsApp ${st.whatsapp}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    <p>
                      CNPJ:{' '}
                      {companyById(st.legal_entity)
                        ? formatDocumentBR(companyById(st.legal_entity)!.cnpj)
                        : 'não ligado'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startStore(st.id)}
                    disabled={editingStore !== null}
                    className="h-8 shrink-0 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                </div>
              ),
            )}
            {editingStore === 'new' ? (
              storeEditor
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startStore(null)}
                disabled={editingStore !== null}
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar loja
              </Button>
            )}
          </TabsContent>

          <TabsContent value="acesso" className="space-y-3">
            {franchise.admins.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum administrador cadastrado.</p>
            ) : (
              franchise.admins.map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-4"
                >
                  <div className="text-xs text-gray-600">
                    <p className="text-sm font-semibold text-gray-900">{a.name || 'Sem nome'}</p>
                    <p>{a.email}</p>
                    <p className="text-[11px] text-gray-400">
                      {i === 0 ? 'Proprietário (cadastrado com a franquia)' : 'Administrador'}
                    </p>
                  </div>
                  <Badge
                    className={
                      a.status === 'ativo'
                        ? 'bg-emerald-100 text-[#0A8F5C]'
                        : 'bg-red-100 text-red-800'
                    }
                  >
                    {a.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              ))
            )}
            <p className="text-[11px] text-gray-500">
              O proprietário cadastra os demais usuários da franquia. A rede não vê nem troca a
              senha dele; se esquecer, ele cria outra em "Esqueci minha senha", na tela de entrada.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const companyAddressFromRecord = (c: FranchiseSummary['legal_entities'][number]) =>
  companyAddressText(companyFromRecord(c))

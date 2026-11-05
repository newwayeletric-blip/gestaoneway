// FRQ-01: assistente de nova franquia. Passos 1 (organização), 2 (CNPJ),
// 3 (lojas) e 6 (acesso do proprietário) do PRD; contrato e catálogo entram
// na Fase 3B. Tudo é gravado de uma vez pelo servidor, no último passo.
import React, { useEffect, useRef, useState } from 'react'
import { ClientResponseError } from 'pocketbase'
import { NetworkService } from '@/services/api'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { formatDocumentBR } from '@/lib/formatters'
import { CheckCircle2, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  CompanyFields,
  EMAIL_PATTERN,
  FieldError,
  REGIME_LABELS,
  StoreFields,
  changedKeys,
  companyAddressText,
  companyToPayload,
  emptyCompany,
  emptyStore,
  validateCompany,
  withoutKeys,
  type CompanyForm,
  type FormErrors,
  type StoreForm,
} from './franchiseForm'

const STEPS = ['Franquia', 'Empresa (CNPJ)', 'Lojas', 'Proprietário', 'Revisão']

// Campo do erro do servidor → passo do assistente onde ele se corrige.
const FIELD_STEP: Record<string, number> = {
  name: 0,
  cnpj: 1,
  razao_social: 1,
  regime: 1,
  matriz_filial: 1,
  fiscal_email: 1,
  cep: 1,
  uf: 1,
  stores: 2,
  store_name: 2,
  slug: 2,
  owner_name: 3,
  email: 3,
  password: 3,
}

// Sem caracteres que se confundem ao ditar ou digitar (0/O, 1/l/I).
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

interface Created {
  name: string
  email: string
  password: string
}

export function NewFranchiseDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [org, setOrg] = useState({ name: '', region: '' })
  const [company, setCompany] = useState<CompanyForm>(emptyCompany)
  const [stores, setStores] = useState<StoreForm[]>([emptyStore()])
  const [owner, setOwner] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const clearErrors = (...keys: string[]) => setErrors((prev) => withoutKeys(prev, keys))

  // Fechar no meio guarda o que já foi digitado; depois de cadastrar, o
  // próximo cadastro começa do zero.
  const resetOnOpen = useRef(false)
  useEffect(() => {
    if (!open || !resetOnOpen.current) return
    resetOnOpen.current = false
    setStep(0)
    setOrg({ name: '', region: '' })
    setCompany(emptyCompany())
    setStores([emptyStore()])
    setOwner({ name: '', email: '', password: '' })
    setErrors({})
    setCreated(null)
  }, [open])

  const validateStep = (s: number): FormErrors => {
    const e: FormErrors = {}
    if (s === 0 && !org.name.trim()) e.name = 'Informe o nome da franquia.'
    if (s === 1) Object.assign(e, validateCompany(company))
    if (s === 2) {
      stores.forEach((st, i) => {
        if (!st.name.trim()) e[`store_${i}`] = 'Informe o nome da loja.'
      })
    }
    if (s === 3) {
      if (!owner.name.trim()) e.owner_name = 'Informe o nome do proprietário.'
      if (!EMAIL_PATTERN.test(owner.email.trim())) e.email = 'Informe um e-mail válido.'
      if (owner.password.length < 10) e.password = 'A senha precisa ter no mínimo 10 caracteres.'
    }
    return e
  }

  const goNext = () => {
    const e = validateStep(step)
    setErrors(e)
    if (Object.keys(e).length === 0) setStep(step + 1)
  }

  const handleSubmit = async () => {
    for (let s = 0; s < 4; s++) {
      const e = validateStep(s)
      if (Object.keys(e).length > 0) {
        setErrors(e)
        setStep(s)
        return
      }
    }
    setSaving(true)
    try {
      await NetworkService.createFranchise({
        organization: { name: org.name.trim(), region: org.region.trim() },
        legal_entity: companyToPayload(company),
        stores: stores.map((st) => ({
          name: st.name.trim(),
          address: st.address.trim(),
          phone: st.phone.trim(),
          whatsapp: st.whatsapp.trim(),
        })),
        owner: { name: owner.name.trim(), email: owner.email.trim(), password: owner.password },
      })
      setCreated({
        name: org.name.trim(),
        email: owner.email.trim().toLowerCase(),
        password: owner.password,
      })
      resetOnOpen.current = true
      onCreated()
    } catch (err) {
      const fields = extractFieldErrors(err)
      const field = Object.keys(fields).find((f) => f in FIELD_STEP)
      const message =
        err instanceof ClientResponseError ? err.message : 'Não foi possível cadastrar a franquia.'
      if (field) {
        // Erros de loja aparecem no topo do passo 3; os demais, no próprio campo.
        setErrors(
          field === 'store_name' || field === 'slug' ? { stores: message } : { [field]: message },
        )
        setStep(FIELD_STEP[field])
      }
      toast({ title: 'Franquia não cadastrada', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const loginUrl = `${window.location.origin}/login`
  const accessText = created
    ? `Acesso ao sistema de gestão New Way (${created.name})\n` +
      `Endereço: ${loginUrl}\nE-mail: ${created.email}\nSenha provisória: ${created.password}`
    : ''

  const copyAccess = async () => {
    try {
      await navigator.clipboard.writeText(accessText)
      toast({
        title: 'Dados de acesso copiados',
        description: 'Cole na conversa com o proprietário.',
      })
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione o texto e copie manualmente.',
        variant: 'destructive',
      })
    }
  }

  const updateStore = (i: number, value: StoreForm) => {
    clearErrors(`store_${i}`, 'stores')
    setStores(stores.map((st, j) => (j === i ? value : st)))
  }

  const removeStore = (i: number) => {
    // Os avisos são por posição; ao remover uma loja, as posições mudam.
    clearErrors('stores', ...stores.map((_, j) => `store_${j}`))
    setStores(stores.filter((_, j) => j !== i))
  }

  const updateCompany = (value: CompanyForm) => {
    clearErrors(...changedKeys(company, value))
    setCompany(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] bg-white">
        {created ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#0A8F5C]">
                <CheckCircle2 className="h-5 w-5" /> Franquia cadastrada
              </DialogTitle>
              <DialogDescription>
                {created.name} entrou na rede com a situação "Em implantação". Envie ao proprietário
                os dados de acesso abaixo.
              </DialogDescription>
            </DialogHeader>
            <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800 select-all">
              {accessText}
            </pre>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <p>
                A senha provisória não fica guardada para consulta. Se o proprietário esquecer, ele
                cria outra em "Esqueci minha senha", na tela de entrada.
              </p>
              <p>
                Ao entrar, o proprietário cadastra os vendedores, os produtos e o estoque inicial
                das lojas dele.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={copyAccess}>
                <Copy className="h-4 w-4 mr-1.5" /> Copiar dados de acesso
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
              >
                Concluir
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>Nova franquia</DialogTitle>
              <DialogDescription>
                Passo {step + 1} de {STEPS.length}: {STEPS[step]}. Nada é gravado até você confirmar
                na revisão.
              </DialogDescription>
            </DialogHeader>

            <ol className="grid grid-cols-5 gap-1.5">
              {STEPS.map((label, i) => (
                <li key={label} className="space-y-1">
                  <div
                    className={`h-1.5 rounded-full ${i <= step ? 'bg-[#0A8F5C]' : 'bg-gray-200'}`}
                  />
                  <span
                    className={`hidden sm:block text-[10px] font-medium ${
                      i === step ? 'text-[#0A8F5C]' : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ol>

            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fr-name">Nome da franquia *</Label>
                  <Input
                    id="fr-name"
                    value={org.name}
                    onChange={(e) => {
                      clearErrors('name')
                      setOrg({ ...org, name: e.target.value })
                    }}
                    placeholder="Ex.: Silva Mobilidade"
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-500">
                    Como a rede vai chamar este franqueado nas listas e relatórios.
                  </p>
                  <FieldError message={errors.name} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fr-region">Cidade ou região</Label>
                  <Input
                    id="fr-region"
                    value={org.region}
                    onChange={(e) => setOrg({ ...org, region: e.target.value })}
                    placeholder="Ex.: Joinville - SC"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <CompanyFields value={company} onChange={updateCompany} errors={errors} />
            )}

            {step === 2 && (
              <div className="space-y-4">
                <FieldError message={errors.stores} />
                {stores.map((st, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700">Loja {i + 1}</span>
                      {stores.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStore(i)}
                          className="h-7 text-xs text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                        </Button>
                      )}
                    </div>
                    <StoreFields
                      idPrefix={`st-${i}`}
                      value={st}
                      onChange={(v) => updateStore(i, v)}
                      error={errors[`store_${i}`]}
                      companyAddress={companyAddressText(company)}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStores([...stores, emptyStore()])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar outra loja
                </Button>
                <p className="text-[11px] text-gray-500">
                  Todas as lojas ficam no CNPJ do passo anterior. Uma loja com outro CNPJ pode ser
                  ligada depois, nos detalhes da franquia.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-600">
                  O proprietário administra a franquia: cadastra os vendedores, os produtos e o
                  estoque, e vê o financeiro. Ele não vê nada da New Way nem das outras franquias.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="fr-owner">Nome completo *</Label>
                  <Input
                    id="fr-owner"
                    value={owner.name}
                    onChange={(e) => {
                      clearErrors('owner_name')
                      setOwner({ ...owner, name: e.target.value })
                    }}
                  />
                  <FieldError message={errors.owner_name} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fr-email">E-mail (usado para entrar) *</Label>
                  <Input
                    id="fr-email"
                    type="email"
                    value={owner.email}
                    onChange={(e) => {
                      clearErrors('email')
                      setOwner({ ...owner, email: e.target.value })
                    }}
                  />
                  <FieldError message={errors.email} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fr-pass">Senha provisória (mínimo 10 caracteres) *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="fr-pass"
                      value={owner.password}
                      onChange={(e) => {
                        clearErrors('password')
                        setOwner({ ...owner, password: e.target.value })
                      }}
                      autoComplete="new-password"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        clearErrors('password')
                        setOwner({ ...owner, password: generatePassword() })
                      }}
                      className="shrink-0"
                    >
                      <KeyRound className="h-4 w-4 mr-1.5" /> Gerar
                    </Button>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Você envia esta senha ao proprietário ao final do cadastro.
                  </p>
                  <FieldError message={errors.password} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3 text-sm">
                <ReviewBlock title="Franquia" onEdit={() => setStep(0)}>
                  <p className="font-semibold text-gray-900">{org.name}</p>
                  {org.region && <p className="text-gray-600">{org.region}</p>}
                </ReviewBlock>
                <ReviewBlock title="Empresa (CNPJ)" onEdit={() => setStep(1)}>
                  <p className="font-semibold text-gray-900">{company.razao_social}</p>
                  <p className="text-gray-600">
                    {formatDocumentBR(company.cnpj)} ·{' '}
                    {company.matriz_filial === 'filial' ? 'Filial' : 'Matriz'}
                    {company.regime ? ` · ${REGIME_LABELS[company.regime]}` : ''}
                  </p>
                  <p className="text-gray-600">
                    IE: {company.ie_isento ? 'isenta' : company.ie || 'não informada'}
                  </p>
                  {companyAddressText(company) && (
                    <p className="text-gray-600">{companyAddressText(company)}</p>
                  )}
                </ReviewBlock>
                <ReviewBlock title={`Lojas (${stores.length})`} onEdit={() => setStep(2)}>
                  {stores.map((st, i) => (
                    <p key={i} className="text-gray-700">
                      <span className="font-semibold">{st.name}</span>
                      {st.address ? ` · ${st.address}` : ''}
                    </p>
                  ))}
                </ReviewBlock>
                <ReviewBlock title="Proprietário" onEdit={() => setStep(3)}>
                  <p className="font-semibold text-gray-900">{owner.name}</p>
                  <p className="text-gray-600">{owner.email.trim().toLowerCase()}</p>
                </ReviewBlock>
                <p className="text-[11px] text-gray-500">
                  Contrato, royalties e catálogo da rede ainda não fazem parte deste cadastro.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
                  Voltar
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button onClick={goNext} className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                  Continuar
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
                >
                  {saving ? 'Cadastrando...' : 'Cadastrar franquia'}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] font-medium text-[#0A8F5C] hover:underline"
        >
          Alterar
        </button>
      </div>
      <div className="space-y-0.5 text-xs">{children}</div>
    </div>
  )
}

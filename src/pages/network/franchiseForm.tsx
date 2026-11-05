// Campos e regras compartilhados pelo cadastro de franquia (assistente) e
// pela edição (detalhes da franquia).
import type { FranchiseSummary, LegalEntityRecord, OrganizationRecord, TaxRegime } from '@/types'
import type { LegalEntityInput } from '@/services/api'
import { isValidCnpj, maskCep, maskCnpj } from '@/lib/formatters'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type FormErrors = Record<string, string>

export const ORG_STATUS: Record<
  OrganizationRecord['status'],
  { label: string; className: string }
> = {
  implantacao: { label: 'Em implantação', className: 'bg-amber-100 text-amber-800' },
  ativa: { label: 'Ativa', className: 'bg-emerald-100 text-[#0A8F5C]' },
  suspensa: { label: 'Suspensa', className: 'bg-red-100 text-red-800' },
  encerrada: { label: 'Encerrada', className: 'bg-gray-200 text-gray-700' },
}

export const REGIME_LABELS: Record<TaxRegime, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
}

const UFS =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// O aviso de um campo some assim que a pessoa edita o campo.
export function changedKeys<T extends object>(before: T, after: T): string[] {
  return (Object.keys(after) as (keyof T)[]).filter((k) => before[k] !== after[k]).map(String)
}

export function withoutKeys(errors: FormErrors, keys: string[]): FormErrors {
  if (!keys.some((k) => k in errors)) return errors
  const next = { ...errors }
  for (const k of keys) delete next[k]
  return next
}

export function StatusBadge({ status }: { status: OrganizationRecord['status'] }) {
  const s = ORG_STATUS[status] || { label: status, className: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${s.className}`}>
      {s.label}
    </span>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-[11px] font-medium text-red-600">{message}</p>
}

// ---------------------------------------------------------------------------
// Empresa (CNPJ)
// ---------------------------------------------------------------------------

export interface CompanyForm {
  cnpj: string
  matriz_filial: 'matriz' | 'filial'
  razao_social: string
  nome_fantasia: string
  regime: TaxRegime | ''
  ie: string
  ie_isento: boolean
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  fiscal_email: string
  accountant_contact: string
}

export const emptyCompany = (): CompanyForm => ({
  cnpj: '',
  matriz_filial: 'matriz',
  razao_social: '',
  nome_fantasia: '',
  regime: '',
  ie: '',
  ie_isento: false,
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  municipio: '',
  uf: '',
  fiscal_email: '',
  accountant_contact: '',
})

export function companyFromRecord(le: LegalEntityRecord): CompanyForm {
  const a = le.address || {}
  return {
    cnpj: maskCnpj(le.cnpj || ''),
    matriz_filial: le.matriz_filial === 'filial' ? 'filial' : 'matriz',
    razao_social: le.razao_social || '',
    nome_fantasia: le.nome_fantasia || '',
    regime: le.regime || '',
    ie: le.ie || '',
    ie_isento: !!le.ie_isento,
    cep: maskCep(a.cep || ''),
    logradouro: a.logradouro || '',
    numero: a.numero || '',
    complemento: a.complemento || '',
    bairro: a.bairro || '',
    municipio: a.municipio || '',
    uf: a.uf || '',
    fiscal_email: le.fiscal_email || '',
    accountant_contact: le.accountant_contact || '',
  }
}

export function companyToPayload(f: CompanyForm): LegalEntityInput {
  const address = {
    cep: f.cep.replace(/\D/g, ''),
    logradouro: f.logradouro.trim(),
    numero: f.numero.trim(),
    complemento: f.complemento.trim(),
    bairro: f.bairro.trim(),
    municipio: f.municipio.trim(),
    uf: f.uf,
  }
  return {
    cnpj: f.cnpj,
    matriz_filial: f.matriz_filial,
    razao_social: f.razao_social.trim(),
    nome_fantasia: f.nome_fantasia.trim(),
    regime: f.regime,
    ie: f.ie_isento ? '' : f.ie.trim(),
    ie_isento: f.ie_isento,
    address: Object.values(address).some(Boolean) ? address : null,
    fiscal_email: f.fiscal_email.trim(),
    accountant_contact: f.accountant_contact.trim(),
  }
}

export function validateCompany(f: CompanyForm): FormErrors {
  const errors: FormErrors = {}
  if (!f.cnpj.trim()) errors.cnpj = 'Informe o CNPJ.'
  else if (!isValidCnpj(f.cnpj)) errors.cnpj = 'CNPJ inválido. Confira os números.'
  if (!f.razao_social.trim()) errors.razao_social = 'Informe a razão social.'
  const cep = f.cep.replace(/\D/g, '')
  if (cep && cep.length !== 8) errors.cep = 'O CEP precisa ter 8 dígitos.'
  if (f.fiscal_email.trim() && !EMAIL_PATTERN.test(f.fiscal_email.trim())) {
    errors.fiscal_email = 'E-mail inválido.'
  }
  return errors
}

// "Rua Santo André, 59 - Cajuru, Curitiba - PR, 82900-300" (mesmo formato das lojas próprias).
export function companyAddressText(f: CompanyForm): string {
  const street = [f.logradouro.trim(), f.numero.trim()].filter(Boolean).join(', ')
  const place = [street, f.complemento.trim(), f.bairro.trim()].filter(Boolean).join(' - ')
  const city = [f.municipio.trim(), f.uf].filter(Boolean).join(' - ')
  return [place, city, maskCep(f.cep)].filter(Boolean).join(', ')
}

interface CompanyFieldsProps {
  value: CompanyForm
  onChange: (value: CompanyForm) => void
  errors: FormErrors
}

export function CompanyFields({ value, onChange, errors }: CompanyFieldsProps) {
  const set = <K extends keyof CompanyForm>(key: K, v: CompanyForm[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="co-cnpj">CNPJ *</Label>
          <Input
            id="co-cnpj"
            value={value.cnpj}
            onChange={(e) => set('cnpj', maskCnpj(e.target.value))}
            placeholder="00.000.000/0000-00"
            inputMode="text"
            autoComplete="off"
          />
          <FieldError message={errors.cnpj} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-matriz">Matriz ou filial</Label>
          <Select
            value={value.matriz_filial}
            onValueChange={(v) => set('matriz_filial', v as CompanyForm['matriz_filial'])}
          >
            <SelectTrigger id="co-matriz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="matriz">Matriz</SelectItem>
              <SelectItem value="filial">Filial</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="co-razao">Razão social *</Label>
        <Input
          id="co-razao"
          value={value.razao_social}
          onChange={(e) => set('razao_social', e.target.value)}
          placeholder="Como está no cartão CNPJ"
        />
        <FieldError message={errors.razao_social} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="co-fantasia">Nome fantasia</Label>
          <Input
            id="co-fantasia"
            value={value.nome_fantasia}
            onChange={(e) => set('nome_fantasia', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-regime">Regime tributário</Label>
          <Select
            value={value.regime || 'nao_informado'}
            onValueChange={(v) => set('regime', v === 'nao_informado' ? '' : (v as TaxRegime))}
          >
            <SelectTrigger id="co-regime">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao_informado">Ainda não informado</SelectItem>
              {(Object.keys(REGIME_LABELS) as TaxRegime[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {REGIME_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.regime} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="co-ie">Inscrição estadual</Label>
          <Input
            id="co-ie"
            value={value.ie_isento ? '' : value.ie}
            onChange={(e) => set('ie', e.target.value)}
            disabled={value.ie_isento}
            placeholder={value.ie_isento ? 'Isenta' : ''}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value.ie_isento}
            onChange={(e) => set('ie_isento', e.target.checked)}
            className="rounded border-gray-300 text-[#0A8F5C] focus:ring-[#0A8F5C]"
          />
          Isenta de inscrição estadual
        </label>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <p className="text-xs font-semibold text-gray-700">Endereço fiscal (do cartão CNPJ)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="co-cep">CEP</Label>
            <Input
              id="co-cep"
              value={value.cep}
              onChange={(e) => set('cep', maskCep(e.target.value))}
              placeholder="00000-000"
              inputMode="numeric"
            />
            <FieldError message={errors.cep} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="co-municipio">Município</Label>
            <Input
              id="co-municipio"
              value={value.municipio}
              onChange={(e) => set('municipio', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-uf">UF</Label>
            <Select value={value.uf} onValueChange={(v) => set('uf', v)}>
              <SelectTrigger id="co-uf">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                {UFS.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.uf} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="co-logradouro">Logradouro</Label>
            <Input
              id="co-logradouro"
              value={value.logradouro}
              onChange={(e) => set('logradouro', e.target.value)}
              placeholder="Rua, avenida..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-numero">Número</Label>
            <Input
              id="co-numero"
              value={value.numero}
              onChange={(e) => set('numero', e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="co-complemento">Complemento</Label>
            <Input
              id="co-complemento"
              value={value.complemento}
              onChange={(e) => set('complemento', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-bairro">Bairro</Label>
            <Input
              id="co-bairro"
              value={value.bairro}
              onChange={(e) => set('bairro', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="co-email">E-mail fiscal</Label>
          <Input
            id="co-email"
            type="email"
            value={value.fiscal_email}
            onChange={(e) => set('fiscal_email', e.target.value)}
            placeholder="Para notas e contador"
          />
          <FieldError message={errors.fiscal_email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-contador">Contador (nome e telefone)</Label>
          <Input
            id="co-contador"
            value={value.accountant_contact}
            onChange={(e) => set('accountant_contact', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loja
// ---------------------------------------------------------------------------

export interface StoreForm {
  name: string
  address: string
  phone: string
  whatsapp: string
  legal_entity: string
}

export const emptyStore = (legalEntity = ''): StoreForm => ({
  name: '',
  address: '',
  phone: '',
  whatsapp: '',
  legal_entity: legalEntity,
})

export function storeFromRecord(st: FranchiseSummary['stores'][number]): StoreForm {
  return {
    name: st.name || '',
    address: st.address || '',
    phone: st.phone || '',
    whatsapp: st.whatsapp || '',
    legal_entity: st.legal_entity || '',
  }
}

interface StoreFieldsProps {
  // Prefixo dos ids dos campos; cada loja da tela usa um diferente.
  idPrefix: string
  value: StoreForm
  onChange: (value: StoreForm) => void
  error?: string
  // Endereço montado a partir da empresa, para preencher com um clique.
  companyAddress?: string
  // Empresas da franquia; com mais de uma, a loja escolhe o CNPJ dela.
  companies?: LegalEntityRecord[]
}

export function StoreFields({
  idPrefix,
  value,
  onChange,
  error,
  companyAddress,
  companies,
}: StoreFieldsProps) {
  const set = <K extends keyof StoreForm>(key: K, v: StoreForm[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Nome da loja *</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ex.: Loja Batel"
        />
        <FieldError message={error} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-address`}>Endereço da loja</Label>
          {companyAddress && (
            <button
              type="button"
              onClick={() => set('address', companyAddress)}
              className="text-[11px] font-medium text-[#0A8F5C] hover:underline"
            >
              Usar o endereço da empresa
            </button>
          )}
        </div>
        <Input
          id={`${idPrefix}-address`}
          value={value.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="Rua, número - bairro, cidade - UF"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-phone`}>Telefone</Label>
          <Input
            id={`${idPrefix}-phone`}
            value={value.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-whatsapp`}>WhatsApp</Label>
          <Input
            id={`${idPrefix}-whatsapp`}
            value={value.whatsapp}
            onChange={(e) => set('whatsapp', e.target.value)}
          />
        </div>
      </div>
      {companies && companies.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-cnpj`}>CNPJ da loja (vendas e notas saem por ele)</Label>
          <Select value={value.legal_entity} onValueChange={(v) => set('legal_entity', v)}>
            <SelectTrigger id={`${idPrefix}-cnpj`}>
              <SelectValue placeholder="Escolha a empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {maskCnpj(c.cnpj)} · {c.razao_social}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

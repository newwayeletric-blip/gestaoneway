import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CustomerRecord } from '@/types'

// Endereço do cliente do jeito que a NF-e pede (dono, 11/11/2026). Com o CEP
// completo, rua, bairro, cidade e UF vêm do ViaCEP (consulta pública dos
// Correios) e o cursor vai para o número.
export interface AddressValue {
  cep: string
  street: string
  street_number: string
  complement: string
  district: string
  city: string
  uf: string
}

export const emptyAddress: AddressValue = {
  cep: '',
  street: '',
  street_number: '',
  complement: '',
  district: '',
  city: '',
  uf: '',
}

export function addressFromCustomer(c?: Partial<CustomerRecord> | null): AddressValue {
  return {
    cep: c?.cep || '',
    street: c?.street || '',
    street_number: c?.street_number || '',
    complement: c?.complement || '',
    district: c?.district || '',
    city: c?.city || '',
    uf: c?.uf || '',
  }
}

// O que falta no cadastro para a NF-e sair (o servidor confere de novo).
export function missingForNf(c?: Partial<CustomerRecord> | null): string[] {
  if (!c) return ['cliente']
  const out: string[] = []
  const doc = (c.document || '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) out.push('CPF/CNPJ')
  if ((c.cep || '').replace(/\D/g, '').length !== 8) out.push('CEP')
  if (!c.street?.trim()) out.push('rua')
  if (!c.street_number?.trim()) out.push('número')
  if (!c.district?.trim()) out.push('bairro')
  if (!c.city?.trim()) out.push('cidade')
  if (!/^[A-Za-z]{2}$/.test(c.uf?.trim() || '')) out.push('UF')
  return out
}

export function formatAddress(c?: Partial<CustomerRecord> | null): string {
  if (!c?.street) return c?.address || ''
  const cep = (c.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2')
  return [
    [c.street, c.street_number].filter(Boolean).join(', '),
    c.complement,
    c.district,
    [c.city, c.uf].filter(Boolean).join('/'),
    cep,
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function AddressFields({
  value,
  onChange,
  idPrefix = 'addr',
}: {
  value: AddressValue
  onChange: (v: AddressValue) => void
  idPrefix?: string
}) {
  const [lookup, setLookup] = useState<'' | 'buscando' | 'nao_achou'>('')
  const numberRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch })

  const handleCep = async (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
    set({ cep: masked })
    if (digits.length !== 8) {
      setLookup('')
      return
    }
    setLookup('buscando')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!res.ok || data.erro) {
        setLookup('nao_achou')
        return
      }
      onChange({
        ...value,
        cep: masked,
        street: data.logradouro || value.street,
        district: data.bairro || value.district,
        city: data.localidade || value.city,
        uf: data.uf || value.uf,
      })
      setLookup('')
      numberRef.current?.focus()
    } catch {
      setLookup('nao_achou')
    }
  }

  const field = (
    key: keyof AddressValue,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${key}`} className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<AddressValue>)}
        {...props}
      />
    </div>
  )

  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-3 space-y-1 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-cep`} className="text-xs font-semibold">
          CEP
        </Label>
        <Input
          id={`${idPrefix}-cep`}
          inputMode="numeric"
          placeholder="00000-000"
          value={value.cep}
          onChange={(e) => handleCep(e.target.value)}
        />
        {lookup === 'buscando' && <p className="text-[11px] text-gray-500">Buscando o CEP...</p>}
        {lookup === 'nao_achou' && (
          <p className="text-[11px] text-amber-700">CEP não encontrado: preencha à mão.</p>
        )}
      </div>
      <div className="col-span-6 sm:col-span-4">{field('street', 'Rua')}</div>
      <div className="col-span-2 space-y-1">
        <Label htmlFor={`${idPrefix}-street_number`} className="text-xs font-semibold">
          Número
        </Label>
        <Input
          id={`${idPrefix}-street_number`}
          ref={numberRef}
          value={value.street_number}
          onChange={(e) => set({ street_number: e.target.value })}
        />
      </div>
      <div className="col-span-4">
        {field('complement', 'Complemento', { placeholder: 'Apto, bloco...' })}
      </div>
      <div className="col-span-6 sm:col-span-2">{field('district', 'Bairro')}</div>
      <div className="col-span-4 sm:col-span-3">{field('city', 'Cidade')}</div>
      <div className="col-span-2 sm:col-span-1">
        {field('uf', 'UF', { maxLength: 2, className: 'uppercase' })}
      </div>
    </div>
  )
}

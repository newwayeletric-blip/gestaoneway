import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ProductRecord } from '@/types'

// Sem acento e em minúsculas: "patinete eletrico" acha "Patinete Elétrico".
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// Cada palavra digitada precisa aparecer no nome, no SKU, na marca ou no modelo,
// em qualquer ordem: "g4 honey" acha "Honeywhale G4 Max".
export function matchProducts(products: ProductRecord[], query: string): ProductRecord[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return products
  return products.filter((p) => {
    const text = normalize([p.name, p.sku, p.brand, p.model].filter(Boolean).join(' '))
    return words.every((w) => text.includes(w))
  })
}

// Campo de produto com busca (dono, 24/11/2026): digita parte do nome, da marca
// ou do SKU e clica no produto, em vez de rolar a lista inteira.
export default function ProductPicker({
  products,
  value,
  onChange,
  id,
  placeholder = 'Digite o nome, a marca ou o SKU...',
}: {
  products: ProductRecord[]
  value: string
  onChange: (productId: string) => void
  id?: string
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const selected = products.find((p) => p.id === value)
  const matches = useMemo(() => matchProducts(products, query), [products, query])

  const choose = (p: ProductRecord) => {
    onChange(p.id)
    setQuery('')
    setOpen(false)
  }

  const move = (to: number) => {
    const next = Math.max(0, Math.min(matches.length - 1, to))
    setActive(next)
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else move(active + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(active - 1)
    } else if (e.key === 'Enter' && open) {
      // Enter escolhe o produto destacado em vez de enviar o formulário.
      e.preventDefault()
      if (matches[active]) choose(matches[active])
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        className="pl-9"
        placeholder={placeholder}
        value={open ? query : selected ? `${selected.name} (${selected.sku})` : ''}
        onFocus={() => {
          setQuery('')
          setActive(0)
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">Nenhum produto encontrado.</li>
          ) : (
            matches.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={p.id === value}
                // mousedown (e não click) para escolher antes de o campo perder o foco.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(p)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm leading-tight',
                  i === active && 'bg-gray-100',
                )}
              >
                <span className="font-medium text-gray-900">{p.name}</span>
                <span className="mt-0.5 block text-[11px] text-gray-500">
                  {p.sku}
                  {p.brand ? ` · ${p.brand}` : ''}
                  {p.status === 'inativo' ? ' · inativo' : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

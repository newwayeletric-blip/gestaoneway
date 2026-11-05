/**
 * Brazilian Real currency, Date (dd/mm/aaaa) and Brasília timezone helpers
 */

export function formatBRL(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'R$ 0,00'
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNumberBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0'
  }
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function formatDateBR(
  dateString: string | Date | undefined | null,
  includeTime = false,
): string {
  if (!dateString) return '-'
  try {
    const d = typeof dateString === 'string' ? new Date(dateString) : dateString
    if (isNaN(d.getTime())) return '-'

    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...(includeTime
        ? {
            hour: '2-digit',
            minute: '2-digit',
          }
        : {}),
    }

    return new Intl.DateTimeFormat('pt-BR', options).format(d)
  } catch {
    return '-'
  }
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) {
    return `+${digits}`
  }
  return `+55${digits}`
}

export function formatPhoneBR(raw: string | undefined | null): string {
  if (!raw) return '-'
  const clean = raw.replace(/\D/g, '')
  // Clean could be 5541999999999 or 41999999999
  const num = clean.startsWith('55') ? clean.slice(2) : clean
  if (num.length === 11) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
  }
  if (num.length === 10) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
  }
  return raw
}

export function normalizeDocument(doc: string | undefined | null): string {
  if (!doc) return ''
  return doc.replace(/\D/g, '')
}

// CNPJ-01: mesma conferência do servidor (pocketbase/hooks/legal_entities_validate.js),
// incluindo o CNPJ alfanumérico: letras valem (código ASCII − 48) no cálculo.
export function isValidCnpj(value: string | undefined | null): boolean {
  const cnpj = (value || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const checkDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + (base.charCodeAt(i) - 48) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  const d1 = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = checkDigit(cnpj.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return cnpj[12] === String(d1) && cnpj[13] === String(d2)
}

// Máscara enquanto digita: 00.000.000/0000-00 (aceita letras nas 12 primeiras posições).
export function maskCnpj(raw: string): string {
  const v = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 14)
  let out = v.slice(0, 2)
  if (v.length > 2) out += '.' + v.slice(2, 5)
  if (v.length > 5) out += '.' + v.slice(5, 8)
  if (v.length > 8) out += '/' + v.slice(8, 12)
  if (v.length > 12) out += '-' + v.slice(12)
  return out
}

export function maskCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function formatDocumentBR(doc: string | undefined | null): string {
  if (!doc) return '-'
  // Letras ficam: o CNPJ alfanumérico (Receita, a partir de 07/2026) tem letras nas 12 primeiras posições.
  const digits = doc.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (digits.length === 11) {
    // CPF: 000.000.000-00
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 14) {
    // CNPJ: 00.000.000/0000-00
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }
  return doc
}

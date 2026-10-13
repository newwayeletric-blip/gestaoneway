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

export function formatDocumentBR(doc: string | undefined | null): string {
  if (!doc) return '-'
  const digits = doc.replace(/\D/g, '')
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

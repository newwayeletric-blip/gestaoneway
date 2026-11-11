import type { NfResult } from '@/services/api'

// Frase para o aviso depois de aprovar ou emitir a NF-e pelo Bling.
export function nfMessage(nf?: NfResult | null): { text: string; variant?: 'destructive' } | null {
  if (!nf) return null
  if (nf.status === 'autorizada') {
    return { text: `NF-e ${nf.number} autorizada pela Sefaz. O PDF e o XML estão na venda.` }
  }
  if (nf.status === 'emitindo') {
    return { text: 'NF-e enviada; a Sefaz ainda está processando. A venda atualiza sozinha.' }
  }
  if (nf.status === 'erro') return { text: `A NF-e não saiu: ${nf.error}`, variant: 'destructive' }
  return null
}

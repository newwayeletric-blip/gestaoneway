import PocketBase from 'pocketbase'
import type { RecordModel } from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Arquivos são protegidos (DOC-01): a URL só funciona com um token
 * temporário do usuário logado. A aba é aberta antes do await para não
 * ser bloqueada como pop-up.
 */
export async function openProtectedFile(record: { id: string }, filename: string) {
  const win = window.open('', '_blank')
  try {
    const token = await pb.files.getToken()
    // Os registros da API trazem collectionId/collectionName, mesmo que os tipos locais não declarem.
    const url = pb.files.getURL(record as unknown as RecordModel, filename, { token })
    if (win) {
      win.location.href = url
    } else {
      window.location.href = url
    }
  } catch (err) {
    win?.close()
    throw err
  }
}

export { pb }
export default pb

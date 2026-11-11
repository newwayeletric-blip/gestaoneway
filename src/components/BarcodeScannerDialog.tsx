import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { CameraOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Leitura de QR Code e código de barras pela câmera do celular/tablet (ZXing,
// no próprio navegador; nada sai do aparelho). Usa a câmera traseira quando
// houver. O primeiro código lido volta por onDetected e a janela fecha.
// A câmera precisa de HTTPS e da permissão do navegador; o vercel.json libera
// a câmera só para o próprio site (Permissions-Policy camera=(self)).
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  title,
  description,
  onDetected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onDetected: (text: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // As funções do pai mudam a cada render; a câmera só reinicia ao abrir.
  const detectedRef = useRef(onDetected)
  detectedRef.current = onDetected
  const openChangeRef = useRef(onOpenChange)
  openChangeRef.current = onOpenChange
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let controls: IScannerControls | undefined
    let done = false
    setError('')

    const start = async () => {
      // O conteúdo do diálogo monta junto com a abertura; espera o <video>.
      for (let i = 0; !videoRef.current && i < 20; i++) {
        await new Promise((r) => requestAnimationFrame(r))
      }
      if (done || !videoRef.current) return
      try {
        // O leitor (ZXing) só baixa quando a câmera abre: a tela inicial fica leve.
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (done || !videoRef.current) return
        controls = await new BrowserMultiFormatReader().decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, _err, ctrl) => {
            if (!result || done) return
            done = true
            ctrl.stop()
            detectedRef.current(result.getText().trim())
            openChangeRef.current(false)
          },
        )
        if (done) controls.stop()
      } catch (err: any) {
        if (done) return
        setError(
          err?.name === 'NotAllowedError'
            ? 'O navegador não deixou usar a câmera. Toque no cadeado ao lado do endereço e permita a câmera.'
            : err?.name === 'NotFoundError'
              ? 'Nenhuma câmera encontrada neste aparelho.'
              : 'Não foi possível abrir a câmera. Use o leitor ou digite o código.',
        )
      }
    }
    start()

    return () => {
      done = true
      controls?.stop()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-red-50 p-6 text-center text-sm text-red-700">
            <CameraOff className="h-6 w-6" />
            {error}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

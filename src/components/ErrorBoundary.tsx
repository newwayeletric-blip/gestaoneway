import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'

// Envia o erro da tela para o log do servidor (pocketbase/hooks/client_errors.js),
// para descobrir o que derrubou a tela com os dados reais. Falha em silêncio.
export function reportClientError(error: unknown, componentStack = '') {
  const err = error instanceof Error ? error : new Error(String(error))
  pb.send('/backend/v1/client-errors', {
    method: 'POST',
    body: {
      message: err.message,
      stack: err.stack || '',
      componentStack,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
    },
  }).catch(() => {})
}

interface Props {
  children: React.ReactNode
  // Ao mudar (ex.: troca de página), a tela de erro some e a página é montada de novo.
  resetKey?: string
  // Sem o layout do sistema em volta: ocupa a tela toda.
  fullScreen?: boolean
}

interface State {
  error: Error | null
}

/**
 * Antes, um erro em qualquer tela desmontava o sistema inteiro (tela branca).
 * Agora só a área da página mostra o aviso, com o motivo e um botão para tentar de novo.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Erro na tela:', error, info.componentStack)
    reportClientError(error, info.componentStack || '')
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        className={
          this.props.fullScreen
            ? 'min-h-screen flex items-center justify-center bg-gray-50 p-4'
            : 'flex items-center justify-center py-16'
        }
      >
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-[#111111]">Algo deu errado nesta tela</h2>
            <p className="text-sm text-gray-500 mt-1">
              O erro foi registrado para a equipe corrigir. Tente de novo; se continuar, envie um
              print desta mensagem.
            </p>
          </div>
          <p className="text-xs font-mono text-red-700 bg-red-50 rounded p-2 break-words">
            {this.state.error.message}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Tentar novamente
            </Button>
            <Button
              className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
              onClick={() => window.location.reload()}
            >
              Recarregar página
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary

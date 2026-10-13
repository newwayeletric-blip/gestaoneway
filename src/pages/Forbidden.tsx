import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function Forbidden() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const handleBack = () => {
    if (profile === 'vendedor') {
      navigate('/meu-painel')
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <ShieldAlert className="h-10 w-10" />
      </div>
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-700">
        Erro 403 - Acesso Negado
      </span>
      <h1 className="mt-3 text-2xl font-bold text-[#111111]">
        Você não tem permissão para acessar este módulo
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        Esta rota é de uso restrito à administração da New Way Eletric. Dados de custos, margens,
        configurações gerenciais e exclusões de registros são protegidos no servidor.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={handleBack} className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para meu painel
        </Button>
      </div>
    </div>
  )
}

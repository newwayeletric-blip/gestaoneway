import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Zap, LogIn, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { refreshUser } = useAuth()

  const isInactiveAlert = searchParams.get('inativo') === '1'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setIsLoading(true)

    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), password)

      if (authData.record.status === 'inativo') {
        pb.authStore.clear()
        setErrorMsg('Esta conta de colaborador foi desativada pela administração.')
        setIsLoading(false)
        return
      }

      await refreshUser()

      toast({
        title: `Bem-vindo, ${authData.record.name || 'Colaborador'}!`,
        description: 'Login efetuado com sucesso.',
      })

      if (authData.record.profile === 'admin') {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/meu-painel', { replace: true })
      }
    } catch (err: any) {
      console.error('Login error:', err)
      setErrorMsg('E-mail ou senha incorretos. Verifique suas credenciais.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <Card className="w-full max-w-md border-0 shadow-xl bg-white rounded-2xl">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#111111] text-[#0A8F5C] shadow-lg mb-3">
            <Zap className="h-8 w-8 fill-[#0A8F5C]" />
          </div>
          <CardTitle className="text-2xl font-bold text-[#111111]">NEW WAY ELETRIC</CardTitle>
          <CardDescription className="text-gray-500 text-sm">
            Gestão Interna • Shopping Jockey Plaza & Cajuru
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isInactiveAlert && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Sua conta está desativada. Entre em contato com a administração.</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-gray-700">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="colaborador@newwayeletric.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-gray-700">
                  Senha
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-[#0A8F5C] hover:underline font-medium"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[#0A8F5C] hover:bg-[#087A4D] text-white font-semibold flex items-center justify-center gap-2 rounded-lg shadow-md"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Entrar no Sistema
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center text-xs text-gray-400">
            Acesso exclusivo para colaboradores autorizados.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

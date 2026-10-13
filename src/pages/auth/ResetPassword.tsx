import React, { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Zap, KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!token) {
      setErrorMsg('Token de recuperação inválido ou ausente no link.')
      return
    }
    if (password.length < 8) {
      setErrorMsg('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (password !== passwordConfirm) {
      setErrorMsg('A confirmação da nova senha não confere.')
      return
    }

    setIsLoading(true)
    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
      setIsSuccess(true)
      toast({
        title: 'Senha redefinida com sucesso!',
        description: 'Você já pode acessar o sistema com sua nova senha.',
      })
    } catch (err: any) {
      console.error('Confirm password reset error:', err)
      setErrorMsg(err?.message || 'Token expirado ou inválido. Solicite uma nova recuperação.')
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
          <CardTitle className="text-xl font-bold text-[#111111]">Redefinição de Senha</CardTitle>
          <CardDescription className="text-gray-500 text-sm">
            Crie uma nova senha de acesso segura para sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Token ausente. Use o link recebido por e-mail para redefinir sua senha.</span>
            </div>
          )}

          {isSuccess ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-[#0A8F5C]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm text-gray-700">Sua senha foi atualizada com sucesso!</p>
              <Button asChild className="w-full bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                <Link to="/login">Ir para a Tela de Login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-gray-700">
                  Nova Senha
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={!token}
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="passwordConfirm" className="text-xs font-semibold text-gray-700">
                  Confirmar Nova Senha
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  disabled={!token}
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !token}
                className="w-full h-11 bg-[#0A8F5C] hover:bg-[#087A4D] text-white font-semibold flex items-center justify-center gap-2 rounded-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando nova senha...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    Redefinir Senha
                  </>
                )}
              </Button>

              <div className="text-center pt-2">
                <Link to="/login" className="text-xs text-gray-500 hover:text-gray-900 font-medium">
                  Voltar ao login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

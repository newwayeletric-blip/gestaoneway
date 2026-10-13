import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Zap, ArrowLeft, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setIsLoading(true)

    try {
      await pb.collection('users').requestPasswordReset(email.trim())
      setSentSuccess(true)
    } catch (err: any) {
      console.error('Password reset request error:', err)
      // Even if email is not found, PocketBase might return success for security, but handle any actual failure
      setErrorMsg('Não foi possível enviar o e-mail de recuperação. Verifique o endereço digitado.')
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
          <CardTitle className="text-xl font-bold text-[#111111]">Recuperação de Senha</CardTitle>
          <CardDescription className="text-gray-500 text-sm">
            Informe seu e-mail cadastrado para receber o link com token de redefinição de acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sentSuccess ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-[#0A8F5C]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm text-gray-700">
                Se o e-mail <strong>{email}</strong> estiver cadastrado na base da New Way Eletric,
                você receberá um link com o token para redefinir sua senha.
              </p>
              <Button asChild className="w-full bg-[#111111] hover:bg-black text-white">
                <Link to="/login">Voltar ao Login</Link>
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
                <Label htmlFor="email" className="text-xs font-semibold text-gray-700">
                  E-mail corporativo
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu.email@newwayeletric.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[#0A8F5C] hover:bg-[#087A4D] text-white font-semibold flex items-center justify-center gap-2 rounded-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando instrução...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Enviar Link de Recuperação
                  </>
                )}
              </Button>

              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-medium"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar para o login
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

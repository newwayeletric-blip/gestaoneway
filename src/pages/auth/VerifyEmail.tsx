import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Zap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setErrorMsg('Token de verificação não informado.')
      return
    }

    const confirm = async () => {
      setIsLoading(true)
      try {
        await pb.collection('users').confirmVerification(token)
        setIsSuccess(true)
      } catch (err: any) {
        console.error('Email verification error:', err)
        setErrorMsg(err?.message || 'Token de verificação inválido ou expirado.')
      } finally {
        setIsLoading(false)
      }
    }

    confirm()
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F8FA] p-4">
      <Card className="w-full max-w-md border-0 shadow-xl bg-white rounded-2xl">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#111111] text-[#0A8F5C] shadow-lg mb-3">
            <Zap className="h-8 w-8 fill-[#0A8F5C]" />
          </div>
          <CardTitle className="text-xl font-bold text-[#111111]">Verificação de E-mail</CardTitle>
          <CardDescription className="text-gray-500 text-sm">
            Confirmação da sua conta institucional na New Way Eletric.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-6">
          {isLoading && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#0A8F5C]" />
              <p className="text-sm text-gray-600">Validando o token de verificação...</p>
            </div>
          )}

          {!isLoading && isSuccess && (
            <div className="space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-[#0A8F5C]">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-[#111111]">E-mail confirmado com sucesso!</h3>
              <p className="text-sm text-gray-600">
                Sua conta de colaborador foi verificada. Você já pode fazer login e operar no
                sistema.
              </p>
              <Button asChild className="w-full bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                <Link to="/login">Fazer Login</Link>
              </Button>
            </div>
          )}

          {!isLoading && errorMsg && (
            <div className="space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-[#111111]">Falha na Verificação</h3>
              <p className="text-sm text-red-600">{errorMsg}</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Voltar ao Login</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

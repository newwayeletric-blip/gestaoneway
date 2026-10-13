import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Zap, ShieldCheck, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function Setup() {
  const { hasAnyAdmin, checkHasAnyAdmin, refreshUser } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    const verifySetupAvailability = async () => {
      setChecking(true)
      const exists = await checkHasAnyAdmin()
      if (exists) {
        // Already configured! Setup must redirect to login
        navigate('/login', { replace: true })
      } else {
        setChecking(false)
      }
    }
    verifySetupAvailability()
  }, [navigate])

  if (checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F7F8FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A8F5C]" />
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!name.trim()) {
      setErrorMsg('Informe o nome completo.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Informe um e-mail válido.')
      return
    }
    if (password.length < 8) {
      setErrorMsg('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('A confirmação de senha não coincide.')
      return
    }

    try {
      setIsLoading(true)

      // Create first administrator user
      await pb.collection('users').create({
        name: name.trim(),
        email: email.trim(),
        password: password,
        passwordConfirm: confirmPassword,
        profile: 'admin',
        status: 'ativo',
        emailVisibility: true,
      })

      // Authenticate with new admin
      await pb.collection('users').authWithPassword(email.trim(), password)
      await refreshUser()
      await checkHasAnyAdmin()

      toast({
        title: 'Configuração concluída com sucesso!',
        description: 'Primeiro administrador criado. Bem-vindo à New Way Eletric.',
      })

      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      console.error('Setup error:', err)
      const detail = err?.data?.data
      if (detail && typeof detail === 'object') {
        const firstErrorKey = Object.keys(detail)[0]
        setErrorMsg(`${firstErrorKey}: ${detail[firstErrorKey].message}`)
      } else {
        setErrorMsg(err?.message || 'Falha ao criar o administrador inicial.')
      }
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
          <span className="inline-block mx-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-[#0A8F5C] uppercase tracking-wider mb-2">
            Primeiro Acesso / Instalação
          </span>
          <CardTitle className="text-2xl font-bold text-[#111111]">Configuração Inicial</CardTitle>
          <CardDescription className="text-gray-500 text-sm">
            Cadastre o primeiro <strong>ADMINISTRADOR</strong> com permissão total nas unidades
            Shopping Jockey Plaza e Loja de rua (Cajuru).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold text-gray-700">
                Nome completo do Responsável
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex: Carlos Ferreira"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-gray-700">
                E-mail corporativo
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@newwayeletric.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-gray-700">
                Senha (mínimo 8 caracteres)
              </Label>
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

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-semibold text-gray-700">
                Confirmar Senha
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                    Criando Administrador...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Concluir e Iniciar Sistema
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

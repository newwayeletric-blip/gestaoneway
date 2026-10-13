import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRecord, UserProfile, UserStatus } from '@/types'
import { formatDateBR } from '@/lib/formatters'
import {
  Users as UsersIcon,
  UserPlus,
  Shield,
  CheckCircle,
  XCircle,
  Mail,
  KeyRound,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'

export default function UsersList() {
  const { stores, user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [profile, setProfile] = useState<UserProfile>('vendedor')
  const [status, setStatus] = useState<UserStatus>('ativo')
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  const [csAvailable, setCsAvailable] = useState<boolean>(true)

  const { toast } = useToast()

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const list = await pb.collection<UserRecord>('users').getFullList({ sort: '-created' })
      setUsers(list)
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const openNewUserModal = () => {
    setEditingUser(null)
    setName('')
    setEmail('')
    setPassword('')
    setProfile('vendedor')
    setStatus('ativo')
    setSelectedStores(stores.map((s) => s.id))
    setCsAvailable(true)
    setIsModalOpen(true)
  }

  const openEditModal = (u: UserRecord) => {
    setEditingUser(u)
    setName(u.name || '')
    setEmail(u.email || '')
    setPassword('')
    setProfile(u.profile || 'vendedor')
    setStatus(u.status || 'ativo')
    setSelectedStores(u.stores || [])
    setCsAvailable(u.cs_available !== false)
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      toast({
        title: 'Atenção',
        description: 'Nome e e-mail são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    try {
      if (editingUser) {
        // Update user
        const updatePayload: any = {
          name: name.trim(),
          profile: profile,
          status: status,
          stores: selectedStores,
          cs_available: csAvailable,
        }
        if (password.length >= 8) {
          updatePayload.password = password
          updatePayload.passwordConfirm = password
        }

        await pb.collection('users').update(editingUser.id, updatePayload)
        toast({ title: 'Sucesso', description: 'Usuário atualizado com sucesso.' })
      } else {
        // Create user
        if (password.length < 8) {
          toast({
            title: 'Atenção',
            description: 'A senha inicial deve ter no mínimo 8 caracteres.',
            variant: 'destructive',
          })
          return
        }

        await pb.collection('users').create({
          name: name.trim(),
          email: email.trim(),
          password: password,
          passwordConfirm: password,
          profile: profile,
          status: status,
          stores: selectedStores,
          cs_available: csAvailable,
          created_by: currentUser?.id,
          emailVisibility: true,
        })

        // Trigger verification email
        try {
          await pb.collection('users').requestVerification(email.trim())
        } catch {
          // ignore if mail service not fully configured
        }

        toast({
          title: 'Colaborador cadastrado!',
          description: 'Conta criada e e-mail de verificação enviado.',
        })
      }

      setIsModalOpen(false)
      loadUsers()
    } catch (err: any) {
      console.error('Error saving user:', err)
      toast({
        title: 'Erro ao salvar colaborador',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleSendVerification = async (userEmail: string) => {
    try {
      await pb.collection('users').requestVerification(userEmail)
      toast({
        title: 'E-mail enviado',
        description: `Instruções de verificação enviadas para ${userEmail}.`,
      })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSendResetPassword = async (userEmail: string) => {
    try {
      await pb.collection('users').requestPasswordReset(userEmail)
      toast({
        title: 'E-mail de recuperação enviado',
        description: `Link com token enviado para ${userEmail}.`,
      })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const toggleStore = (storeId: string) => {
    if (selectedStores.includes(storeId)) {
      setSelectedStores(selectedStores.filter((id) => id !== storeId))
    } else {
      setSelectedStores([...selectedStores, storeId])
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER + ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            Usuários & Permissões
          </h2>
          <p className="text-sm text-gray-500">
            Gerenciamento de colaboradores, perfis de acesso (Admin / Vendedor) e lojas autorizadas.
          </p>
        </div>

        <Button onClick={openNewUserModal} className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
          <UserPlus className="mr-2 h-4 w-4" /> Novo Colaborador
        </Button>
      </div>

      {/* USER LIST TABLE */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Nome / E-mail</th>
                <th className="py-2.5 px-3 font-semibold">Perfil</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Lojas Autorizadas</th>
                <th className="py-2.5 px-3 font-semibold">Comissões</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3">
                    <p className="font-semibold text-gray-800 text-sm">{u.name || 'Sem nome'}</p>
                    <span className="text-[11px] text-gray-400">{u.email}</span>
                  </td>
                  <td className="py-3 px-3">
                    <Badge
                      className={
                        u.profile === 'admin'
                          ? 'bg-[#111111] text-white'
                          : 'bg-blue-100 text-blue-800'
                      }
                    >
                      {u.profile === 'admin' ? 'ADMINISTRADOR' : 'VENDEDOR'}
                    </Badge>
                  </td>
                  <td className="py-3 px-3">
                    <Badge
                      className={
                        u.status === 'ativo'
                          ? 'bg-emerald-100 text-[#0A8F5C]'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      {u.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-gray-600">
                    {u.profile === 'admin' ? (
                      <span className="text-gray-400 italic">Todas as unidades</span>
                    ) : u.stores && u.stores.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.stores.map((sId) => {
                          const st = stores.find((s) => s.id === sId)
                          return (
                            <span
                              key={sId}
                              className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px]"
                            >
                              {st?.name?.includes('Jockey') ? 'Jockey' : 'Cajuru'}
                            </span>
                          )
                        })}
                      </div>
                    ) : (
                      <span className="text-gray-400">Nenhuma</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {u.cs_available !== false ? (
                      <span className="text-emerald-700 text-[11px] font-medium">Habilitado</span>
                    ) : (
                      <span className="text-gray-400 text-[11px]">Desabilitado</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(u)}
                      className="h-7 text-xs"
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Enviar link de reset de senha"
                      onClick={() => handleSendResetPassword(u.email)}
                      className="h-7 w-7 text-gray-500 hover:text-black"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Reenviar verificação de e-mail"
                      onClick={() => handleSendVerification(u.email)}
                      className="h-7 w-7 text-gray-500 hover:text-black"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL CRIAR/EDITAR USUÁRIO */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Colaborador' : 'Novo Colaborador'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Atualize os dados e acessos deste colaborador.'
                : 'Cadastre um colaborador e defina suas lojas de atendimento.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="uname">Nome Completo</Label>
              <Input
                id="uname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Lucas Silva"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="uemail">E-mail</Label>
              <Input
                id="uemail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lucas@newwayeletric.com.br"
                required
                disabled={!!editingUser}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upass">
                {editingUser
                  ? 'Nova Senha (deixe em branco para manter a atual)'
                  : 'Senha Inicial (mínimo 8 caracteres)'}
              </Label>
              <Input
                id="upass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required={!editingUser}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="uprof">Perfil de Acesso</Label>
                <Select value={profile} onValueChange={(val: any) => setProfile(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ustatus">Situação</Label>
                <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo (Bloqueado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {profile === 'vendedor' && (
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <Label className="text-xs font-semibold text-gray-700">
                  Lojas Autorizadas para Venda
                </Label>
                <div className="space-y-1.5">
                  {stores.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStores.includes(s.id)}
                        onChange={() => toggleStore(s.id)}
                        className="rounded border-gray-300 text-[#0A8F5C] focus:ring-[#0A8F5C]"
                      />
                      <span>
                        {s.name} ({s.slug === 'jockey-plaza' ? 'Shopping Jockey' : 'Oficina Cajuru'}
                        )
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <input
                id="csAvail"
                type="checkbox"
                checked={csAvailable}
                onChange={(e) => setCsAvailable(e.target.checked)}
                className="rounded border-gray-300 text-[#0A8F5C] focus:ring-[#0A8F5C]"
              />
              <Label htmlFor="csAvail" className="text-xs text-gray-700 font-normal cursor-pointer">
                Disponível para receber comissões sobre novas vendas
              </Label>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                Salvar Colaborador
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

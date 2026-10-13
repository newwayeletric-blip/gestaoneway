import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { CustomersService } from '@/services/api'
import type { CustomerRecord } from '@/types'
import {
  formatDateBR,
  formatPhoneBR,
  formatDocumentBR,
  normalizePhone,
  normalizeDocument,
} from '@/lib/formatters'
import {
  Users as UsersIcon,
  UserPlus,
  Search,
  Eye,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

export default function CustomersList() {
  const { user, isAdmin } = useAuth()
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // New Customer Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [cName, setCName] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cDoc, setCDoc] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cAddress, setCAddress] = useState('')
  const [cNotes, setCNotes] = useState('')

  // Duplicate Check warning
  const [duplicateFound, setDuplicateFound] = useState<CustomerRecord | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  const { toast } = useToast()

  const loadCustomers = async () => {
    setIsLoading(true)
    try {
      const list = await CustomersService.getAll(search)
      setCustomers(list)
    } catch (err) {
      console.error('Error loading customers:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [search])

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cName.trim() || !cPhone.trim()) {
      toast({
        title: 'Atenção',
        description: 'Nome e telefone são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    const normPhone = normalizePhone(cPhone)
    const normDoc = normalizeDocument(cDoc)

    // Duplicate check
    const existing = await CustomersService.checkDuplicate(normPhone, normDoc)
    if (existing.length > 0 && !showDuplicateModal) {
      setDuplicateFound(existing[0])
      setShowDuplicateModal(true)
      return
    }

    try {
      await CustomersService.create({
        name: cName.trim(),
        phone: normPhone,
        document: normDoc || undefined,
        email: cEmail.trim() || undefined,
        address: cAddress.trim() || undefined,
        notes: cNotes.trim() || undefined,
        created_by: user?.id,
      })

      toast({ title: 'Cliente cadastrado com sucesso!' })
      setIsModalOpen(false)
      setShowDuplicateModal(false)
      setCName('')
      setCPhone('')
      setCDoc('')
      setCEmail('')
      setCAddress('')
      setCNotes('')
      loadCustomers()
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar cliente',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER + ACTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            Clientes & Atendimento
          </h2>
          <p className="text-sm text-gray-500">
            Base única compartilhada entre Shopping Jockey Plaza e Loja de rua (Cajuru).
          </p>
        </div>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
        >
          <UserPlus className="mr-2 h-4 w-4" /> Cadastrar Cliente
        </Button>
      </div>

      {/* SEARCH BAR */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Pesquisar por nome, telefone (+55...) ou CPF/CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs"
          />
        </div>
      </Card>

      {/* CUSTOMERS TABLE */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Nome Completo</th>
                <th className="py-2.5 px-3 font-semibold">Telefone / WhatsApp</th>
                <th className="py-2.5 px-3 font-semibold">CPF / Documento</th>
                <th className="py-2.5 px-3 font-semibold">E-mail</th>
                <th className="py-2.5 px-3 font-semibold">Cadastrado em</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-semibold text-gray-900">{c.name}</td>
                  <td className="py-3 px-3 text-gray-700">{formatPhoneBR(c.phone)}</td>
                  <td className="py-3 px-3 font-mono text-gray-600">
                    {c.document ? formatDocumentBR(c.document) : '-'}
                  </td>
                  <td className="py-3 px-3 text-gray-500">{c.email || '-'}</td>
                  <td className="py-3 px-3 text-gray-400">{formatDateBR(c.created)}</td>
                  <td className="py-3 px-3 text-right">
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                      <Link to={`/clientes/${c.id}`}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Ver Ficha
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    Nenhum cliente localizado na base.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL NOVO CLIENTE */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
            <DialogDescription>
              Base unificada com validação de documento e duplicidades.
            </DialogDescription>
          </DialogHeader>

          {showDuplicateModal && duplicateFound && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Registro semelhante encontrado!
              </p>
              <p>
                Já existe o cliente <strong>{duplicateFound.name}</strong> com o telefone/documento
                informado.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDuplicateModal(false)}
                  className="text-xs h-7"
                >
                  Corrigir Dados
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateCustomer}
                  className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Confirmar Cadastro
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateCustomer} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <Input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Ex: Amanda Silva"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Telefone / WhatsApp *</Label>
                <Input
                  value={cPhone}
                  onChange={(e) => setCPhone(e.target.value)}
                  placeholder="(41) 99999-9999"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">CPF ou CNPJ</Label>
                <Input
                  value={cDoc}
                  onChange={(e) => setCDoc(e.target.value)}
                  placeholder="Apenas dígitos"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">E-mail</Label>
              <Input
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                placeholder="cliente@exemplo.com.br"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Endereço de Entrega</Label>
              <Input
                value={cAddress}
                onChange={(e) => setCAddress(e.target.value)}
                placeholder="Rua, número, bairro, Curitiba/PR"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Observações de Atendimento</Label>
              <Textarea
                value={cNotes}
                onChange={(e) => setCNotes(e.target.value)}
                placeholder="Preferências, test-ride realizado, interesse em acessórios..."
                rows={2}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                Salvar Cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

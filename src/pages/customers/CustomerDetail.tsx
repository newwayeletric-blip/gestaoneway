import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { CustomersService, SalesService } from '@/services/api'
import type { CustomerRecord, SaleRecord } from '@/types'
import { formatBRL, formatDateBR, formatPhoneBR, formatDocumentBR } from '@/lib/formatters'
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  ShoppingCart,
  ArrowLeft,
  CheckCircle,
  Save,
  ShieldAlert,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, user } = useAuth()
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Edit fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [doc, setDoc] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { toast } = useToast()

  const loadCustomer = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const [cust, custSales] = await Promise.all([
        CustomersService.getById(id),
        SalesService.getAll(`customer = "${id}"`),
      ])
      setCustomer(cust)
      setSales(custSales)

      setName(cust.name || '')
      setPhone(cust.phone || '')
      setDoc(cust.document || '')
      setEmail(cust.email || '')
      setAddress(cust.address || '')
      setNotes(cust.notes || '')
    } catch (err) {
      console.error('Error loading customer:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCustomer()
  }, [id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    // Seller cannot edit document
    const payload: Partial<CustomerRecord> = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    if (isAdmin) {
      payload.document = doc.trim() || undefined
    }

    setIsSaving(true)
    try {
      await CustomersService.update(id, payload)
      toast({ title: 'Ficha do cliente atualizada com sucesso!' })
      loadCustomer()
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A8F5C]" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-gray-500">Cliente não localizado.</p>
        <Button asChild variant="outline">
          <Link to="/clientes">Voltar para Clientes</Link>
        </Button>
      </div>
    )
  }

  const latestSale = sales.length > 0 ? sales[0] : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="text-gray-600">
          <Link to="/clientes">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar para Clientes
          </Link>
        </Button>

        <span className="text-xs text-gray-400">
          Cadastrado em {formatDateBR(customer.created, true)}
        </span>
      </div>

      {/* HIGHLIGHT: LATEST PURCHASE & INVOICE */}
      {latestSale && (
        <Card className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#0A8F5C] block">
                Última Compra Realizada
              </span>
              <p className="font-bold text-base text-gray-900 mt-0.5">
                Venda {latestSale.number} • {formatBRL(latestSale.total)}
              </p>
              <p className="text-xs text-gray-600">
                Loja: {latestSale.expand?.store?.name} • Vendedor: {latestSale.expand?.seller?.name}{' '}
                • Data: {formatDateBR(latestSale.created)}
              </p>
            </div>

            <Button
              asChild
              size="sm"
              className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white text-xs"
            >
              <Link to={`/vendas/${latestSale.id}`}>Ver Comprovante</Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CADASTRO & EDIÇÃO (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <h3 className="font-bold text-base text-[#111111] mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-[#0A8F5C]" /> Dados Cadastrais
            </h3>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Nome Completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">CPF / CNPJ</Label>
                  {!isAdmin && (
                    <span className="text-[10px] text-amber-700 italic">
                      Edição restrita ao Admin
                    </span>
                  )}
                </div>
                <Input
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Somente administração altera documento"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@exemplo.com.br"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Endereço</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Endereço de entrega"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Observações de Atendimento</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Histórico de atendimento, preferências..."
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-[#111111] hover:bg-black text-white"
                >
                  <Save className="h-4 w-4 mr-2" /> Salvar Alterações
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* HISTÓRICO DE COMPRAS COMPARTILHADO (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-[#111111] flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-[#0A8F5C]" /> Histórico de Compras (
                  {sales.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Visão compartilhada de compras realizadas nas duas lojas (sem exposição de custos
                  ou margens).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Venda</th>
                    <th className="py-2.5 px-3 font-semibold">Loja</th>
                    <th className="py-2.5 px-3 font-semibold">Vendedor</th>
                    <th className="py-2.5 px-3 font-semibold">Valor</th>
                    <th className="py-2.5 px-3 font-semibold">Pagamento</th>
                    <th className="py-2.5 px-3 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sales.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-3">
                        <Link
                          to={`/vendas/${s.id}`}
                          className="font-mono font-bold text-[#0A8F5C] hover:underline"
                        >
                          {s.number}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-gray-600">
                        {s.expand?.store?.name?.includes('Jockey')
                          ? 'Shopping Jockey'
                          : 'Loja de rua'}
                      </td>
                      <td className="py-3 px-3 text-gray-600">{s.expand?.seller?.name || '-'}</td>
                      <td className="py-3 px-3 font-bold text-gray-900">{formatBRL(s.total)}</td>
                      <td className="py-3 px-3 uppercase text-[10px] font-mono text-gray-500">
                        {s.payment === 'cartao_credito'
                          ? `Cartão (${s.installments || 1}x)`
                          : s.payment}
                      </td>
                      <td className="py-3 px-3 text-gray-400">{formatDateBR(s.created)}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        Nenhuma compra registrada para este cliente até o momento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

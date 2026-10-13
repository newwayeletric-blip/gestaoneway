import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { FinancialService } from '@/services/api'
import type { ExpenseRecord, PaymentLedgerRecord } from '@/types'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import useRealtime from '@/hooks/use-realtime'
import {
  DollarSign,
  TrendingUp,
  Receipt,
  PlusCircle,
  Trash2,
  Calendar,
  Filter,
  CheckCircle,
  Clock,
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
import { useToast } from '@/hooks/use-toast'

export default function Financial() {
  const { stores, activeStoreId, user } = useAuth()
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [payments, setPayments] = useState<PaymentLedgerRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState<string>(activeStoreId || '')

  // Form state for expense
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('Geral')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro' | 'cartao_credito'>('pix')
  const [storeForExpense, setStoreForExpense] = useState(activeStoreId || stores[0]?.id || '')

  const { toast } = useToast()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [expList, payList] = await Promise.all([
        FinancialService.getExpenses(selectedStore),
        FinancialService.getPayments(selectedStore),
      ])
      setExpenses(expList)
      setPayments(payList)
    } catch (err) {
      console.error('Error loading financial data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedStore])

  useRealtime('expenses', () => loadData())
  useRealtime('payments', () => loadData())

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!desc.trim() || !amount || Number(amount) <= 0) {
      toast({
        title: 'Atenção',
        description: 'Preencha a descrição e um valor válido.',
        variant: 'destructive',
      })
      return
    }

    try {
      await FinancialService.createExpense({
        store: storeForExpense,
        description: desc.trim(),
        category: cat,
        amount: Number(amount),
        date: new Date(date).toISOString(),
        payment_method: paymentMethod,
        created_by: user?.id,
      })

      toast({ title: 'Sucesso', description: 'Despesa lançada com sucesso!' })
      setIsModalOpen(false)
      setDesc('')
      setAmount('')
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao lançar despesa.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lançamento de despesa?')) return
    try {
      await FinancialService.deleteExpense(id)
      toast({ title: 'Despesa excluída com sucesso.' })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao excluir.',
        variant: 'destructive',
      })
    }
  }

  // Calculations
  const totalRecebido = payments
    .filter((p) => p.status === 'pago')
    .reduce((acc, p) => acc + p.amount, 0)
  const totalPendente = payments
    .filter((p) => p.status === 'pendente')
    .reduce((acc, p) => acc + p.amount, 0)
  const totalDespesas = expenses.reduce((acc, e) => acc + e.amount, 0)
  const saldoLiquido = totalRecebido - totalDespesas

  return (
    <div className="space-y-6">
      {/* HEADER + ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Financeiro Gerencial</h2>
          <p className="text-sm text-gray-500">
            Controle de recebimentos, fluxo de caixa, despesas operacionais e saldos por loja.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* STORE FILTER */}
          <Select value={selectedStore} onValueChange={(val) => setSelectedStore(val)}>
            <SelectTrigger className="w-48 bg-white border-gray-300">
              <Filter className="mr-2 h-4 w-4 text-gray-500" />
              <SelectValue placeholder="Todas as Lojas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas as Unidades</SelectItem>
              {stores.map((st) => (
                <SelectItem key={st.id} value={st.id}>
                  {st.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* NOVA DESPESA BUTTON */}
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                <PlusCircle className="mr-2 h-4 w-4" /> Lançar Despesa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px] bg-white">
              <DialogHeader>
                <DialogTitle>Lançar Nova Despesa Operacional</DialogTitle>
                <DialogDescription>
                  Registre contas de consumo, manutenção da loja/oficina, materiais ou suprimentos.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateExpense} className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Descrição da Despesa</Label>
                  <Input
                    id="desc"
                    placeholder="Ex: Energia elétrica da oficina, Embalagens..."
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="store">Loja / Unidade</Label>
                    <Select value={storeForExpense} onValueChange={setStoreForExpense}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cat">Categoria</Label>
                    <Select value={cat} onValueChange={setCat}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Geral">Geral</SelectItem>
                        <SelectItem value="Aluguel e Condomínio">Aluguel e Condomínio</SelectItem>
                        <SelectItem value="Energia e Água">Energia e Água</SelectItem>
                        <SelectItem value="Ferramentas e Peças">Ferramentas e Peças</SelectItem>
                        <SelectItem value="Marketing e Publicidade">
                          Marketing e Publicidade
                        </SelectItem>
                        <SelectItem value="Impostos e Taxas">Impostos e Taxas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="val">Valor (R$)</Label>
                    <Input
                      id="val"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0,00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="date">Data do Pagamento</Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="method">Forma de Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">Pix (Transferência bancária)</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro (Espécie em caixa)</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito Corporativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
                    Salvar Lançamento
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Recebimentos Pagos
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#0A8F5C]">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#0A8F5C]">{formatBRL(totalRecebido)}</div>
            <p className="text-xs text-gray-400 mt-1">Vendas liquidadas com sucesso</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              A Receber / Pendente
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatBRL(totalPendente)}</div>
            <p className="text-xs text-gray-400 mt-1">Parcelas a vencer ou pendências</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total de Despesas
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Receipt className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatBRL(totalDespesas)}</div>
            <p className="text-xs text-gray-400 mt-1">{expenses.length} lançamentos efetuados</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Saldo Líquido em Caixa
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${saldoLiquido >= 0 ? 'text-[#0A8F5C]' : 'text-red-600'}`}
            >
              {formatBRL(saldoLiquido)}
            </div>
            <p className="text-xs text-gray-400 mt-1">Recebido subtraído das despesas</p>
          </CardContent>
        </Card>
      </div>

      {/* TABS / LISTINGS: DESPESAS & RECEBIMENTOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DESPESAS OPERACIONAIS */}
        <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[#111111]">Despesas Registradas</h3>
              <p className="text-xs text-gray-500">Contas e custos operacionais das lojas</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="py-2 px-3 font-semibold">Descrição</th>
                  <th className="py-2 px-3 font-semibold">Loja</th>
                  <th className="py-2 px-3 font-semibold">Valor</th>
                  <th className="py-2 px-3 font-semibold">Data</th>
                  <th className="py-2 px-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-3">
                      <p className="font-semibold text-gray-800">{e.description}</p>
                      <span className="text-[10px] text-gray-400">
                        {e.category || 'Geral'} • {e.payment_method?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-600">
                      {e.expand?.store?.name?.includes('Jockey') ? 'Jockey' : 'Cajuru'}
                    </td>
                    <td className="py-3 px-3 font-semibold text-red-600">{formatBRL(e.amount)}</td>
                    <td className="py-3 px-3 text-gray-400">{formatDateBR(e.date)}</td>
                    <td className="py-3 px-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteExpense(e.id)}
                        className="h-7 w-7 text-gray-400 hover:text-red-600"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      Nenhuma despesa cadastrada para a loja selecionada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* SITUAÇÃO DE RECEBIMENTOS */}
        <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[#111111]">Recebimentos das Vendas</h3>
              <p className="text-xs text-gray-500">
                Situação de pagamentos (Pix, Dinheiro, Cartão)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="py-2 px-3 font-semibold">Venda / Cliente</th>
                  <th className="py-2 px-3 font-semibold">Método</th>
                  <th className="py-2 px-3 font-semibold">Valor</th>
                  <th className="py-2 px-3 font-semibold">Situação</th>
                  <th className="py-2 px-3 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-3">
                      <p className="font-semibold text-gray-800">
                        {p.expand?.sale?.number || 'Venda'}
                      </p>
                      <span className="text-[10px] text-gray-400">
                        {p.expand?.customer?.name || 'Cliente Balcão'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-600 uppercase font-medium">
                      {p.method === 'cartao_credito' ? 'Cartão' : p.method}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#0A8F5C]">
                      {formatBRL(p.amount)}
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        className={
                          p.status === 'pago'
                            ? 'bg-emerald-100 text-[#0A8F5C]'
                            : 'bg-amber-100 text-amber-800'
                        }
                      >
                        {p.status === 'pago' ? 'Pago' : 'Pendente'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-gray-400">{formatDateBR(p.created)}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      Nenhum recebimento registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

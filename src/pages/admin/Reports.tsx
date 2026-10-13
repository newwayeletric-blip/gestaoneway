import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  SalesService,
  CustomersService,
  StockService,
  FinancialService,
  CommissionsService,
} from '@/services/api'
import { formatBRL, formatDateBR } from '@/lib/formatters'
import { FileSpreadsheet, Download, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

export default function Reports() {
  const { stores } = useAuth()
  const [reportType, setReportType] = useState<
    'vendas' | 'clientes' | 'estoque' | 'comissoes' | 'financeiro'
  >('vendas')
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [dataList, setDataList] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const loadReport = async () => {
    setIsLoading(true)
    try {
      if (reportType === 'vendas') {
        const filter = selectedStore ? `store = "${selectedStore}"` : ''
        const list = await SalesService.getAll(filter)
        setDataList(list)
      } else if (reportType === 'clientes') {
        const list = await CustomersService.getAll()
        setDataList(list)
      } else if (reportType === 'estoque') {
        const list = await StockService.getStockItems(selectedStore)
        setDataList(list)
      } else if (reportType === 'comissoes') {
        const list = await CommissionsService.getAll('', selectedStore)
        setDataList(list)
      } else if (reportType === 'financeiro') {
        const list = await FinancialService.getExpenses(selectedStore)
        setDataList(list)
      }
    } catch (err) {
      console.error('Error loading report:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [reportType, selectedStore])

  const handleExportCSV = () => {
    if (dataList.length === 0) {
      toast({
        title: 'Atenção',
        description: 'Não há dados para exportar.',
        variant: 'destructive',
      })
      return
    }

    let csvContent = 'data:text/csv;charset=utf-8,'

    if (reportType === 'vendas') {
      csvContent += 'Numero,Cliente,Loja,Status,Total,Pagamento,Data\r\n'
      dataList.forEach((s) => {
        csvContent += `"${s.number}","${s.expand?.customer?.name || ''}","${s.expand?.store?.name || ''}","${s.status}","${s.total}","${s.payment || ''}","${s.created}"\r\n`
      })
    } else if (reportType === 'clientes') {
      csvContent += 'Nome,Telefone,Documento,Email,Endereco,DataCadastro\r\n'
      dataList.forEach((c) => {
        csvContent += `"${c.name}","${c.phone}","${c.document || ''}","${c.email || ''}","${c.address || ''}","${c.created}"\r\n`
      })
    } else if (reportType === 'estoque') {
      csvContent += 'Produto,Variacao,Loja,Quantidade,EstoqueMinimo\r\n'
      dataList.forEach((st) => {
        csvContent += `"${st.expand?.product?.name || ''}","${st.expand?.variant?.name || ''}","${st.expand?.store?.name || ''}","${st.quantity}","${st.expand?.product?.min_stock || 0}"\r\n`
      })
    } else if (reportType === 'comissoes') {
      csvContent += 'Vendedor,Venda,Loja,BaseCalculo,Taxa,Comissao,Status\r\n'
      dataList.forEach((com) => {
        csvContent += `"${com.expand?.seller?.name || ''}","${com.expand?.sale?.number || ''}","${com.expand?.store?.name || ''}","${com.base_amount}","${com.rate}","${com.value}","${com.status}"\r\n`
      })
    } else if (reportType === 'financeiro') {
      csvContent += 'Descricao,Categoria,Loja,Valor,Data,Metodo\r\n'
      dataList.forEach((f) => {
        csvContent += `"${f.description}","${f.category || ''}","${f.expand?.store?.name || ''}","${f.amount}","${f.date}","${f.payment_method || ''}"\r\n`
      })
    }

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `new_way_eletric_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({ title: 'Relatório exportado!', description: 'Arquivo CSV gerado com sucesso.' })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">
            Relatórios Gerenciais
          </h2>
          <p className="text-sm text-gray-500">
            Exportação de dados consolidados em planilha CSV para análise e auditoria.
          </p>
        </div>

        <Button onClick={handleExportCSV} className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white">
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* FILTER BAR */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Módulo do Relatório
            </label>
            <Select value={reportType} onValueChange={(val: any) => setReportType(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendas">Vendas Realizadas</SelectItem>
                <SelectItem value="clientes">Base de Clientes</SelectItem>
                <SelectItem value="estoque">Posição de Estoque</SelectItem>
                <SelectItem value="comissoes">Comissões de Vendedores</SelectItem>
                <SelectItem value="financeiro">Despesas e Financeiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Filtrar por Unidade
            </label>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as Lojas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as Unidades</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* PREVIEW TABLE */}
      <Card className="bg-white border-0 shadow-sm rounded-xl p-5">
        <h3 className="font-bold text-base text-[#111111] mb-2 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-[#0A8F5C]" /> Pré-visualização dos Dados (
          {dataList.length} registros)
        </h3>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Identificação</th>
                <th className="py-2.5 px-3 font-semibold">Detalhes</th>
                <th className="py-2.5 px-3 font-semibold">Loja / Unidade</th>
                <th className="py-2.5 px-3 font-semibold">Valor / Qtd</th>
                <th className="py-2.5 px-3 font-semibold">Data / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dataList.slice(0, 15).map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-medium text-gray-800">
                    {item.number ||
                      item.name ||
                      item.description ||
                      item.expand?.product?.name ||
                      `Item #${idx + 1}`}
                  </td>
                  <td className="py-3 px-3 text-gray-600 truncate max-w-[200px]">
                    {item.expand?.customer?.name ||
                      item.phone ||
                      item.email ||
                      item.category ||
                      '-'}
                  </td>
                  <td className="py-3 px-3 text-gray-500">{item.expand?.store?.name || '-'}</td>
                  <td className="py-3 px-3 font-semibold text-[#0A8F5C]">
                    {item.total
                      ? formatBRL(item.total)
                      : item.amount
                        ? formatBRL(item.amount)
                        : item.value
                          ? formatBRL(item.value)
                          : item.quantity
                            ? `${item.quantity} un`
                            : '-'}
                  </td>
                  <td className="py-3 px-3 text-gray-400">
                    {item.created
                      ? formatDateBR(item.created)
                      : item.date
                        ? formatDateBR(item.date)
                        : item.status || '-'}
                  </td>
                </tr>
              ))}
              {dataList.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

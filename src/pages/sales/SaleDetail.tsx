import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { SalesService } from '@/services/api'
import { SaleReceipt } from '@/components/SaleReceipt'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>()
  const [sale, setSale] = useState<any | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setIsLoading(true)
      try {
        const [saleData, itemsData] = await Promise.all([
          SalesService.getById(id),
          SalesService.getItems(id),
        ])
        setSale(saleData)
        setItems(itemsData)
      } catch (err) {
        console.error('Error loading sale detail:', err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A8F5C]" />
      </div>
    )
  }

  if (!sale) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-gray-500">Venda não encontrada.</p>
        <Button asChild variant="outline">
          <Link to="/vendas">Voltar para a listagem</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="no-print">
        <Button asChild variant="ghost" size="sm" className="text-gray-600">
          <Link to="/vendas">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar para Vendas
          </Link>
        </Button>
      </div>

      <SaleReceipt
        sale={sale}
        items={items}
        customer={sale.expand?.customer}
        store={sale.expand?.store}
        seller={sale.expand?.seller}
      />
    </div>
  )
}

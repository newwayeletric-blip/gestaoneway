import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { StoresService, SettingsService, ProductsService } from '@/services/api'
import type { StoreRecord, CategoryRecord } from '@/types'
import {
  Store as StoreIcon,
  ShieldCheck,
  Tag,
  Percent,
  Sliders,
  Save,
  Plus,
  Mail,
  Link2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import MailSettings from './MailSettings'
import BlingSettings from './BlingSettings'

export default function Settings() {
  const { stores, user } = useAuth()
  const isNetworkAdmin = user?.network_role === 'admin_rede'
  const [storeList, setStoreList] = useState<StoreRecord[]>(stores)
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [newCatName, setNewCatName] = useState('')

  // Limite geral de desconto (dono, 11/11/2026): vale para vendedor e gerente
  // em todos os produtos que não têm um limite próprio (Produtos → Editar).
  // Padrão 5%, como o servidor.
  const [maxDiscGeneral, setMaxDiscGeneral] = useState('5')
  const [maxInstallments, setMaxInstallments] = useState('12')

  const { toast } = useToast()

  // Volta do Bling depois de "Autorizar": /configuracoes?bling=conectado|erro.
  const [searchParams, setSearchParams] = useSearchParams()
  const blingReturn = searchParams.get('bling')
  const [tab, setTab] = useState(blingReturn ? 'bling' : 'regras')
  useEffect(() => {
    if (!blingReturn) return
    if (blingReturn === 'conectado') {
      toast({
        title: 'Bling conectado!',
        description: 'As notas fiscais já podem sair pelo Bling.',
      })
    } else {
      toast({
        title: 'O Bling não foi conectado',
        description: 'Veja o motivo na aba Bling e tente de novo.',
        variant: 'destructive',
      })
    }
    setSearchParams({}, { replace: true })
  }, [blingReturn])

  const loadData = async () => {
    try {
      const [sts, cats, settings] = await Promise.all([
        StoresService.getAll(),
        ProductsService.getCategories(),
        SettingsService.getAll(),
      ])
      setStoreList(sts)
      setCategories(cats)

      if (settings.max_discount_general) setMaxDiscGeneral(settings.max_discount_general)
      if (settings.max_installments_cartao_credito)
        setMaxInstallments(settings.max_installments_cartao_credito)
    } catch (err) {
      console.error('Error loading settings:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSaveStore = async (st: StoreRecord) => {
    try {
      await StoresService.update(st.id, {
        name: st.name,
        address: st.address,
        phone: st.phone,
        whatsapp: st.whatsapp,
        manager: st.manager,
      })
      toast({ title: 'Sucesso', description: `Dados da loja ${st.name} atualizados.` })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleSaveRules = async () => {
    try {
      const general = Number(maxDiscGeneral)
      if (maxDiscGeneral === '' || !(general >= 0 && general <= 100)) {
        toast({
          title: 'Desconto geral inválido',
          description: 'Use um número de 0 a 100.',
          variant: 'destructive',
        })
        return
      }
      await Promise.all([
        SettingsService.set('max_discount_general', String(general)),
        SettingsService.set('max_installments_cartao_credito', maxInstallments),
      ])
      toast({
        title: 'Regras salvas!',
        description: 'Limites de descontos e parcelamentos atualizados no sistema.',
      })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    try {
      await ProductsService.createCategory(newCatName.trim())
      setNewCatName('')
      toast({ title: 'Categoria adicionada!' })
      loadData()
    } catch (err: any) {
      toast({ title: 'Erro ao criar categoria', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Configurações da Loja</h2>
        <p className="text-sm text-gray-500">
          Unidades operacionais, regras de desconto por pagamento, parcelamento e categorias.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-white border border-gray-200 flex-wrap h-auto justify-start">
          <TabsTrigger
            value="regras"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <Sliders className="h-4 w-4 mr-1.5" /> Descontos & Parcelamento
          </TabsTrigger>
          <TabsTrigger
            value="lojas"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <StoreIcon className="h-4 w-4 mr-1.5" /> Unidades (Lojas)
          </TabsTrigger>
          <TabsTrigger
            value="categorias"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <Tag className="h-4 w-4 mr-1.5" /> Categorias
          </TabsTrigger>
          {isNetworkAdmin && (
            <TabsTrigger
              value="email"
              className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
            >
              <Mail className="h-4 w-4 mr-1.5" /> E-mail
            </TabsTrigger>
          )}
          <TabsTrigger
            value="bling"
            className="data-[state=active]:bg-[#0A8F5C] data-[state=active]:text-white"
          >
            <Link2 className="h-4 w-4 mr-1.5" /> Bling
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: REGRAS DE DESCONTO E PARCELAMENTO */}
        <TabsContent value="regras">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-base text-[#111111]">
                Limites Comerciais para Balcão
              </CardTitle>
              <CardDescription>
                Desconto até o limite passa direto; acima dele, a venda vai para o administrador
                aprovar, com o motivo escrito pelo vendedor ou gerente. O limite geral vale para
                todos os produtos; um produto pode ter limite próprio em Produtos → Editar.
              </CardDescription>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl py-2">
              <div className="space-y-2">
                <Label htmlFor="generalDisc" className="text-xs font-semibold text-gray-700">
                  Desconto Máximo Geral (vendedor e gerente)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="generalDisc"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={maxDiscGeneral}
                    onChange={(e) => setMaxDiscGeneral(e.target.value)}
                  />
                  <span className="text-sm font-semibold text-gray-500">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instLimit" className="text-xs font-semibold text-gray-700">
                  Limite Máximo de Parcelas (Cartão)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="instLimit"
                    type="number"
                    min="1"
                    max="24"
                    value={maxInstallments}
                    onChange={(e) => setMaxInstallments(e.target.value)}
                  />
                  <span className="text-sm font-semibold text-gray-500">vezes</span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <Button
                onClick={handleSaveRules}
                className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
              >
                <Save className="h-4 w-4 mr-2" /> Salvar Limites Comerciais
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: UNIDADES / LOJAS */}
        <TabsContent value="lojas">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {storeList.map((st, idx) => (
              <Card key={st.id} className="bg-white border-0 shadow-sm rounded-xl p-6">
                <CardHeader className="px-0 pt-0 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-[#111111]">{st.name}</CardTitle>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-gray-100 text-gray-700">
                      slug: {st.slug}
                    </span>
                  </div>
                  <CardDescription>{st.address || 'Endereço não cadastrado'}</CardDescription>
                </CardHeader>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Nome de Exibição</Label>
                    <Input
                      value={st.name}
                      onChange={(e) => {
                        const updated = [...storeList]
                        updated[idx].name = e.target.value
                        setStoreList(updated)
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Endereço Completo</Label>
                    <Input
                      value={st.address || ''}
                      onChange={(e) => {
                        const updated = [...storeList]
                        updated[idx].address = e.target.value
                        setStoreList(updated)
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Telefone Fixo</Label>
                      <Input
                        value={st.phone || ''}
                        onChange={(e) => {
                          const updated = [...storeList]
                          updated[idx].phone = e.target.value
                          setStoreList(updated)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">WhatsApp Balcão</Label>
                      <Input
                        value={st.whatsapp || ''}
                        onChange={(e) => {
                          const updated = [...storeList]
                          updated[idx].whatsapp = e.target.value
                          setStoreList(updated)
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Responsável / Gerente</Label>
                    <Input
                      value={st.manager || ''}
                      onChange={(e) => {
                        const updated = [...storeList]
                        updated[idx].manager = e.target.value
                        setStoreList(updated)
                      }}
                    />
                  </div>

                  <div className="pt-3">
                    <Button
                      size="sm"
                      onClick={() => handleSaveStore(st)}
                      className="bg-[#111111] hover:bg-black text-white"
                    >
                      <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar Loja
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: CATEGORIAS */}
        <TabsContent value="categorias">
          <Card className="bg-white border-0 shadow-sm rounded-xl p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-base text-[#111111]">Categorias de Produtos</CardTitle>
              <CardDescription>
                Categorias utilizadas no catálogo de produtos da organização.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleAddCategory} className="flex gap-3 max-w-md mb-6">
              <Input
                placeholder="Nome da nova categoria..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
              />
              <Button type="submit" className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white shrink-0">
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </form>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-between"
                >
                  <span className="font-semibold text-xs text-gray-800">{c.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* TAB 4: E-MAIL DE ENVIO (só o admin da rede) */}
        {isNetworkAdmin && (
          <TabsContent value="email">
            <MailSettings />
          </TabsContent>
        )}

        {/* TAB 5: CONEXÃO COM O BLING (NF-e) */}
        <TabsContent value="bling">
          <BlingSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}

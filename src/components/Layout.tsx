import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { StockService } from '@/services/api'
import useRealtime from '@/hooks/use-realtime'
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Layers,
  DollarSign,
  Percent,
  FileSpreadsheet,
  Settings,
  PlusCircle,
  AlertTriangle,
  LogOut,
  Menu,
  X,
  Store as StoreIcon,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Layout() {
  const {
    user,
    profile,
    isAdmin,
    isSeller,
    logout,
    stores,
    activeStoreId,
    setActiveStoreId,
    authorizedStores,
  } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [lowStockCount, setLowStockCount] = useState<number>(0)
  const location = useLocation()
  const navigate = useNavigate()

  const loadLowStock = async () => {
    if (!isAdmin) return
    try {
      const count = await StockService.getLowStockCount()
      setLowStockCount(count)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadLowStock()
  }, [isAdmin, activeStoreId])

  // Realtime update when stock items change
  useRealtime('stock_items', () => {
    loadLowStock()
  })

  // Admin menu exact items:
  // Dashboard; Vendas; Clientes; Produtos; Estoque e transferências; Financeiro; Comissões; Relatórios; Usuários e configurações.
  const adminMenuItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Vendas', path: '/vendas', icon: ShoppingCart },
    { label: 'Clientes', path: '/clientes', icon: Users },
    { label: 'Produtos', path: '/produtos', icon: Package },
    { label: 'Estoque e transferências', path: '/estoque', icon: Layers },
    { label: 'Financeiro', path: '/financeiro', icon: DollarSign },
    { label: 'Comissões', path: '/comissoes', icon: Percent },
    { label: 'Relatórios', path: '/relatorios', icon: FileSpreadsheet },
    { label: 'Usuários e configurações', path: '/usuarios', icon: Settings },
  ]

  // Seller menu exact items:
  // Meu painel; Nova venda; Minhas vendas; Clientes; Consulta de produtos e estoque; Minhas comissões.
  const sellerMenuItems = [
    { label: 'Meu painel', path: '/meu-painel', icon: LayoutDashboard },
    { label: 'Nova venda', path: '/vendas/nova', icon: PlusCircle },
    { label: 'Minhas vendas', path: '/minhas-vendas', icon: ShoppingCart },
    { label: 'Clientes', path: '/clientes', icon: Users },
    { label: 'Consulta de produtos e estoque', path: '/produtos', icon: Package },
    { label: 'Minhas comissões', path: '/minhas-comissoes', icon: Percent },
  ]

  const menuItems = isAdmin ? adminMenuItems : sellerMenuItems

  // Active Store object
  const activeStore = stores.find((s) => s.id === activeStoreId) || stores[0]

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const getPageTitle = () => {
    const path = location.pathname
    if (path.startsWith('/vendas/nova')) return 'Nova Venda (Balcão)'
    if (path.startsWith('/vendas/')) return 'Detalhes da Venda'
    if (path === '/vendas') return 'Gestão de Vendas'
    if (path === '/minhas-vendas') return 'Minhas Vendas'
    if (path.startsWith('/clientes/')) return 'Ficha do Cliente'
    if (path === '/clientes') return 'Clientes & Atendimento'
    if (path.startsWith('/produtos/')) return 'Detalhes do Produto'
    if (path === '/produtos')
      return isAdmin ? 'Catálogo de Produtos' : 'Consulta de Produtos & Estoque'
    if (path === '/estoque/transferencias') return 'Transferências entre Lojas'
    if (path === '/estoque') return 'Estoque & Saldos por Loja'
    if (path === '/financeiro') return 'Financeiro Gerencial'
    if (path === '/comissoes' || path === '/minhas-comissoes')
      return isAdmin ? 'Gestão de Comissões' : 'Minhas Comissões'
    if (path === '/relatorios') return 'Relatórios Gerenciais'
    if (path === '/usuarios') return 'Colaboradores & Usuários'
    if (path === '/configuracoes') return 'Configurações do Sistema'
    if (path === '/dashboard') return 'Dashboard Geral'
    if (path === '/meu-painel') return 'Meu Painel de Vendas'
    return 'New Way Eletric'
  }

  return (
    <div className="flex min-h-screen bg-[#F7F8FA] text-[#1A1F2B]">
      {/* DESKTOP & TABLET SIDEBAR */}
      <aside className="hidden md:flex md:w-64 md:flex-col fixed inset-y-0 z-40 bg-[#111111] text-white">
        {/* LOGO AREA */}
        <div className="flex h-16 items-center px-6 gap-3 border-b border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A8F5C] text-white shadow-md shadow-[#0A8F5C]/20">
            <Zap className="h-6 w-6 fill-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-wide text-white">NEW WAY ELETRIC</span>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Gestão Interna
            </span>
          </div>
        </div>

        {/* PROFILE BADGE */}
        <div className="px-6 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Perfil de Acesso:</span>
            <Badge
              className={
                isAdmin
                  ? 'bg-[#0A8F5C] text-white text-[10px] px-2 py-0.5'
                  : 'bg-blue-600 text-white text-[10px] px-2 py-0.5'
              }
            >
              {isAdmin ? 'ADMINISTRADOR' : 'VENDEDOR'}
            </Badge>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path + '/'))
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive: active }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active || isActive
                      ? 'bg-[#0A8F5C] text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* FOOTER USER / LOGOUT */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="flex flex-col truncate">
              <span className="text-xs font-semibold text-white truncate">
                {user?.name || user?.email}
              </span>
              <span className="text-[11px] text-gray-400 truncate">{user?.email}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sair do sistema"
              className="text-gray-400 hover:text-white hover:bg-white/10 h-8 w-8"
            >
              <LogOut className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex w-4/5 max-w-xs flex-1 flex-col bg-[#111111] text-white z-50 shadow-2xl">
            <div className="flex h-16 items-center justify-between px-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0A8F5C] text-white">
                  <Zap className="h-5 w-5 fill-white" />
                </div>
                <span className="font-bold text-sm text-white">NEW WAY ELETRIC</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path + '/'))
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-[#0A8F5C] text-white' : 'text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <div className="truncate text-xs text-gray-300">
                <p className="font-medium text-white">{user?.name}</p>
                <p className="text-[10px] text-gray-400">{user?.email}</p>
              </div>
              <Button size="sm" variant="destructive" onClick={logout} className="h-8">
                <LogOut className="h-3.5 w-3.5 mr-1" /> Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="flex flex-1 flex-col md:pl-64">
        {/* TOP HEADER */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 shadow-sm">
          {/* LEFT: MOBILE TOGGLE + TITLE */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Abrir menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[#111111] leading-tight">
                {getPageTitle()}
              </h1>
            </div>
          </div>

          {/* RIGHT: STORE SELECTOR + LOW STOCK ALERT + USER MENU */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* STORE SELECTOR */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 border-gray-300 bg-gray-50 hover:bg-gray-100 text-xs sm:text-sm font-medium text-[#111111]"
                >
                  <StoreIcon className="h-4 w-4 text-[#0A8F5C]" />
                  <span className="hidden sm:inline font-semibold">
                    {activeStore?.name || 'Selecione a Loja'}
                  </span>
                  <span className="sm:hidden font-semibold">
                    {activeStore?.name?.includes('Jockey') ? 'Jockey' : 'Cajuru'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white shadow-lg border-gray-200">
                <DropdownMenuLabel className="text-xs text-gray-500">
                  Unidade Operacional
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {authorizedStores.map((st) => (
                  <DropdownMenuItem
                    key={st.id}
                    onClick={() => setActiveStoreId(st.id)}
                    className={`flex flex-col items-start cursor-pointer py-2 ${
                      st.id === activeStoreId ? 'bg-emerald-50 text-[#0A8F5C] font-semibold' : ''
                    }`}
                  >
                    <span>{st.name}</span>
                    <span className="text-[10px] text-gray-500 font-normal truncate max-w-full">
                      {st.slug === 'jockey-plaza'
                        ? 'Shopping Jockey Plaza - Piso L2'
                        : 'Cajuru - Oficina Home Lithium'}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* LOW STOCK BADGE (ADMIN) */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/estoque')}
                title="Estoque baixo"
                className={`relative px-2.5 py-1.5 h-9 rounded-lg flex items-center gap-1.5 transition-colors ${
                  lowStockCount > 0
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <AlertTriangle
                  className={`h-4 w-4 ${lowStockCount > 0 ? 'text-amber-600 animate-pulse' : ''}`}
                />
                <span className="text-xs font-semibold">{lowStockCount}</span>
                <span className="hidden lg:inline text-xs">baixo</span>
              </Button>
            )}

            {/* USER AVATAR / PROFILE BUTTON */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 pl-2 pr-1 h-9 rounded-full hover:bg-gray-100"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#111111] text-xs font-bold text-white uppercase">
                    {user?.name ? user.name.slice(0, 2) : 'NW'}
                  </div>
                  <span className="hidden md:inline text-xs font-medium text-gray-700 max-w-[120px] truncate">
                    {user?.name || 'Colaborador'}
                  </span>
                  <ChevronDown className="h-3 w-3 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white shadow-lg border-gray-200">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none text-[#111111]">
                      {user?.name}
                    </p>
                    <p className="text-xs leading-none text-gray-500">{user?.email}</p>
                    <div className="pt-1">
                      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-100 font-medium text-gray-800">
                        {isAdmin ? 'Administrador' : 'Vendedor Autorizado'}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate('/configuracoes')}
                    className="cursor-pointer text-xs"
                  >
                    Configurações da Loja
                  </DropdownMenuItem>
                )}
                {isSeller && (
                  <DropdownMenuItem
                    onClick={() => navigate('/minhas-comissoes')}
                    className="cursor-pointer text-xs"
                  >
                    Minhas Comissões
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-xs text-red-600 focus:text-red-600"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sair do sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* CONTENT AREA */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* FOOTER */}
        <footer className="border-t border-gray-200 bg-white py-3 px-6 text-center text-xs text-gray-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>New Way Eletric © {new Date().getFullYear()} — Sistema Interno de Gestão</span>
          <span className="text-[11px] text-gray-400">
            Unidade ativa: <strong className="text-gray-600">{activeStore?.name}</strong> • Horário
            de Brasília (BRT)
          </span>
        </footer>
      </div>
    </div>
  )
}

import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

// Public auth screens
import Setup from '@/pages/auth/Setup'
import Login from '@/pages/auth/Login'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'
import VerifyEmail from '@/pages/auth/VerifyEmail'
import Forbidden from '@/pages/Forbidden'
import NotFound from '@/pages/NotFound'

// Admin screens
import { AdminDashboard } from '@/pages/admin/Dashboard'
import { Financial } from '@/pages/admin/Financial'
import { Commissions } from '@/pages/admin/Commissions'
import Reports from '@/pages/admin/Reports'
import UsersList from '@/pages/admin/UsersList'
import Settings from '@/pages/admin/Settings'
import { AuditLogs } from '@/pages/admin/AuditLogs'

// Seller screens
import SellerDashboard from '@/pages/seller/SellerDashboard'
import MyCommissions from '@/pages/seller/MyCommissions'

// Sales
import { NewSale } from '@/pages/sales/NewSale'
import SalesList from '@/pages/sales/SalesList'
import { SaleDetail } from '@/pages/sales/SaleDetail'

// Shared modules
import Products from '@/pages/products/Products'
import Stock from '@/pages/stock/Stock'
import CustomersList from '@/pages/customers/CustomersList'
import CustomerDetail from '@/pages/customers/CustomerDetail'

const queryClient = new QueryClient()

// Helper to redirect root `/` to appropriate home
function RootRedirect() {
  const { user, profile } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (profile === 'admin') return <Navigate to="/dashboard" replace />
  return <Navigate to="/meu-painel" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              {/* PUBLIC ROUTES */}
              <Route path="/setup" element={<Setup />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />

              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
              </Route>

              {/* AUTHENTICATED ROUTES */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  {/* ROOT */}
                  <Route path="/" element={<RootRedirect />} />

                  {/* ADMIN ONLY ROUTES */}
                  <Route element={<ProtectedRoute requiredProfile="admin" />}>
                    <Route path="/dashboard" element={<AdminDashboard />} />
                    <Route path="/financeiro" element={<Financial />} />
                    <Route path="/comissoes" element={<Commissions />} />
                    <Route path="/relatorios" element={<Reports />} />
                    <Route path="/auditoria" element={<AuditLogs />} />
                    <Route path="/usuarios" element={<UsersList />} />
                    <Route path="/configuracoes" element={<Settings />} />
                    <Route path="/vendas" element={<SalesList mySalesOnly={false} />} />
                    <Route path="/estoque/transferencias" element={<Stock />} />
                  </Route>

                  {/* SELLER ONLY ROUTES */}
                  <Route element={<ProtectedRoute requiredProfile="vendedor" />}>
                    <Route path="/meu-painel" element={<SellerDashboard />} />
                    <Route path="/minhas-vendas" element={<SalesList mySalesOnly={true} />} />
                    <Route path="/minhas-comissoes" element={<MyCommissions />} />
                  </Route>

                  {/* COMMON ACCESSIBLE ROUTES (with internal role checks) */}
                  <Route path="/vendas/nova" element={<NewSale />} />
                  <Route path="/vendas/:id" element={<SaleDetail />} />
                  <Route path="/produtos" element={<Products />} />
                  <Route path="/produtos/:id" element={<Products />} />
                  <Route path="/estoque" element={<Stock />} />
                  <Route path="/clientes" element={<CustomersList />} />
                  <Route path="/clientes/:id" element={<CustomerDetail />} />
                </Route>
              </Route>

              {/* 403 & 404 */}
              <Route path="/403" element={<Forbidden />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

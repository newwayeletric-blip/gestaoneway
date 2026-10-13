import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import Forbidden from '@/pages/Forbidden'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  requiredProfile?: 'admin' | 'vendedor'
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredProfile }) => {
  const { user, profile, isLoading, hasAnyAdmin } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F7F8FA]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A8F5C]" />
          <p className="text-sm font-medium text-gray-600">Carregando sistema New Way Eletric...</p>
        </div>
      </div>
    )
  }

  // If there are no admins in database yet, redirect to setup
  if (hasAnyAdmin === false && !user) {
    return <Navigate to="/setup" replace />
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // User inactive
  if (user.status === 'inativo') {
    return <Navigate to="/login?inativo=1" replace />
  }

  // Profile check
  if (requiredProfile && profile !== requiredProfile) {
    // If route requires admin and user is vendedor -> 403 Forbidden
    return <Forbidden />
  }

  return <Outlet />
}

export const PublicOnlyRoute: React.FC = () => {
  const { user, profile, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  if (user) {
    if (profile === 'admin') {
      return <Navigate to="/dashboard" replace />
    }
    return <Navigate to="/meu-painel" replace />
  }

  return <Outlet />
}

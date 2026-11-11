import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import type { UserRecord, StoreRecord, OrganizationRecord } from '@/types'
import { StoresService } from '@/services/api'

interface AuthContextType {
  user: UserRecord | null
  profile: 'admin' | 'vendedor' | null
  isAdmin: boolean
  isSeller: boolean
  isLoading: boolean
  stores: StoreRecord[]
  activeStoreId: string
  setActiveStoreId: (storeId: string) => void
  authorizedStores: StoreRecord[]
  logout: () => void
  refreshUser: () => Promise<void>
  hasAnyAdmin: boolean | null
  checkHasAnyAdmin: () => Promise<boolean>
  organization: OrganizationRecord | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserRecord | null>(
    pb.authStore.record as unknown as UserRecord | null,
  )
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [activeStoreId, setActiveStoreIdState] = useState<string>(() => {
    return localStorage.getItem('nwe_active_store_id') || ''
  })
  const [hasAnyAdmin, setHasAnyAdmin] = useState<boolean | null>(null)
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null)

  // Organização do usuário (franquia ou lojas próprias), mostrada no topo (ESC-03).
  useEffect(() => {
    if (!user?.org) {
      setOrganization(null)
      return
    }
    pb.collection('organizations')
      .getOne<OrganizationRecord>(user.org)
      .then(setOrganization)
      .catch(() => setOrganization(null))
  }, [user?.org])

  const checkHasAnyAdmin = async (): Promise<boolean> => {
    // Visitantes não listam usuários; o servidor diz se a instalação inicial
    // ainda está aberta (USR-01). Na dúvida, trata como já instalado.
    try {
      const res = await pb.send<{ available: boolean }>('/backend/v1/setup/status', {
        method: 'GET',
      })
      const exists = !res.available
      setHasAnyAdmin(exists)
      return exists
    } catch {
      setHasAnyAdmin(true)
      return true
    }
  }

  const loadStores = async () => {
    try {
      const list = await StoresService.getAll()
      setStores(list)
      // Loja ativa vazia ou fora das lojas autorizadas (mesma regra de
      // authorizedStores): começa pela primeira autorizada. O registro vem do
      // authStore porque o estado "user" ainda é o da montagem aqui.
      const record = pb.authStore.record
      const mine: string[] = record?.profile === 'admin' ? [] : record?.stores || []
      const allowed = mine.length > 0 ? list.filter((s) => mine.includes(s.id)) : list
      if (allowed.length > 0 && !allowed.some((s) => s.id === activeStoreId)) {
        setActiveStoreIdState(allowed[0].id)
        localStorage.setItem('nwe_active_store_id', allowed[0].id)
      }
    } catch {
      // ignore
    }
  }

  const refreshUser = async () => {
    if (!pb.authStore.isValid || !pb.authStore.record) {
      setUser(null)
      return
    }
    try {
      const refreshed = await pb.collection('users').getOne(pb.authStore.record.id)
      if (refreshed.status === 'inativo') {
        pb.authStore.clear()
        setUser(null)
        return
      }
      setUser(refreshed as unknown as UserRecord)
    } catch {
      // if 404 or auth failed
      pb.authStore.clear()
      setUser(null)
    }
  }

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await checkHasAnyAdmin()
      if (pb.authStore.isValid && pb.authStore.record) {
        await refreshUser()
        await loadStores()
      }
      setIsLoading(false)
    }

    init()

    const unsubscribe = pb.authStore.onChange(async (_token, model) => {
      if (!model) {
        setUser(null)
      } else {
        const u = model as unknown as UserRecord
        if (u.status === 'inativo') {
          pb.authStore.clear()
          setUser(null)
          return
        }
        setUser(u)
        await loadStores()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const setActiveStoreId = (id: string) => {
    setActiveStoreIdState(id)
    localStorage.setItem('nwe_active_store_id', id)
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    window.location.href = '/login'
  }

  const profile = user?.profile || null
  const isAdmin = profile === 'admin'
  const isSeller = profile === 'vendedor'

  const authorizedStores = useMemo(() => {
    if (isAdmin) return stores
    if (!user || !user.stores || user.stores.length === 0) return stores // or just first store
    return stores.filter((s) => user.stores?.includes(s.id))
  }, [isAdmin, stores, user])

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isSeller,
        isLoading,
        stores,
        activeStoreId,
        setActiveStoreId,
        authorizedStores,
        logout,
        refreshUser,
        hasAnyAdmin,
        checkHasAnyAdmin,
        organization,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

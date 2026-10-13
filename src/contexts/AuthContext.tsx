import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import type { UserRecord, StoreRecord } from '@/types'
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

  const checkHasAnyAdmin = async (): Promise<boolean> => {
    try {
      const admins = await pb.collection('users').getList(1, 1, {
        filter: "profile = 'admin' && status != 'inativo'",
      })
      const exists = admins.totalItems > 0
      setHasAnyAdmin(exists)
      return exists
    } catch {
      // If error (or 403 because unauthenticated), try list without filter or count
      try {
        const anyUser = await pb.collection('users').getList(1, 1)
        const exists = anyUser.totalItems > 0
        setHasAnyAdmin(exists)
        return exists
      } catch {
        setHasAnyAdmin(false)
        return false
      }
    }
  }

  const loadStores = async () => {
    try {
      const list = await StoresService.getAll()
      setStores(list)
      // Auto-select store if activeStoreId is empty or invalid
      if (list.length > 0) {
        if (!activeStoreId || !list.some((s) => s.id === activeStoreId)) {
          setActiveStoreIdState(list[0].id)
          localStorage.setItem('nwe_active_store_id', list[0].id)
        }
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

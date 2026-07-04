import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { permissionImplies, routeRequiredPermission } from '../lib/accessControl'
import { supabase } from '../lib/supabaseClient'

type ProtectedRouteProps = {
  children: ReactNode
}

type ProfileSession = {
  id: string
  email: string | null
  display_name: string | null
  status: string
  must_change_password: boolean
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileSession | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [failureReason, setFailureReason] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function checkSession() {
      setLoading(true)
      setFailureReason(null)
      localStorage.removeItem('aekia_mock_auth')

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      if (!isMounted) {
        return
      }

      if (sessionError) {
        setFailureReason(`Error leyendo sesión: ${sessionError.message}`)
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      if (!user) {
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, email, display_name, status, must_change_password')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (profileError) {
        setFailureReason(`Error leyendo user_profiles: ${profileError.message}`)
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      if (!data) {
        setFailureReason(
          `Hay sesión de Supabase, pero no existe perfil en user_profiles para este usuario: ${user.email}`,
        )
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      if (data.status !== 'active') {
        setFailureReason('Correo existente pero estatus inactivo, por favor contacta a un administrador para reactivarlo.')
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      const { data: permissionData, error: permissionError } = await supabase.rpc(
        'aekia_current_permission_codes',
      )

      if (!isMounted) {
        return
      }

      if (permissionError) {
        setFailureReason(`No se pudieron leer permisos: ${permissionError.message}`)
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }

      const ownPermissions = Array.isArray(permissionData)
        ? permissionData.filter((item): item is string => typeof item === 'string')
        : []

      let nextPermissions = ownPermissions
      const impersonatedProfileId = localStorage.getItem('aekia_visualizar_com_profile_id')

      if (impersonatedProfileId) {
        const { data: selectedPermissions, error: selectedPermissionError } = await supabase.rpc(
          'aekia_permission_codes_for_profile',
          { p_profile_id: impersonatedProfileId },
        )

        if (!selectedPermissionError && Array.isArray(selectedPermissions)) {
          nextPermissions = selectedPermissions.filter((item): item is string => typeof item === 'string')
        } else {
          localStorage.removeItem('aekia_visualizar_com_profile_id')
          localStorage.removeItem('aekia_visualizar_com_label')
        }
      }

      setProfile(data as ProfileSession)
      setPermissions(nextPermissions)
      setLoading(false)
    }

    checkSession()

    return () => {
      isMounted = false
    }
  }, [location.pathname])


  useEffect(() => {
    if (!profile) return

    const timeoutMs = 3 * 60 * 1000
    let timeoutId = window.setTimeout(handleInactiveSession, timeoutMs)

    function resetTimer() {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(handleInactiveSession, timeoutMs)
    }

    async function handleInactiveSession() {
      await supabase.auth.signOut()
      navigate('/login', { replace: true, state: { message: 'Sesión cerrada por inactividad.' } })
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }))

    return () => {
      window.clearTimeout(timeoutId)
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer))
    }
  }, [profile, navigate])

  async function handleBackToLogin() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-slate-300">Validando sesión...</p>
        </div>
      </main>
    )
  }

  if (failureReason) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-red-400/30 bg-red-400/10 p-6 shadow-2xl">
          <p className="text-sm font-bold text-red-200">
            No se pudo abrir el módulo
          </p>

          <p className="mt-3 text-sm leading-6 text-red-100">
            {failureReason}
          </p>

          <button
            type="button"
            onClick={handleBackToLogin}
            className="mt-5 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition active:scale-[0.98]"
          >
            Volver al login
          </button>
        </div>
      </main>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  if (profile.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  const requiredPermission = routeRequiredPermission(location.pathname)

  if (requiredPermission && !permissionImplies(permissions, requiredPermission)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-amber-400/30 bg-amber-400/10 p-6 shadow-2xl">
          <p className="text-sm font-bold text-amber-200">
            Módulo no disponible para tu usuario
          </p>

          <p className="mt-3 text-sm leading-6 text-amber-100">
            Tu cuenta está activa, pero no tiene el permiso necesario para abrir esta sección.
          </p>

          <button
            type="button"
            onClick={() => navigate('/menu', { replace: true })}
            className="mt-5 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition active:scale-[0.98]"
          >
            Volver al menú
          </button>
        </div>
      </main>
    )
  }

  return <>{children}</>
}

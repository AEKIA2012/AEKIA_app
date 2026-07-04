import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AppLogo from '../components/AppLogo'
import PasswordInput from '../components/PasswordInput'
import { supabase } from '../lib/supabaseClient'
import { logAuditEvent } from '../lib/audit'

const PAGE_VERSION = 'Login v05 roles'

type LoginEmailStatus = 'registered' | 'not_registered' | 'inactive'

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const reason = searchParams.get('reason')

    if (reason === 'password_changed') {
      setInfoMessage('Password actualizado correctamente. Ya puedes entrar con tu nuevo password.')
    }
  }, [searchParams])

  async function getEmailStatus(normalizedEmail: string): Promise<LoginEmailStatus> {
    const { data, error } = await supabase.rpc('aekia_login_email_status', {
      input_email: normalizedEmail,
    })

    if (error) {
      throw error
    }

    if (data === 'inactive') {
      return 'inactive'
    }

    if (data === 'not_registered') {
      return 'not_registered'
    }

    return 'registered'
  }

  async function handleLogin() {
    const normalizedEmail = normalizeEmail(email)

    setLoading(true)
    setInfoMessage(null)
    setErrorMessage(null)
    localStorage.removeItem('aekia_mock_auth')

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setErrorMessage('Captura un correo válido.')
      setLoading(false)
      return
    }

    if (!password) {
      setErrorMessage('Captura tu password.')
      setLoading(false)
      return
    }

    try {
      const emailStatus = await getEmailStatus(normalizedEmail)

      if (emailStatus === 'not_registered') {
        setErrorMessage(
          'Correo no registrado, verifica que con ese fuiste dado de alta con algún administrador o bien regístrate.',
        )
        setLoading(false)
        return
      }

      if (emailStatus === 'inactive') {
        setErrorMessage(
          'Correo existente pero estatus inactivo, por favor contacta a un administrador para reactivarlo.',
        )
        setLoading(false)
        return
      }
    } catch (statusError) {
      console.error(statusError)
      setErrorMessage('No se pudo validar el correo. Revisa la conexión o contacta a un administrador.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (error) {
      setErrorMessage('Password incorrecto.')
      setLoading(false)
      return
    }

    if (!data.user || !data.session) {
      setErrorMessage('No se pudo iniciar sesión correctamente. Contacta a un administrador.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, status, must_change_password')
      .eq('auth_user_id', data.user.id)
      .maybeSingle()

    if (profileError) {
      await supabase.auth.signOut()
      setErrorMessage('No se pudo leer el perfil del usuario.')
      setLoading(false)
      return
    }

    if (!profile) {
      await supabase.auth.signOut()
      setErrorMessage('Tu usuario no tiene perfil activo en AEKIA.')
      setLoading(false)
      return
    }

    if (profile.status !== 'active') {
      await supabase.auth.signOut()
      setErrorMessage('Correo existente pero estatus inactivo, por favor contacta a un administrador para reactivarlo.')
      setLoading(false)
      return
    }

    await logAuditEvent('Login', 'inicio_sesion', { email: normalizedEmail })

    setLoading(false)

    if (profile.must_change_password) {
      navigate('/change-password', { replace: true })
      return
    }

    navigate('/menu', { replace: true })
  }

  async function handleForgotPassword() {
    const normalizedEmail = normalizeEmail(email)

    setInfoMessage(null)
    setErrorMessage(null)

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setErrorMessage('Captura tu correo para solicitar reinicio de password.')
      return
    }

    setInfoMessage('Se notificó a un administrador para reiniciar tu password.')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-6 py-8">
        <div>
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <AppLogo size="lg" />
            </div>

            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
              AEKIA
            </p>

            <h1 className="mt-3 text-3xl font-bold">Kendo App</h1>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Gestión de miembros, asistencia, pagos, eventos y comunicación de
              la Asociación.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Correo electrónico
            </label>

            <input
              className="mb-4 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />

            <div className="mb-5">
              <PasswordInput
                label="Password"
                value={password}
                placeholder="••••••••"
                autoComplete="current-password"
                onChange={setPassword}
                onEnter={handleLogin}
              />
            </div>

            {infoMessage && (
              <div className="mb-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm leading-5 text-cyan-100">
                {infoMessage}
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-5 text-red-100">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <button
              type="button"
              className="mt-4 w-full text-sm font-medium text-cyan-300"
              onClick={handleForgotPassword}
            >
              Forgot password
            </button>

            <Link
              to="/register"
              className="mt-3 block w-full rounded-2xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-slate-200 transition active:scale-[0.98]"
            >
              Registrarse
            </Link>

            <p className="mt-4 text-center text-[11px] text-slate-600">
              {PAGE_VERSION}
            </p>
          </div>
        </div>

        <p className="pt-8 text-center text-xs text-slate-500">
          Asociación Estatal de Kendō e Iaido de Aguascalientes
        </p>
      </section>
    </main>
  )
}

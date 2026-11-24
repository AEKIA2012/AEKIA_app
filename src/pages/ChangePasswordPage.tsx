import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppLogo from '../components/AppLogo'
import PasswordInput from '../components/PasswordInput'
import { supabase } from '../lib/supabaseClient'

const PAGE_VERSION = 'Cambio password v05 roles'
const TEMPORARY_PASSWORD = '12345678'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isRecovery = searchParams.get('recovery') === '1'

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleChangePassword() {
    setLoading(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    const cleanedNewPassword = newPassword.trim()
    const cleanedConfirmPassword = confirmPassword.trim()

    if (cleanedNewPassword.length < 8) {
      setErrorMessage('El nuevo password debe tener al menos 8 caracteres.')
      setLoading(false)
      return
    }

    if (cleanedNewPassword === TEMPORARY_PASSWORD) {
      setErrorMessage('No puedes conservar el password temporal.')
      setLoading(false)
      return
    }

    if (cleanedNewPassword !== cleanedConfirmPassword) {
      setErrorMessage('Los passwords no coinciden.')
      setLoading(false)
      return
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (sessionError || !user) {
      setErrorMessage('Tu sesión expiró. Vuelve a iniciar sesión.')
      setLoading(false)
      await supabase.auth.signOut()
      navigate('/login')
      return
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: cleanedNewPassword,
    })

    if (passwordError) {
      setErrorMessage(`No se pudo actualizar el password: ${passwordError.message}`)
      setLoading(false)
      return
    }

    const { error: profileRpcError } = isRecovery
      ? {error:null}
      : await supabase.rpc('aekia_mark_password_changed')

    if (profileRpcError) {
      setErrorMessage(
        `El password cambió, pero no se pudo quitar la marca de cambio obligatorio: ${profileRpcError.message}`,
      )
      setLoading(false)
      return
    }

    setSuccessMessage('Password actualizado correctamente. Entrando al menú...')
    setLoading(false)

    setTimeout(() => {
      navigate('/menu', { replace: true })
    }, 600)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <AppLogo size="lg" />
          </div>

          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">
            AEKIA
          </p>

          <h1 className="mt-3 text-3xl font-bold">Cambiar password</h1>

          <p className="mt-3 text-sm leading-6 text-slate-300">{isRecovery ? 'Establece tu nueva contraseña.' : 'Cambia tu contraseña temporal para continuar.'}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="space-y-4">
            <PasswordInput
              label="Nuevo password"
              value={newPassword}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              onChange={setNewPassword}
            />

            <PasswordInput
              label="Confirmar password"
              value={confirmPassword}
              placeholder="Repite tu nuevo password"
              autoComplete="new-password"
              onChange={setConfirmPassword}
              onEnter={handleChangePassword}
            />
          </div>

          {successMessage && (
            <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm leading-5 text-cyan-100">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-5 text-red-100">
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleChangePassword}
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Actualizando...' : 'Guardar password'}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="mt-3 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Salir
          </button>

          <p className="mt-4 text-center text-[11px] text-slate-600">
            {PAGE_VERSION}
          </p>
        </div>
      </section>
    </main>
  )
}

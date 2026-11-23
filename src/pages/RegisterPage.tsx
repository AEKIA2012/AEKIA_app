import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AppLogo from '../components/AppLogo'
import { supabase } from '../lib/supabaseClient'
import { isValidCurp } from '../lib/helpers'

type RegistrationForm = {
  first_names: string; paternal_last_name: string; maternal_last_name: string
  work_school_name: string; curp: string; email: string
}

const emptyForm: RegistrationForm = {
  first_names: '', paternal_last_name: '', maternal_last_name: '',
  work_school_name: '', curp: '', email: '',
}

const fields: Array<{key: keyof RegistrationForm; label: string; type?: string}> = [
  { key: 'first_names', label: 'Nombre(s)' },
  { key: 'paternal_last_name', label: 'Apellido paterno' },
  { key: 'maternal_last_name', label: 'Apellido materno' },
  { key: 'work_school_name', label: 'Trabajo o escuela' },
  { key: 'curp', label: 'CURP' },
  { key: 'email', label: 'Correo electrónico', type: 'email' },
]

export default function RegisterPage() {
  const [form, setForm] = useState<RegistrationForm>(emptyForm)
  const [activationEmail, setActivationEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showActivation, setShowActivation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function requestRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    const cleaned = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as RegistrationForm
    cleaned.curp = cleaned.curp.toUpperCase().replace(/\s/g, '')
    cleaned.email = cleaned.email.toLowerCase()
    if (Object.values(cleaned).some((v) => !v)) { setError('Completa todos los campos.'); return }
    if (!isValidCurp(cleaned.curp)) { setError('Revisa la CURP.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) { setError('Revisa el correo.'); return }
    setBusy(true)
    const { error: submitError } = await supabase.rpc('aekia_submit_registration_request', {
      p_first_names: cleaned.first_names,
      p_paternal_last_name: cleaned.paternal_last_name,
      p_maternal_last_name: cleaned.maternal_last_name,
      p_work_school_name: cleaned.work_school_name,
      p_curp: cleaned.curp,
      p_email: cleaned.email,
    })
    setBusy(false)
    if (submitError) { setError(submitError.message); return }
    setForm(emptyForm)
    setMessage('Solicitud enviada. Espera la aprobación de AEKIA.')
  }

  async function activateAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    setBusy(true)
    const cleanEmail = activationEmail.trim().toLowerCase()
    const {data:ready,error:readyError} = await supabase.rpc('aekia_registration_activation_ready',{p_email:cleanEmail})
    if (readyError || !ready) {setBusy(false);setError('Tu solicitud aún no está aprobada para activar acceso.');return}
    const { error: signupError } = await supabase.auth.signUp({
      email: cleanEmail, password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    setBusy(false)
    setPassword(''); setConfirmPassword('')
    if (signupError) { setError(signupError.message); return }
    setMessage('Revisa tu correo para confirmar el acceso. Si aún no te aprueban, contacta a AEKIA.')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-6 py-8">
        <div className="flex items-center justify-between"><Link to="/login" className="text-sm font-semibold text-cyan-300">← Regresar</Link><AppLogo size="sm" /></div>
        <h1 className="mt-8 text-3xl font-bold">{showActivation ? 'Activar acceso' : 'Solicitar registro'}</h1>
        {message && <p role="status" className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mt-5 rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        {!showActivation ? (
          <form onSubmit={requestRegistration} className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
            {fields.map(({key,label,type}) => <label key={key} className="block text-sm font-medium text-slate-200">{label}
              <input required type={type ?? 'text'} value={form[key]} onChange={(event) => setForm((prev) => ({...prev,[key]: key === 'curp' ? event.target.value.toUpperCase() : event.target.value}))} maxLength={key === 'curp' ? 18 : 180} autoComplete={key === 'email' ? 'email' : 'off'} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300" />
            </label>)}
            <button disabled={busy} type="submit" className="mt-2 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Enviando...' : 'Enviar solicitud'}</button>
          </form>
        ) : (
          <form onSubmit={activateAccess} className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
            <label className="block text-sm">Correo aprobado<input required type="email" autoComplete="email" value={activationEmail} onChange={(event) => setActivationEmail(event.target.value)} className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-white" /></label>
            <label className="block text-sm">Nueva contraseña<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-white" /></label>
            <label className="block text-sm">Confirmar contraseña<input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-white" /></label>
            <button disabled={busy} type="submit" className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Preparando acceso...' : 'Activar cuenta'}</button>
          </form>
        )}
        <button type="button" onClick={() => {setShowActivation((v) => !v);setError('');setMessage('')}} className="mt-6 w-full text-center text-sm font-semibold text-cyan-300">{showActivation ? 'Volver a solicitar registro' : '¿Ya aprobaron tu registro? Activar acceso'}</button>
      </section>
    </main>
  )
}

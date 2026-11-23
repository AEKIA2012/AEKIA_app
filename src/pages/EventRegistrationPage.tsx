import { useEffect, useState } from 'react'
import ModuleShell from '../components/ModuleShell'
import { PrimaryButton, StatusBadge } from '../components/FormControls'
import { supabase } from '../lib/supabaseClient'
import { loadMemberEligibility } from '../lib/eligibility'
import { formatDate, money } from '../lib/helpers'
import { useCurrentProfile } from '../lib/useCurrentProfile'

type EventRow = { id: string; title: string; event_date: string | null; has_cost: boolean; total_cost: number | null; status: string }
type RegistrationRow = { id: string; event_id: string; registration_status: string }
type Eligibility = { eligible: boolean; attendance_ok: boolean; payments_ok: boolean; attendance_percent: number; evaluation_state: 'not_started' | 'no_classes' | 'evaluated'; payment_debt_count: number; completed_weeks: number; total_class_weeks: number; required_attendances?: number; punctual_attendances?: number }

export default function EventRegistrationPage() {
  const { profile, loadingProfile, profileError } = useCurrentProfile()
  const [events, setEvents] = useState<EventRow[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadData() {
    if (loadingProfile) return
    if (!profile?.member_id) { setErrorMessage(profileError ?? 'Tu usuario todavía no está vinculado a un miembro.'); setLoading(false); return }
    setLoading(true); setErrorMessage(null)

    try {
      const eligibilityData = await loadMemberEligibility(profile.member_id)
      setEligibility(eligibilityData as Eligibility)
    } catch (eligibilityError) {
      setErrorMessage(eligibilityError instanceof Error ? eligibilityError.message : 'No se pudo calcular aptitud para eventos.')
      setLoading(false)
      return
    }

    const { data: eventData, error: eventError } = await supabase.from('events').select('id, title, event_date, has_cost, total_cost, status').eq('status', 'active').order('event_date', { ascending: true })
    if (eventError) { setErrorMessage(eventError.message); setLoading(false); return }

    const { data: registrationData, error: registrationError } = await supabase.from('event_registrations').select('id, event_id, registration_status').eq('member_id', profile.member_id)
    if (registrationError) { setErrorMessage(registrationError.message); setLoading(false); return }

    setEvents((eventData ?? []) as EventRow[])
    setRegistrations((registrationData ?? []) as RegistrationRow[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [loadingProfile, profile, profileError])

  async function toggleRegistration(eventId: string) {
    if (!profile?.member_id) return
    if (!eligibility?.eligible) { setErrorMessage('No puedes registrarte a eventos, exámenes, torneos, etc. todavía. Debes cumplir asistencia reglamentaria y no tener adeudos vencidos.'); return }
    const current = registrations.find((item) => item.event_id === eventId)
    if (!current) {
      const { error } = await supabase.from('event_registrations').insert({ event_id: eventId, member_id: profile.member_id, registration_status: 'registered' })
      if (error) setErrorMessage(error.message)
      await loadData()
      return
    }
    const nextStatus = current.registration_status === 'registered' ? 'cancelled' : 'registered'
    const { error } = await supabase.from('event_registrations').update({ registration_status: nextStatus, cancelled_at: nextStatus === 'cancelled' ? new Date().toISOString() : null }).eq('id', current.id)
    if (error) setErrorMessage(error.message)
    await loadData()
  }

  return (
    <ModuleShell title="Registro a evento" subtitle="Regístrate o sal de eventos activos." icon="/icons/icon-events.png" moduleType="Usuario" version="Registro eventos v13">
      {eligibility && <section className={`rounded-[2rem] border p-5 shadow-2xl ${eligibility.eligible ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-red-400/30 bg-red-400/10 text-red-100'}`}><p className="text-sm font-bold">{eligibility.eligible ? 'Apto para eventos, exámenes, torneos, etc.' : 'No apto para eventos, exámenes, torneos, etc.'}</p><p className="mt-2 text-xs leading-5 opacity-90">{eligibility.evaluation_state === 'evaluated' ? `Asistencia reglamentaria: ${eligibility.attendance_percent}% (${eligibility.completed_weeks}/${eligibility.required_attendances ?? eligibility.total_class_weeks} requeridas).` : 'Asistencia sin evaluación: todavía no hay semanas impartidas desde enero de 2027. No se penaliza al alumno por falta de clases.'} Adeudos vencidos: {eligibility.payment_debt_count}.</p></section>}
      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando eventos...</section>}
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl"><div className="min-w-[510px]"><div className="grid grid-cols-[120px_160px_110px_120px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300"><div>Registro</div><div>Evento</div><div>Fecha</div><div>Estatus</div></div><div className="divide-y divide-white/10">{events.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">No hay eventos activos.</div>}{events.map((event) => { const registration = registrations.find((item) => item.event_id === event.id); const registered = registration?.registration_status === 'registered'; return <div key={event.id} className="grid grid-cols-[120px_160px_110px_120px] items-center px-4 py-3 text-sm"><div><PrimaryButton onClick={() => toggleRegistration(event.id)} disabled={!registered && !eligibility?.eligible}>{registered ? 'Salir' : 'Inscribir'}</PrimaryButton></div><div className="truncate">{event.title}<p className="text-xs text-slate-500">{event.has_cost ? money(event.total_cost) : 'Sin costo'}</p></div><div>{formatDate(event.event_date)}</div><div><StatusBadge status={registered ? 'Registrado' : 'Pendiente'} /></div></div>})}</div></div></section>
    </ModuleShell>
  )
}

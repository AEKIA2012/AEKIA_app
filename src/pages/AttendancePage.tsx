import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../components/ModuleShell'
import { Field, StatusBadge } from '../components/FormControls'
import { supabase } from '../lib/supabaseClient'
import { ATTENDANCE_2027_START, attendanceEvaluationStart, dayName, formatDate, monthsAgoIso, regulatoryAttendanceStats, todayIso } from '../lib/helpers'
import { useCurrentProfile } from '../lib/useCurrentProfile'

type AttendanceRow = {
  id: string
  session_id: string
  attendance_status: string
  attendance_sessions: {
    id: string
    session_date: string
    title: string | null
    discipline_id: string | null
    disciplines: { name: string } | null
  } | null
}

type SessionRow = { id: string; session_date: string; discipline_id: string | null; counts_for_eligibility: boolean }
type MemberDisciplineRow = { discipline_id: string; practices: boolean }

function percentage(value: number, total: number) { return total <= 0 ? 0 : Math.round((value / total) * 100) }

function AttendanceVisual({ present, late, absent }: { present: number; late: number; absent: number }) {
  const total = present + late + absent
  const presentPercent = percentage(present, total)
  const latePercent = percentage(late, total)
  const absentPercent = percentage(absent, total)
  const scorePercent = percentage(present * 2 + late, Math.max(total * 2, 1))

  return (
    <section className="rounded-[2rem] border border-cyan-400/20 bg-cyan-400/10 p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Resumen visual global</p><h2 className="mt-2 text-2xl font-bold">{scorePercent}%</h2><p className="mt-1 text-sm text-slate-300">cumplimiento por registros del rango</p></div>
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/60"><svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="4" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeDasharray={`${scorePercent} 100`} strokeLinecap="round" strokeWidth="4" className="text-cyan-300" /></svg><span className="absolute text-sm font-bold text-white">{total}</span></div>
      </div>
      <div className="mt-5 space-y-3">
        <div><div className="mb-1 flex justify-between text-xs text-slate-300"><span>Asistencias puntuales</span><span>{present} · {presentPercent}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${presentPercent}%` }} /></div></div>
        <div><div className="mb-1 flex justify-between text-xs text-slate-300"><span>Retardos</span><span>{late} · {latePercent}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-amber-300" style={{ width: `${latePercent}%` }} /></div></div>
        <div><div className="mb-1 flex justify-between text-xs text-slate-300"><span>Faltas</span><span>{absent} · {absentPercent}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-red-400" style={{ width: `${absentPercent}%` }} /></div></div>
      </div>
    </section>
  )
}

export default function AttendancePage() {
  const { profile, loadingProfile, profileError } = useCurrentProfile()
  const [fromDate, setFromDate] = useState(todayIso() < ATTENDANCE_2027_START ? monthsAgoIso(3) : attendanceEvaluationStart())
  const [toDate, setToDate] = useState(todayIso())
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [memberDisciplines, setMemberDisciplines] = useState<MemberDisciplineRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadAttendance() {
      if (loadingProfile) return
      if (!profile?.member_id) { setErrorMessage(profileError ?? 'Tu usuario todavía no está vinculado a un miembro.'); return }
      setLoading(true); setErrorMessage(null)

      const { data: disciplineData, error: disciplineError } = await supabase
        .from('member_disciplines')
        .select('discipline_id, practices')
        .eq('member_id', profile.member_id)
      if (disciplineError) { setErrorMessage(disciplineError.message); setLoading(false); return }
      const practicedIds = (disciplineData ?? []).filter((row) => row.practices).map((row) => row.discipline_id)

      let sessionQuery = supabase
        .from('attendance_sessions')
        .select('id, session_date, discipline_id, counts_for_eligibility')
        .gte('session_date', fromDate)
        .lte('session_date', toDate)
        .eq('status', 'active')
      if (practicedIds.length > 0) sessionQuery = sessionQuery.in('discipline_id', practicedIds)
      const { data: sessionData, error: sessionError } = await sessionQuery
      if (sessionError) { setErrorMessage(sessionError.message); setLoading(false); return }

      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, session_id, attendance_status, attendance_sessions(id, session_date, title, discipline_id, disciplines(name))')
        .eq('member_id', profile.member_id)
        .gte('attendance_sessions.session_date', fromDate)
        .lte('attendance_sessions.session_date', toDate)

      setLoading(false)
      if (error) { setErrorMessage(error.message); setRows([]); return }
      setMemberDisciplines((disciplineData ?? []) as MemberDisciplineRow[])
      setSessions((sessionData ?? []) as SessionRow[])
      setRows((data ?? []) as unknown as AttendanceRow[])
    }
    loadAttendance()
  }, [fromDate, toDate, loadingProfile, profile, profileError])

  const sortedRows = rows.filter((row) => row.attendance_sessions?.session_date).sort((a, b) => String(b.attendance_sessions?.session_date).localeCompare(String(a.attendance_sessions?.session_date)))
  const stats = useMemo(() => sortedRows.reduce((totals, row) => { if (row.attendance_status === 'present') totals.present += 1; else if (row.attendance_status === 'late') totals.late += 1; else totals.absent += 1; return totals }, { present: 0, late: 0, absent: 0 }), [sortedRows])

  const regulatoryStats = useMemo(() => {
    const disciplineIds = memberDisciplines.filter((row) => row.practices).map((row) => row.discipline_id)
    return regulatoryAttendanceStats({
      sessions,
      records: sortedRows.map((row) => ({ session_id: row.session_id, attendance_status: row.attendance_status })),
      disciplineIds,
    })
  }, [sessions, sortedRows, memberDisciplines])

  return (
    <ModuleShell title="Mi asistencia" subtitle="Consulta tus asistencias, faltas y retardos." icon="/icons/icon-attendance.png" moduleType="Usuario" version="Asistencia usuario v14">
      <div className="grid grid-cols-2 gap-3"><Field label="Desde" type="date" value={fromDate} onChange={setFromDate} /><Field label="Hasta" type="date" value={toDate} onChange={setToDate} /></div>
      <section className={`rounded-[2rem] border p-5 shadow-2xl ${regulatoryStats.evaluationState !== 'evaluated' ? 'border-amber-400/30 bg-amber-400/10' : regulatoryStats.percent >= 100 ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-red-400/30 bg-red-400/10'}`}>
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Asistencia reglamentaria 2027</p>
        <h2 className="mt-2 text-3xl font-black text-white">{regulatoryStats.evaluationState === 'evaluated' ? `${regulatoryStats.percent}%` : 'Sin evaluación'}</h2>
        <p className="mt-1 text-sm font-bold text-white">{regulatoryStats.evaluationState === 'not_started' ? 'La evaluación inicia el 1 de enero de 2027.' : regulatoryStats.evaluationState === 'no_classes' ? 'No hay semanas confirmadas con clase para evaluar.' : regulatoryStats.percent >= 100 ? 'Cumple asistencia reglamentaria.' : 'No cumple asistencia reglamentaria.'}</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">Una asistencia puntual cumple la semana; se requiere 75% de las semanas impartidas del mes. Las canceladas y pendientes no cuentan. Cumplidas: {regulatoryStats.completedWeeks}/{regulatoryStats.requiredAttendances} semanas evaluables. Puedes consultar fechas anteriores ajustando el rango.</p>
      </section>
      <AttendanceVisual present={stats.present} late={stats.late} absent={stats.absent} />
      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando asistencia...</section>}
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl"><div className="min-w-[475px]"><div className="grid grid-cols-[120px_115px_120px_120px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300"><div>Fecha</div><div>Día</div><div>Estatus</div><div>Disciplina</div></div><div className="divide-y divide-white/10">{sortedRows.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">No hay registros en el rango seleccionado.</div>}{sortedRows.map((row) => <div key={row.id} className="grid grid-cols-[120px_115px_120px_120px] items-center px-4 py-3 text-sm"><div>{formatDate(row.attendance_sessions?.session_date)}</div><div className="capitalize text-slate-300">{dayName(row.attendance_sessions?.session_date)}</div><div><StatusBadge status={row.attendance_status} /></div><div className="truncate text-slate-300">{row.attendance_sessions?.disciplines?.name ?? '-'}</div></div>)}</div></div></section>
    </ModuleShell>
  )
}

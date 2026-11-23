import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { Field, PrimaryButton, SecondaryButton, SelectField } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'
import { ATTENDANCE_2027_START, attendanceEvaluationStart, formatDate, fullName, monthsAgoIso, regulatoryAttendanceStats, todayIso } from '../../lib/helpers'
import { downloadXlsx } from '../../lib/exportExcel'

type MemberRow = {
  id: string
  first_names: string
  paternal_last_name: string
  maternal_last_name: string
  status: string
}
type SessionRow = {
  id: string
  session_date: string
  title: string | null
  discipline_id: string | null
  status: 'active' | 'cancelled'
  counts_for_eligibility: boolean
}
type RecordRow = { id: string; session_id: string; member_id: string; attendance_status: string }
type MemberDiscipline = { member_id: string; discipline_id: string; practices: boolean }
type Discipline = { id: string; name: string }
type Tab = 'pasar_lista' | 'por_persona' | 'calendario'

const statusOptions = [
  { value: '', label: 'Sin capturar' },
  { value: 'present', label: 'Asistencia puntual' },
  { value: 'late', label: 'Retardo' },
  { value: 'absent', label: 'Falta' },
]

function attendanceLabel(status: string | null) {
  return statusOptions.find((option) => option.value === (status ?? ''))?.label ?? 'Sin capturar'
}

const initialFromDate = todayIso() < ATTENDANCE_2027_START ? monthsAgoIso(3) : attendanceEvaluationStart()

export default function AdminAttendancePage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'attendance.edit')
  const [fromDate, setFromDate] = useState(initialFromDate)
  const [toDate, setToDate] = useState(todayIso())
  const [newDate, setNewDate] = useState(todayIso())
  const [newDisciplineId, setNewDisciplineId] = useState('')
  const [tab, setTab] = useState<Tab>('pasar_lista')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [memberDisciplines, setMemberDisciplines] = useState<MemberDiscipline[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)

    const { data: memberData, error: memberError } = await supabase.from('members')
      .select('id, first_names, paternal_last_name, maternal_last_name, status')
      .eq('status', 'active').order('paternal_last_name')
    if (memberError) { setErrorMessage(memberError.message); setLoading(false); return }

    const { data: catalog, error: catalogError } = await supabase.from('disciplines')
      .select('id, name').order('name')
    if (catalogError) { setErrorMessage(catalogError.message); setLoading(false); return }

    const { data: sessionData, error: sessionError } = await supabase.from('attendance_sessions')
      .select('id, session_date, title, discipline_id, status, counts_for_eligibility')
      .gte('session_date', fromDate).lte('session_date', toDate)
      .order('session_date', { ascending: false })
    if (sessionError) { setErrorMessage(`${sessionError.message}. ¿Ya ejecutaste el SQL 017/v14?`); setLoading(false); return }

    const nextSessions = (sessionData ?? []) as SessionRow[]
    const memberIds = (memberData ?? []).map((member) => member.id)
    const { data: disciplineData, error: disciplineError } = memberIds.length > 0
      ? await supabase.from('member_disciplines').select('member_id, discipline_id, practices').in('member_id', memberIds)
      : { data: [], error: null }
    if (disciplineError) { setErrorMessage(disciplineError.message); setLoading(false); return }

    const { data: recordData, error: recordError } = nextSessions.length > 0
      ? await supabase.from('attendance_records').select('id, session_id, member_id, attendance_status')
        .in('session_id', nextSessions.map((session) => session.id))
      : { data: [], error: null }
    if (recordError) { setErrorMessage(recordError.message); setLoading(false); return }

    setMembers((memberData ?? []) as MemberRow[])
    setDisciplines((catalog ?? []) as Discipline[])
    setSessions(nextSessions)
    setRecords((recordData ?? []) as RecordRow[])
    setMemberDisciplines((disciplineData ?? []) as MemberDiscipline[])
    setSelectedSessionId((id) => nextSessions.some((item) => item.id === id) ? id : (nextSessions[0]?.id ?? ''))
    setSelectedMemberId((id) => (memberData ?? []).some((item) => item.id === id) ? id : (memberData?.[0]?.id ?? ''))
    setLoading(false)
  }, [fromDate, toDate])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const filteredMembers = useMemo(() => members.filter((member) =>
    fullName(member).toLowerCase().includes(searchText.toLowerCase().trim()),
  ), [members, searchText])
  const selectedSession = sessions.find((session) => session.id === selectedSessionId)
  const selectedMember = members.find((member) => member.id === selectedMemberId)
  const sessionName = (session: SessionRow) => `${formatDate(session.session_date)} · ${disciplines.find((item) => item.id === session.discipline_id)?.name ?? 'Sin disciplina'}${session.status === 'cancelled' ? ' · Cancelada' : ''}`
  const getRecord = (memberId: string, sessionId: string) => records.find((row) => row.member_id === memberId && row.session_id === sessionId)
  const memberPractices = (memberId: string, disciplineId: string | null) => !disciplineId || memberDisciplines.some((item) => item.member_id === memberId && item.discipline_id === disciplineId && item.practices)

  function memberStats(memberId: string) {
    return regulatoryAttendanceStats({
      sessions: sessions.filter((session) => session.status === 'active'),
      records: records.filter((row) => row.member_id === memberId),
      disciplineIds: memberDisciplines.filter((item) => item.member_id === memberId && item.practices).map((item) => item.discipline_id),
    })
  }

  async function setAttendance(memberId: string, sessionId: string, status: string) {
    if (!canEdit) return
    const existing = getRecord(memberId, sessionId)
    const key = `${memberId}-${sessionId}`
    setSavingKey(key); setErrorMessage(null)
    if (!status) {
      if (existing) {
        const { error } = await supabase.from('attendance_records').delete().eq('id', existing.id)
        if (error) { setErrorMessage(error.message); setSavingKey(null); return }
        setRecords((rows) => rows.filter((row) => row.id !== existing.id))
      }
    } else {
      const { data, error } = await supabase.from('attendance_records').upsert(
        { member_id: memberId, session_id: sessionId, attendance_status: status },
        { onConflict: 'session_id,member_id' },
      ).select('id, session_id, member_id, attendance_status').single()
      if (error) { setErrorMessage(error.message); setSavingKey(null); return }
      setRecords((rows) => [...rows.filter((row) => !(row.member_id === memberId && row.session_id === sessionId)), data as RecordRow])
    }
    setSavingKey(null)
  }

  async function updateSession(session: SessionRow, patch: Partial<Pick<SessionRow, 'status' | 'counts_for_eligibility'>>) {
    if (!canEdit) return
    setSavingKey(session.id); setErrorMessage(null)
    const update = patch.status === 'cancelled' ? { ...patch, counts_for_eligibility: false } : patch
    const { error } = await supabase.from('attendance_sessions').update(update).eq('id', session.id)
    setSavingKey(null)
    if (error) { setErrorMessage(error.message); return }
    setSessions((rows) => rows.map((row) => row.id === session.id ? { ...row, ...update } : row))
    setSuccessMessage('El estado del entrenamiento se actualizó correctamente.')
  }

  async function createSession() {
    if (!canEdit) return
    if (!newDisciplineId) { setErrorMessage('Selecciona la disciplina del entrenamiento.'); return }
    const discipline = disciplines.find((row) => row.id === newDisciplineId)
    setSavingKey('new'); setErrorMessage(null)
    const { error } = await supabase.from('attendance_sessions').insert({
      session_date: newDate,
      discipline_id: newDisciplineId,
      title: `Entrenamiento ${discipline?.name ?? ''}`.trim(),
      status: 'active',
      counts_for_eligibility: false,
    })
    setSavingKey(null)
    if (error) { setErrorMessage(error.code === '23505' ? 'Ya existe un entrenamiento de esta disciplina en esa fecha; selecciónalo para modificarlo.' : error.message); return }
    if (newDate < fromDate) setFromDate(newDate)
    if (newDate > toDate) setToDate(newDate)
    await loadData()
    setSuccessMessage('Entrenamiento guardado. Confirma cuando realmente se imparta para que cuente en la asistencia.')
  }

  function exportExcel() {
    downloadXlsx('control-asistencia-aekia-v14.xlsx', 'Asistencia',
      ['Integrante', ...sessions.map(sessionName)],
      filteredMembers.map((member) => [fullName(member), ...sessions.map((session) => attendanceLabel(getRecord(member.id, session.id)?.attendance_status ?? null))]),
    )
  }

  function attendanceSelector(member: MemberRow, session: SessionRow) {
    const key = `${member.id}-${session.id}`
    const current = getRecord(member.id, session.id)?.attendance_status ?? ''
    return (
      <select aria-label={`Asistencia de ${fullName(member)} el ${formatDate(session.session_date)}`}
        value={current} disabled={!canEdit || savingKey === key || session.status === 'cancelled'}
        onChange={(event) => setAttendance(member.id, session.id, event.target.value)}
        className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none disabled:opacity-50 ${current === 'present' ? 'border-cyan-300 bg-cyan-300 text-slate-950' : current === 'late' ? 'border-amber-300 bg-amber-300 text-slate-950' : current === 'absent' ? 'border-red-400/40 bg-red-400/15 text-red-100' : 'border-white/20 bg-slate-900 text-slate-200'}`}>
        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }

  return (
    <ModuleShell title="Control de asistencia" subtitle="Pasa lista por fecha, corrige personas y confirma entrenamientos." icon="/icons/icon-attendance-admin.png" moduleType="Gestión" version="Control asistencia v14">
      <SaveConfirmation message={successMessage} onClose={() => setSuccessMessage(null)} />
      {!canEdit && <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">Modo consulta: tu rol permite ver y exportar, pero no modificar asistencia.</section>}
      <section className="grid grid-cols-2 gap-3"><Field label="Desde" type="date" value={fromDate} onChange={setFromDate} /><Field label="Hasta" type="date" value={toDate} onChange={setToDate} /></section>
      <div role="tablist" aria-label="Modo de asistencia" className="grid grid-cols-3 gap-2">
        {([['pasar_lista', 'Por fecha'], ['por_persona', 'Por persona'], ['calendario', 'Calendario']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)} className={`rounded-xl border px-2 py-3 text-xs font-bold ${tab === value ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-white/15 bg-slate-900 text-slate-200'}`}>{label}</button>)}
      </div>
      {loading && <section className="rounded-2xl border border-white/10 p-4 text-sm text-slate-300">Cargando asistencia...</section>}
      {errorMessage && <section role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      {!loading && <>
        {tab === 'pasar_lista' && <>
          <SelectField label="Entrenamiento" value={selectedSessionId} onChange={setSelectedSessionId} options={[{ value: '', label: 'Selecciona una fecha' }, ...sessions.map((session) => ({ value: session.id, label: sessionName(session) }))]} />
          {selectedSession && <>
            <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-slate-200">
              <p className="font-bold">{sessionName(selectedSession)}</p>
              <p className="mt-1 text-xs">{selectedSession.status === 'cancelled' ? 'Cancelada: no computa asistencia.' : selectedSession.counts_for_eligibility ? 'Clase realizada: cuenta para las semanas reglamentarias.' : 'Pendiente de confirmar como realizada: todavía no cuenta.'}</p>
            </section>
            <Field label="Buscar integrante" value={searchText} onChange={setSearchText} placeholder="Escribe un nombre" />
            <section className="space-y-2">
              {filteredMembers.filter((member) => memberPractices(member.id, selectedSession.discipline_id)).map((member) => <article key={member.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 break-words text-sm font-semibold">{fullName(member)}</p>
                {attendanceSelector(member, selectedSession)}
              </article>)}
            </section>
          </>}
          {!selectedSession && <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-300">Todavía no hay entrenamientos en este rango. Ve a Calendario para crear uno.</p>}
        </>}
        {tab === 'por_persona' && <>
          <Field label="Buscar integrante" value={searchText} onChange={setSearchText} placeholder="Nombre de integrante" />
          <SelectField label="Integrante" value={selectedMemberId} onChange={setSelectedMemberId} options={[{ value: '', label: 'Selecciona un integrante' }, ...filteredMembers.map((member) => ({ value: member.id, label: fullName(member) }))]} />
          {selectedMember && <>
            {(() => { const stats = memberStats(selectedMember.id); return <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm"><p className="font-bold">{fullName(selectedMember)}</p><p className="mt-2 text-slate-300">{stats.evaluationState === 'not_started' ? 'La evaluación reglamentaria inicia en enero de 2027.' : stats.evaluationState === 'no_classes' ? 'Sin semanas de clase confirmadas para evaluar.' : `Asistencia en el rango seleccionado: ${stats.completedWeeks}/${stats.requiredAttendances} semanas (${stats.percent}%).`}</p></section> })()}
            {sessions.filter((session) => memberPractices(selectedMember.id, session.discipline_id)).map((session) => <article key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="mb-2 text-xs text-slate-300">{sessionName(session)}</p>{attendanceSelector(selectedMember, session)}</article>)}
          </>}
        </>}
        {tab === 'calendario' && <>
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-3 text-base font-bold">Agregar entrenamiento</h2>
            <div className="space-y-3"><Field label="Fecha" type="date" value={newDate} onChange={setNewDate} disabled={!canEdit} />
              <SelectField label="Disciplina" value={newDisciplineId} onChange={setNewDisciplineId} disabled={!canEdit} options={[{ value: '', label: 'Selecciona disciplina' }, ...disciplines.map((row) => ({ value: row.id, label: row.name }))]} />
              <PrimaryButton onClick={createSession} disabled={!canEdit || savingKey === 'new'}>Crear entrenamiento</PrimaryButton>
            </div>
          </section>
          {sessions.map((session) => <article key={session.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div><p className="font-bold">{sessionName(session)}</p><p className="mt-1 text-xs text-slate-300">{session.status === 'cancelled' ? 'Cancelada' : session.counts_for_eligibility ? 'Realizada · cuenta para elegibilidad' : 'Programada · no cuenta todavía'}</p></div>
            {canEdit && <div className="grid grid-cols-2 gap-2">
              {session.status === 'active' && <button type="button" disabled={savingKey === session.id || session.session_date > todayIso() || session.session_date < ATTENDANCE_2027_START} onClick={() => updateSession(session, { counts_for_eligibility: !session.counts_for_eligibility })} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-40">{session.counts_for_eligibility ? 'Quitar del cálculo' : 'Confirmar realizada'}</button>}
              <button type="button" disabled={savingKey === session.id} onClick={() => updateSession(session, { status: session.status === 'cancelled' ? 'active' : 'cancelled' })} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-40">{session.status === 'cancelled' ? 'Reabrir' : 'Cancelar clase'}</button>
            </div>}
          </article>)}
          {sessions.length === 0 && <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-300">No hay fechas en el rango seleccionado.</p>}
          <p className="text-xs leading-5 text-slate-400">Solo una clase confirmada y ya celebrada puede contar en el requisito semanal; las canceladas no cuentan. Los entrenamientos anteriores a 2027 se conservan para consulta.</p>
        </>}
        <SecondaryButton onClick={exportExcel}>Exportar Excel del rango</SecondaryButton>
      </>}
    </ModuleShell>
  )
}

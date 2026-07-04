import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import { Field, PrimaryButton, SecondaryButton, SelectField } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'
import { formatDate, fullName, monthsAgoIso, regulatoryAttendanceStats, todayIso } from '../../lib/helpers'
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
}

type RecordRow = {
  id: string
  session_id: string
  member_id: string
  attendance_status: string
}

type MemberDisciplineRow = { member_id: string; discipline_id: string; practices: boolean }

const attendanceOptions = [
  { value: 'present', label: 'Asistencia' },
  { value: 'late', label: 'Retardo' },
  { value: 'absent', label: 'Falta' },
]

function attendanceLabel(status: string) {
  if (status === 'present') return 'Asistencia'
  if (status === 'late') return 'Retardo'
  return 'Falta'
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function AdminAttendanceVisual({ records, members, sessions, memberDisciplines }: { records: RecordRow[]; members: MemberRow[]; sessions: SessionRow[]; memberDisciplines: MemberDisciplineRow[] }) {
  const present = records.filter((record) => record.attendance_status === 'present').length
  const late = records.filter((record) => record.attendance_status === 'late').length
  const absent = records.filter((record) => record.attendance_status === 'absent').length
  const total = present + late + absent
  const presentPercent = percentage(present, total)
  const latePercent = percentage(late, total)
  const absentPercent = percentage(absent, total)
  const scorePercent = percentage(present * 2 + late, Math.max(total * 2, 1))
  const regulatoryByMember = members.map((member) => {
    const disciplineIds = memberDisciplines.filter((item) => item.member_id === member.id && item.practices).map((item) => item.discipline_id)
    return regulatoryAttendanceStats({
      sessions,
      records: records.filter((record) => record.member_id === member.id).map((record) => ({ session_id: record.session_id, attendance_status: record.attendance_status })),
      disciplineIds,
    })
  })
  const averageRegulatory = regulatoryByMember.length > 0 ? Math.round(regulatoryByMember.reduce((sum, item) => sum + item.percent, 0) / regulatoryByMember.length) : 100

  return (
    <section className="rounded-[2rem] border border-cyan-400/20 bg-cyan-400/10 p-5 shadow-2xl">
      <div className="space-y-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Vista general</p>
          <h2 className="mt-2 text-2xl font-bold">{scorePercent}%</h2>
          <p className="mt-1 text-sm text-slate-300">global por registros del rango</p><p className="mt-1 text-xs text-emerald-200">Reglamentaria: {averageRegulatory}% · hasta 3 asistencias puntuales por mes; retardos no cuentan.</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[180px]">
          <div className="rounded-2xl border border-cyan-400/30 bg-slate-950/40 p-3">
            <p className="text-xl font-bold text-cyan-200">{present}</p><p className="text-slate-400">Asist.</p>
          </div>
          <div className="rounded-2xl border border-amber-400/30 bg-slate-950/40 p-3">
            <p className="text-xl font-bold text-amber-200">{late}</p><p className="text-slate-400">Ret.</p>
          </div>
          <div className="rounded-2xl border border-red-400/30 bg-slate-950/40 p-3">
            <p className="text-xl font-bold text-red-200">{absent}</p><p className="text-slate-400">Faltas</p>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-full bg-slate-900">
        <div className="flex h-4">
          <div className="bg-cyan-300" style={{ width: `${presentPercent}%` }} />
          <div className="bg-amber-300" style={{ width: `${latePercent}%` }} />
          <div className="bg-red-400" style={{ width: `${absentPercent}%` }} />
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Asistencias {presentPercent}% · Retardos {latePercent}% · Faltas {absentPercent}%
      </p>
    </section>
  )
}

export default function AdminAttendancePage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'attendance.edit')
  const [fromDate, setFromDate] = useState(monthsAgoIso(3))
  const [toDate, setToDate] = useState(todayIso())
  const [newDate, setNewDate] = useState(todayIso())
  const [searchText, setSearchText] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])
  const [memberDisciplines, setMemberDisciplines] = useState<MemberDisciplineRow[]>([])
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setErrorMessage(null)

    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('id, first_names, paternal_last_name, maternal_last_name, status')
      .eq('status', 'active')
      .order('paternal_last_name', { ascending: true })

    if (memberError) {
      setErrorMessage(memberError.message)
      setLoading(false)
      return
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, title, discipline_id')
      .gte('session_date', fromDate)
      .lte('session_date', toDate)
      .eq('status', 'active')
      .order('session_date', { ascending: false })

    if (sessionError) {
      setErrorMessage(sessionError.message)
      setLoading(false)
      return
    }

    const sessionIds = (sessionData ?? []).map((item) => item.id)
    const memberIds = (memberData ?? []).map((item) => item.id)

    const { data: memberDisciplineData, error: memberDisciplineError } = memberIds.length > 0
      ? await supabase.from('member_disciplines').select('member_id, discipline_id, practices').in('member_id', memberIds)
      : { data: [], error: null }
    if (memberDisciplineError) {
      setErrorMessage(memberDisciplineError.message)
      setLoading(false)
      return
    }

    if (sessionIds.length === 0) {
      setMembers((memberData ?? []) as MemberRow[])
      setSessions([])
      setRecords([])
      setMemberDisciplines((memberDisciplineData ?? []) as MemberDisciplineRow[])
      setLoading(false)
      return
    }

    const { data: recordData, error: recordError } = await supabase
      .from('attendance_records')
      .select('id, session_id, member_id, attendance_status')
      .in('session_id', sessionIds)

    if (recordError) {
      setErrorMessage(recordError.message)
      setLoading(false)
      return
    }

    setMembers((memberData ?? []) as MemberRow[])
    setSessions((sessionData ?? []) as SessionRow[])
    setRecords((recordData ?? []) as RecordRow[])
    setMemberDisciplines((memberDisciplineData ?? []) as MemberDisciplineRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [fromDate, toDate])

  function getRecord(memberId: string, sessionId: string) {
    return records.find(
      (record) => record.member_id === memberId && record.session_id === sessionId,
    )
  }

  function getStatus(memberId: string, sessionId: string) {
    return getRecord(memberId, sessionId)?.attendance_status ?? 'absent'
  }

  function memberRegulatoryScore(member: MemberRow) {
    const disciplineIds = memberDisciplines.filter((item) => item.member_id === member.id && item.practices).map((item) => item.discipline_id)
    return regulatoryAttendanceStats({
      sessions,
      records: records.filter((record) => record.member_id === member.id).map((record) => ({ session_id: record.session_id, attendance_status: record.attendance_status })),
      disciplineIds,
    })
  }

  function memberAttendanceScore(member: MemberRow) {
    return memberRegulatoryScore(member).percent
  }

  async function setAttendanceStatus(
    memberId: string,
    sessionId: string,
    nextStatus: string,
  ) {
    if (!canEdit) {
      setErrorMessage('Tu rol permite consultar asistencia, pero no editarla.')
      return
    }

    const existing = getRecord(memberId, sessionId)
    const cellKey = `${memberId}-${sessionId}`
    setSavingCell(cellKey)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('attendance_records')
      .upsert({
        id: existing?.id,
        member_id: memberId,
        session_id: sessionId,
        attendance_status: nextStatus,
      })
      .select('id, session_id, member_id, attendance_status')
      .single()

    setSavingCell(null)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setRecords((current) => {
      const withoutCell = current.filter(
        (record) => !(record.member_id === memberId && record.session_id === sessionId),
      )
      return [...withoutCell, data as RecordRow]
    })
  }

  async function generateSession() {
    if (!canEdit) {
      setErrorMessage('Tu rol permite consultar asistencia, pero no generar entrenamientos.')
      return
    }

    const { error } = await supabase
      .from('attendance_sessions')
      .upsert(
        {
          session_date: newDate,
          title: 'Entrenamiento Kendo',
          status: 'active',
        },
        { onConflict: 'session_date,discipline_id' },
      )

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setFromDate(newDate < fromDate ? newDate : fromDate)
    setToDate(newDate > toDate ? newDate : toDate)
    await loadData()
  }

  function exportExcel() {
    const headers = ['Integrante', ...sessions.map((session) => formatDate(session.session_date))]
    const rows = filteredMembers.map((member) => [
      fullName(member),
      ...sessions.map((session) => attendanceLabel(getStatus(member.id, session.id))),
    ])

    downloadXlsx('control-asistencia-aekia.xlsx', 'Asistencia', headers, rows)
  }

  const filteredMembers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()

    return members
      .filter((member) =>
        fullName(member).toLowerCase().includes(normalizedSearch),
      )
      .sort((a, b) => {
        return (
          memberAttendanceScore(b) - memberAttendanceScore(a) ||
          fullName(a).localeCompare(fullName(b))
        )
      })
  }, [members, records, sessions, searchText])

  return (
    <ModuleShell
      title="Control de asistencia"
      subtitle="Registra asistencia, falta o retardo por fecha."
      icon="/icons/icon-attendance-admin.png"
      moduleType="Gestión"
      version="Control asistencia v08"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" type="date" value={fromDate} onChange={setFromDate} />
        <Field label="Hasta" type="date" value={toDate} onChange={setToDate} />
      </div>

      <Field label="Filtro" value={searchText} onChange={setSearchText} placeholder="Buscar integrante" />

      <AdminAttendanceVisual records={records} members={members} sessions={sessions} memberDisciplines={memberDisciplines} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nuevo entrenamiento" type="date" value={newDate} onChange={setNewDate} disabled={!canEdit} />
        <div className="pt-7">
          <PrimaryButton onClick={generateSession} disabled={!canEdit}>Generar</PrimaryButton>
        </div>
      </div>

      <SecondaryButton onClick={exportExcel}>Exportar Excel</SecondaryButton>

      {!canEdit && (
        <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
          Modo consulta: tu rol permite revisar y exportar asistencia, pero no modificar registros.
        </section>
      )}

      {loading && (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">
          Cargando asistencia...
        </section>
      )}

      {errorMessage && (
        <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
          {errorMessage}
        </section>
      )}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[900px]">
          <div
            className="grid border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300"
            style={{ gridTemplateColumns: `220px repeat(${Math.max(sessions.length, 1)}, 122px)` }}
          >
            <div>Integrante</div>
            {sessions.map((session) => (
              <div key={session.id}>{formatDate(session.session_date).slice(0, 5)}</div>
            ))}
          </div>

          <div className="divide-y divide-white/10">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="grid items-center px-4 py-2 text-sm"
                style={{ gridTemplateColumns: `220px repeat(${Math.max(sessions.length, 1)}, 122px)` }}
              >
                <div className="truncate pr-3">
                  {fullName(member)}
                  <p className="text-xs text-slate-500">Reglamentaria: {memberRegulatoryScore(member).percent}%</p>
                </div>

                {sessions.map((session) => {
                  const cellKey = `${member.id}-${session.id}`
                  const currentStatus = getStatus(member.id, session.id)

                  return (
                    <select
                      key={session.id}
                      className={`mx-1 rounded-xl border border-white/10 px-2 py-2 text-xs font-bold outline-none disabled:cursor-not-allowed disabled:opacity-70 ${
                        currentStatus === 'present'
                          ? 'bg-cyan-400 text-slate-950'
                          : currentStatus === 'late'
                            ? 'bg-amber-300 text-slate-950'
                            : 'bg-red-400/20 text-red-100'
                      }`}
                      value={currentStatus}
                      disabled={savingCell === cellKey || !canEdit}
                      onChange={(event) =>
                        setAttendanceStatus(member.id, session.id, event.target.value)
                      }
                    >
                      {attendanceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <SelectField
        label="Orden"
        value=""
        onChange={() => undefined}
        disabled
        options={[{ value: '', label: 'Primero aparecen quienes tienen mejor asistencia reglamentaria en el rango.' }]}
      />
    </ModuleShell>
  )
}

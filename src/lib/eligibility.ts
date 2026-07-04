import { monthsAgoIso, regulatoryAttendanceStats, todayIso } from './helpers'
import { supabase } from './supabaseClient'

export type MemberEligibility = {
  eligible: boolean
  attendance_ok: boolean
  payments_ok: boolean
  attendance_percent: number
  payment_debt_count: number
  monthly_debt_count: number
  other_debt_count: number
  completed_weeks: number
  total_class_weeks: number
  required_attendances: number
  punctual_attendances: number
  from_date: string
  to_date: string
}

type SessionRow = { id: string; session_date: string; discipline_id: string | null }
type RecordRow = { session_id: string; attendance_status: string | null }
type MemberDisciplineRow = { discipline_id: string; practices: boolean }

export async function loadMemberEligibility(memberId: string): Promise<MemberEligibility> {
  const fromDate = monthsAgoIso(3)
  const toDate = todayIso()

  const { data: serverEligibility } = await supabase.rpc('aekia_member_event_eligibility', { p_member_id: memberId })

  const { data: disciplineData, error: disciplineError } = await supabase
    .from('member_disciplines')
    .select('discipline_id, practices')
    .eq('member_id', memberId)

  if (disciplineError) throw disciplineError

  const practicedIds = ((disciplineData ?? []) as MemberDisciplineRow[])
    .filter((row) => row.practices)
    .map((row) => row.discipline_id)
    .filter(Boolean)

  let sessionQuery = supabase
    .from('attendance_sessions')
    .select('id, session_date, discipline_id')
    .gte('session_date', fromDate)
    .lte('session_date', toDate)
    .eq('status', 'active')

  if (practicedIds.length > 0) {
    sessionQuery = sessionQuery.in('discipline_id', practicedIds)
  }

  const { data: sessionData, error: sessionError } = await sessionQuery
  if (sessionError) throw sessionError

  const sessions = (sessionData ?? []) as SessionRow[]
  let records: RecordRow[] = []

  if (sessions.length > 0) {
    const { data: recordData, error: recordError } = await supabase
      .from('attendance_records')
      .select('session_id, attendance_status')
      .eq('member_id', memberId)
      .in('session_id', sessions.map((session) => session.id))

    if (recordError) throw recordError
    records = (recordData ?? []) as RecordRow[]
  }

  const stats = regulatoryAttendanceStats({
    sessions,
    records,
    disciplineIds: practicedIds,
  })

  const monthlyDebt = Number(serverEligibility?.monthly_debt_count ?? 0)
  const otherDebt = Number(serverEligibility?.other_debt_count ?? 0)
  const paymentDebt = Number(serverEligibility?.payment_debt_count ?? monthlyDebt + otherDebt)
  const paymentsOk = paymentDebt === 0
  const attendanceOk = stats.percent >= 100

  return {
    eligible: attendanceOk && paymentsOk,
    attendance_ok: attendanceOk,
    payments_ok: paymentsOk,
    attendance_percent: stats.percent,
    payment_debt_count: paymentDebt,
    monthly_debt_count: monthlyDebt,
    other_debt_count: otherDebt,
    completed_weeks: stats.completedWeeks,
    total_class_weeks: stats.totalClassWeeks,
    required_attendances: stats.requiredAttendances,
    punctual_attendances: stats.punctualAttendances,
    from_date: fromDate,
    to_date: toDate,
  }
}

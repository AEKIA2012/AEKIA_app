import { supabase } from './supabaseClient'

export type MemberEligibility = {
  eligible: boolean
  attendance_ok: boolean
  payments_ok: boolean
  attendance_percent: number
  evaluation_state: 'not_started' | 'no_classes' | 'evaluated'
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

export async function loadMemberEligibility(memberId: string): Promise<MemberEligibility> {
  const { data, error } = await supabase.rpc('aekia_authorized_member_event_eligibility', { p_member_id: memberId })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('evaluation_state' in data)) {
    throw new Error('La migración de asistencia v14 todavía no está instalada en Supabase.')
  }
  return data as MemberEligibility
}

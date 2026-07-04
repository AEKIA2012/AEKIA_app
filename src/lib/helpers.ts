export type SelectOption = {
  value: string
  label: string
}

export const AEKIA_BUILD_VERSION = 'patch-v15-publicacion-final'

export function emptyToNull(value: string) {
  const cleaned = value.trim()
  return cleaned === '' ? null : cleaned
}

export function normalizeCurp(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidCurp(curp: string) {
  return /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(curp)
}

export function birthDateFromCurp(curp: string) {
  if (!isValidCurp(curp)) {
    return ''
  }

  const yy = Number(curp.slice(4, 6))
  const mm = Number(curp.slice(6, 8))
  const dd = Number(curp.slice(8, 10))
  const currentTwoDigitYear = new Date().getFullYear() % 100
  const fullYear = yy <= currentTwoDigitYear ? 2000 + yy : 1900 + yy

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return ''
  }

  return `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export function calculateAgeFromBirthDate(birthDate: string | null) {
  if (!birthDate) {
    return ''
  }

  const birth = new Date(`${birthDate}T00:00:00`)
  const today = new Date()
  const ageInMs = today.getTime() - birth.getTime()
  const age = ageInMs / (365.2425 * 24 * 60 * 60 * 1000)

  if (!Number.isFinite(age)) {
    return ''
  }

  return age.toFixed(2)
}

export function getBirthdayFromCurp(curp: string) {
  const birthDate = birthDateFromCurp(curp)

  if (!birthDate) {
    return ''
  }

  const [, month, day] = birthDate.split('-')
  return `${day}/${month}`
}

export function money(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(Number.isFinite(numberValue) ? numberValue : 0)
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Sin fecha'
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function dayName(value: string | null | undefined) {
  if (!value) return 'Sin día'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Sin día'
  return date.toLocaleDateString('es-MX', { weekday: 'long' })
}

export function formatDateWithDay(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return `${formatDate(value)} · ${dayName(value)}`
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function monthsAgoIso(months: number) {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return date.toISOString().slice(0, 10)
}

export function currentYear() {
  return new Date().getFullYear()
}

export function escapeCsv(value: string | number | boolean | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n')

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function fullName(member: {
  first_names?: string | null
  paternal_last_name?: string | null
  maternal_last_name?: string | null
}) {
  return [member.first_names, member.paternal_last_name, member.maternal_last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeFilename(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'archivo'
}

export const monthLabels = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]


export function statusLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').toLowerCase()
  const labels: Record<string, string> = {
    active: 'Activo',
    inactive: 'Inactivo',
    paid: 'Pagado',
    pending: 'Pendiente',
    partial: 'Parcial',
    waived: 'Condonado',
    cancelled: 'Cancelado',
    closed: 'Cerrado',
    open: 'Abierto',
    in_process: 'En proceso',
    present: 'Asistencia',
    late: 'Retardo',
    absent: 'Falta',
    registered: 'Registrado',
    success: 'Correcto',
  }
  return labels[normalized] ?? String(value ?? '')
}

export function dateInputValue(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : ''
}

export function weekKeyFromIso(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  const start = new Date(date)
  const day = start.getDay() || 7
  start.setDate(start.getDate() + 4 - day)
  const yearStart = new Date(start.getFullYear(), 0, 1)
  const week = Math.ceil((((start.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${start.getFullYear()}-S${String(week).padStart(2, '0')}`
}

export function weeksBetweenIso(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`)
  const to = new Date(`${toDate}T00:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return 0
  const weeks = new Set<string>()
  const cursor = new Date(from)
  while (cursor <= to) {
    weeks.add(weekKeyFromIso(cursor.toISOString().slice(0, 10)))
    cursor.setDate(cursor.getDate() + 1)
  }
  return weeks.size
}

export function monthKeyFromIso(value: string | null | undefined) {
  if (!value) return ''
  const text = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(0, 7) : ''
}

export type RegulatoryAttendanceStats = {
  totalClassWeeks: number
  completedWeeks: number
  requiredAttendances: number
  punctualAttendances: number
  percent: number
}

export function regulatoryAttendanceStats(args: {
  sessions: Array<{ id: string; session_date: string | null; discipline_id?: string | null }>
  records: Array<{ session_id: string; attendance_status: string | null | undefined }>
  disciplineIds?: string[]
}): RegulatoryAttendanceStats {
  const disciplineSet = new Set((args.disciplineIds ?? []).filter(Boolean).map(String))
  const relevantSessions = args.sessions.filter((session) => {
    if (!session.session_date) return false
    if (disciplineSet.size === 0) return true
    return disciplineSet.has(String(session.discipline_id ?? ''))
  })

  const sessionById = new Map(relevantSessions.map((session) => [session.id, session]))
  const classSessionIdsByMonth = new Map<string, Set<string>>()
  const presentSessionIdsByMonth = new Map<string, Set<string>>()
  const punctualSessionIds = new Set<string>()

  for (const record of args.records) {
    const session = sessionById.get(record.session_id)
    if (!session?.session_date) continue
    const monthKey = monthKeyFromIso(session.session_date)
    if (!monthKey) continue

    if (!classSessionIdsByMonth.has(monthKey)) {
      classSessionIdsByMonth.set(monthKey, new Set<string>())
    }
    classSessionIdsByMonth.get(monthKey)?.add(record.session_id)

    if (record.attendance_status === 'present') {
      punctualSessionIds.add(record.session_id)
      if (!presentSessionIdsByMonth.has(monthKey)) {
        presentSessionIdsByMonth.set(monthKey, new Set<string>())
      }
      presentSessionIdsByMonth.get(monthKey)?.add(record.session_id)
    }
  }

  // Regla AEKIA de elegibilidad:
  // - Solo cuentan asistencias puntuales; los retardos no cuentan.
  // - Por cada mes del rango se requieren hasta 3 asistencias puntuales.
  // - Si ese mes tuvo menos clases registradas para el miembro, el requerido baja.
  // - Las asistencias extra de un mes no compensan otro mes.
  // Nota: se calculan clases registradas para el miembro, no sesiones globales de otras disciplinas.
  let totalClassWeeks = 0
  let requiredAttendances = 0
  let completedWeeks = 0

  for (const [monthKey, classSessionIds] of classSessionIdsByMonth.entries()) {
    const classCount = classSessionIds.size
    const monthlyRequired = Math.min(3, classCount)
    const monthlyCompleted = Math.min(presentSessionIdsByMonth.get(monthKey)?.size ?? 0, monthlyRequired)
    totalClassWeeks += classCount
    requiredAttendances += monthlyRequired
    completedWeeks += monthlyCompleted
  }

  const percent = requiredAttendances > 0 ? Math.min(100, Math.round((completedWeeks / requiredAttendances) * 100)) : 100
  return { totalClassWeeks, completedWeeks, requiredAttendances, punctualAttendances: punctualSessionIds.size, percent }
}


import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) throw new Error('Falta SUPABASE_URL')
if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const dataDir = process.argv[2] ?? 'data'

const files = {
  attendance2025: path.join(dataDir, 'Asistencias Kendo 2025.xlsx'),
  attendance2026: path.join(dataDir, 'Asistencias Kendo 2026.xlsx'),
  payments2025: path.join(dataDir, 'Mensualidades .xlsx'),
  payments2026: path.join(dataDir, '_Mensualidades 2026.xlsx'),
  accessWednesday: path.join(dataDir, '（水）学校開放受付＆チェックリスト【AGS剣友会】.xls'),
  accessSunday: path.join(dataDir, '（日）学校開放受付＆チェックリスト【AGS剣友会】.xls'),
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseBoolean(value) {
  const text = clean(value).toLowerCase()
  return text === 'true' || text === 'sí' || text === 'si' || text === 'x' || text === '1'
}

function parseDate(value) {
  if (!value) return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const text = clean(value).replace(/／/g, '/')
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (year < 100) year += 2000

  if (year === 2026 && text.includes('03/08/26')) year = 2025

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fullName(member) {
  return [member.first_names, member.paternal_last_name, member.maternal_last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function getMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('id, first_names, paternal_last_name, maternal_last_name, work_school_name, japanese_name')

  if (error) throw error

  const members = data ?? []
  const exactMap = new Map()
  for (const member of members) exactMap.set(normalizeName(fullName(member)), member)

  return { members, exactMap }
}

function findMember(name, members, exactMap) {
  const normalized = normalizeName(name)
  if (!normalized) return null

  const exact = exactMap.get(normalized)
  if (exact) return exact

  const parts = normalized.split(' ').filter(Boolean)
  return members.find((member) => {
    const memberName = normalizeName(fullName(member))
    return parts.every((part) => memberName.includes(part)) || memberName.includes(normalized)
  }) ?? null
}

async function getKendoDisciplineId() {
  const { data, error } = await supabase
    .from('disciplines')
    .select('id')
    .eq('code', 'kendo')
    .single()

  if (error) throw error
  return data.id
}

async function importAttendance(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('Archivo no encontrado, se omite:', filePath)
    return { sessions: 0, records: 0 }
  }

  const { members, exactMap } = await getMembers()
  const kendoId = await getKendoDisciplineId()
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
  const headers = rows[0] ?? []
  const dates = headers.map(parseDate)

  const sessionRows = dates
    .map((sessionDate) => sessionDate ? { session_date: sessionDate, discipline_id: kendoId, title: 'Entrenamiento Kendo', status: 'active' } : null)
    .filter(Boolean)

  if (sessionRows.length === 0) return { sessions: 0, records: 0 }

  const { error: sessionError } = await supabase
    .from('attendance_sessions')
    .upsert(sessionRows, { onConflict: 'session_date,discipline_id' })
  if (sessionError) throw sessionError

  const { data: sessions, error: reloadSessionsError } = await supabase
    .from('attendance_sessions')
    .select('id, session_date')
    .in('session_date', sessionRows.map((row) => row.session_date))
    .eq('discipline_id', kendoId)
  if (reloadSessionsError) throw reloadSessionsError

  const sessionByDate = new Map((sessions ?? []).map((session) => [session.session_date, session.id]))
  const records = []

  for (const row of rows.slice(1)) {
    const memberName = clean(row[0])
    const member = findMember(memberName, members, exactMap)
    if (!member) continue

    for (let col = 1; col < dates.length; col += 1) {
      const sessionDate = dates[col]
      if (!sessionDate) continue
      const sessionId = sessionByDate.get(sessionDate)
      if (!sessionId) continue
      records.push({
        session_id: sessionId,
        member_id: member.id,
        attendance_status: parseBoolean(row[col]) ? 'present' : 'absent',
      })
    }
  }

  if (records.length > 0) {
    const { error } = await supabase
      .from('attendance_records')
      .upsert(records, { onConflict: 'session_id,member_id' })
    if (error) throw error
  }

  return { sessions: sessionRows.length, records: records.length }
}

async function importPayments(filePath, year) {
  if (!fs.existsSync(filePath)) {
    console.log('Archivo no encontrado, se omite:', filePath)
    return { payments: 0 }
  }

  const { members, exactMap } = await getMembers()
  const wb = XLSX.readFile(filePath, { cellDates: true, cellStyles: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })

  const periods = []
  for (let month = 1; month <= 12; month += 1) {
    periods.push({ payment_year: year, payment_month: month, due_amount: 0, status: 'active' })
  }

  const { error: periodError } = await supabase
    .from('monthly_payment_periods')
    .upsert(periods, { onConflict: 'payment_year,payment_month' })
  if (periodError) throw periodError

  const { data: periodData, error: reloadPeriodError } = await supabase
    .from('monthly_payment_periods')
    .select('id, payment_month')
    .eq('payment_year', year)
  if (reloadPeriodError) throw reloadPeriodError

  const periodByMonth = new Map((periodData ?? []).map((period) => [period.payment_month, period.id]))
  const payments = []

  for (const row of rows.slice(1)) {
    const memberName = clean(row[0])
    const member = findMember(memberName, members, exactMap)
    if (!member) continue

    const rawMonthFlags = row.slice(1, 13).map(parseBoolean)
    const paidMonths = rawMonthFlags.filter(Boolean).length
    const treatAsFullYear = year === 2026 && rawMonthFlags[0] === true && paidMonths === 1

    for (let month = 1; month <= 12; month += 1) {
      const periodId = periodByMonth.get(month)
      if (!periodId) continue
      const isPaid = treatAsFullYear || rawMonthFlags[month - 1] === true
      payments.push({
        member_id: member.id,
        period_id: periodId,
        payment_status: isPaid ? 'paid' : 'pending',
        amount_paid: isPaid ? 0 : 0,
        paid_at: isPaid ? new Date().toISOString() : null,
        notes: `Importado desde ${path.basename(filePath)}`,
      })
    }
  }

  if (payments.length > 0) {
    const { error } = await supabase
      .from('monthly_payments')
      .upsert(payments, { onConflict: 'member_id,period_id' })
    if (error) throw error
  }

  return { payments: payments.length }
}

function parseAccessRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const ws = wb.Sheets['利用者名簿']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
  const parsed = []

  for (let index = 10; index < rows.length; index += 6) {
    const spanishRow = rows[index] ?? []
    const japaneseRow = rows[index + 2] ?? []
    const fullNameValue = clean(spanishRow[1])
    if (!fullNameValue) continue
    parsed.push({
      fullName: fullNameValue,
      gender: clean(spanishRow[2]),
      workSchool: clean(spanishRow[3]) || clean(japaneseRow[3]),
      japaneseName: clean(japaneseRow[1]),
    })
  }

  return parsed
}

async function importAccessList(filePath, listName, dayType) {
  if (!fs.existsSync(filePath)) {
    console.log('Archivo no encontrado, se omite:', filePath)
    return { matched: 0, external: 0 }
  }

  const rows = parseAccessRows(filePath)
  const { members, exactMap } = await getMembers()

  const { data: listData, error: listError } = await supabase
    .from('access_lists')
    .upsert({ name: listName, day_type: dayType, status: 'active' }, { onConflict: 'name' })
    .select('id')
    .single()
  if (listError) throw listError

  const memberRows = []
  const externalRows = []
  const memberUpdates = []

  for (const row of rows) {
    const member = findMember(row.fullName, members, exactMap)
    if (member) {
      memberRows.push({
        access_list_id: listData.id,
        member_id: member.id,
        japanese_name_snapshot: row.japaneseName || member.japanese_name,
        work_school_name_snapshot: row.workSchool || member.work_school_name,
      })
      memberUpdates.push({
        id: member.id,
        japanese_name: row.japaneseName || member.japanese_name,
        work_school_name: row.workSchool || member.work_school_name,
      })
    } else {
      externalRows.push({
        access_list_id: listData.id,
        full_name: row.fullName,
        japanese_name: row.japaneseName || null,
        work_school_name: row.workSchool || null,
        status: 'active',
      })
    }
  }

  if (memberRows.length > 0) {
    const { error } = await supabase
      .from('access_list_members')
      .upsert(memberRows, { onConflict: 'access_list_id,member_id' })
    if (error) throw error
  }

  for (const update of memberUpdates) {
    const { error } = await supabase
      .from('members')
      .update({ japanese_name: update.japanese_name, work_school_name: update.work_school_name })
      .eq('id', update.id)
    if (error) throw error
  }

  if (externalRows.length > 0) {
    const { error } = await supabase.from('access_list_external_people').insert(externalRows)
    if (error) throw error
  }

  return { matched: memberRows.length, external: externalRows.length }
}

async function main() {
  console.log('Importando datos operativos desde:', dataDir)
  const attendance2025 = await importAttendance(files.attendance2025)
  const attendance2026 = await importAttendance(files.attendance2026)
  const payments2025 = await importPayments(files.payments2025, 2025)
  const payments2026 = await importPayments(files.payments2026, 2026)
  const accessWednesday = await importAccessList(files.accessWednesday, 'Miércoles', 'wednesday')
  const accessSunday = await importAccessList(files.accessSunday, 'Domingos', 'sunday')

  console.log('Importación operativa terminada.')
  console.table({
    attendance2025,
    attendance2026,
    payments2025,
    payments2026,
    accessWednesday,
    accessSunday,
  })
}

main().catch((error) => {
  console.error('Error importando datos operativos:')
  console.error(error)
  process.exit(1)
})

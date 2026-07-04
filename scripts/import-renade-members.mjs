import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Falta SUPABASE_URL')
}

if (!serviceRoleKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
}

const filePath =
  process.argv[2] ??
  path.join('data', 'RENADE registro Asociación Aguascalientes 2026.xlsx')

if (!fs.existsSync(filePath)) {
  throw new Error(`No encontré el archivo Excel en: ${filePath}`)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function cleanText(value) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function nullableText(value) {
  const text = cleanText(value)

  if (!text) {
    return null
  }

  if (
    text.toLowerCase() === 'no aplica' ||
    text.toLowerCase() === 'n/a' ||
    text.toLowerCase() === 'na'
  ) {
    return null
  }

  return text
}

function normalizeCurp(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '')
}

function isValidCurp(curp) {
  return /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(curp)
}

function normalizeYesNo(value) {
  const text = cleanText(value).toLowerCase()

  return text === 'si' || text === 'sí' || text === 'yes' || text === 'y'
}

function normalizeGender(value) {
  const text = cleanText(value).toLowerCase()

  if (text === 'masculino' || text === 'hombre' || text === 'h') {
    return 'Masculino'
  }

  if (text === 'femenino' || text === 'mujer' || text === 'm') {
    return 'Femenino'
  }

  if (text) {
    return 'Otro'
  }

  return null
}

function birthDateFromCurp(curp) {
  if (!isValidCurp(curp)) {
    return null
  }

  const yy = Number(curp.slice(4, 6))
  const mm = Number(curp.slice(6, 8))
  const dd = Number(curp.slice(8, 10))

  const currentTwoDigitYear = new Date().getFullYear() % 100
  const fullYear = yy <= currentTwoDigitYear ? 2000 + yy : 1900 + yy

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return null
  }

  return `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function normalizeGrade(value) {
  const raw = cleanText(value)

  if (!raw) {
    return 'No aplica'
  }

  const lower = raw.toLowerCase()

  if (
    lower === 'sin grado' ||
    lower === 'no aplica' ||
    lower === 'n/a' ||
    lower === 'na'
  ) {
    return 'No aplica'
  }

  const normalized = raw
    .replace(/º/g, '°')
    .replace(/\s+/g, ' ')
    .trim()

  const map = {
    '6° Kyu': '6to Kyu',
    '5° Kyu': '5to Kyu',
    '4° Kyu': '4to Kyu',
    '3° Kyu': '3er Kyu',
    '2° Kyu': '2do Kyu',
    '1° Kyu': '1er Kyu',

    '1° Dan': '1er Dan',
    '2° Dan': '2do Dan',
    '3° Dan': '3er Dan',
    '4° Dan': '4to Dan',
    '5° Dan': '5to Dan',
    '6° Dan': '6to Dan',
    '6° Dan Renshi': '6to Dan Renshi',
    '7° Dan': '7mo Dan',
    '7° Dan Renshi': '7mo Dan Renshi',
    '7° Dan Kyoshi': '7mo Dan Kyoshi',
    '8° Dan': '8vo Dan',
    '8° Dan Kyoshi': '8vo Dan Kyoshi',
    '8° Dan Hanshi': '8vo Dan Hanshi',
  }

  return map[normalized] ?? normalized
}

function normalizeMaternalLastName(value) {
  const text = cleanText(value)

  if (!text || text.toLowerCase() === 'no aplica') {
    return {
      maternal_last_name: '.',
      maternal_last_name_not_applicable: true,
    }
  }

  if (text === '.') {
    return {
      maternal_last_name: '.',
      maternal_last_name_not_applicable: true,
    }
  }

  return {
    maternal_last_name: text,
    maternal_last_name_not_applicable: false,
  }
}

function normalizeInteriorNumber(value) {
  const text = cleanText(value)

  if (!text || text.toLowerCase() === 'no aplica') {
    return {
      interior_number: null,
      interior_number_not_applicable: true,
    }
  }

  return {
    interior_number: text,
    interior_number_not_applicable: false,
  }
}

async function getTableMap(tableName, selectColumns, keyColumn) {
  const { data, error } = await supabase.from(tableName).select(selectColumns)

  if (error) {
    throw error
  }

  const map = new Map()

  for (const row of data ?? []) {
    map.set(row[keyColumn], row)
  }

  return map
}

async function main() {
  console.log('Leyendo Excel:', filePath)

  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets.Deportistas

  if (!sheet) {
    throw new Error('No encontré la hoja "Deportistas" en el Excel.')
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  const dataRows = rows.slice(3)

  const parsedRows = []
  const skippedRows = []

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index]

    const dojoName = cleanText(row[0])
    const curp = normalizeCurp(row[1])
    const firstNames = cleanText(row[3])
    const paternalLastName = cleanText(row[4])
    const maternalInfo = normalizeMaternalLastName(row[5])
    const gender = normalizeGender(row[6])
    const educationLevel = nullableText(row[7])
    const currentlyStudying = nullableText(row[8])

    const practicesKendo = normalizeYesNo(row[9])
    const kendoGradeName = normalizeGrade(row[10])

    const practicesIaido = normalizeYesNo(row[11])
    const iaidoGradeName = normalizeGrade(row[12])

    const practicesJodo = normalizeYesNo(row[13])
    const jodoGradeName = normalizeGrade(row[14])

    const state = nullableText(row[15])
    const municipality = nullableText(row[16])
    const neighborhood = nullableText(row[17])
    const street = nullableText(row[18])
    const postalCode = nullableText(row[19])
    const exteriorNumber = nullableText(row[20])
    const interiorInfo = normalizeInteriorNumber(row[21])
    const email = nullableText(row[22])
    const phone = nullableText(row[23])

    const excelRowNumber = index + 4

    if (!curp && !firstNames && !paternalLastName) {
      continue
    }

    if (!isValidCurp(curp)) {
      skippedRows.push({
        excelRowNumber,
        reason: 'CURP inválida',
        curp,
        firstNames,
        paternalLastName,
      })
      continue
    }

    if (!firstNames || !paternalLastName) {
      skippedRows.push({
        excelRowNumber,
        reason: 'Nombre o apellido paterno vacío',
        curp,
        firstNames,
        paternalLastName,
      })
      continue
    }

    parsedRows.push({
      excelRowNumber,
      dojoName: dojoName || 'No definido',
      member: {
        curp,
        first_names: firstNames,
        paternal_last_name: paternalLastName,
        maternal_last_name: maternalInfo.maternal_last_name,
        maternal_last_name_not_applicable:
          maternalInfo.maternal_last_name_not_applicable,

        work_school_name: 'No registrado',
        japanese_name: null,

        birth_date: birthDateFromCurp(curp),
        gender,
        education_level: educationLevel,
        currently_studying: currentlyStudying,

        state,
        municipality,
        neighborhood,
        street,
        postal_code: postalCode,
        exterior_number: exteriorNumber,
        interior_number: interiorInfo.interior_number,
        interior_number_not_applicable:
          interiorInfo.interior_number_not_applicable,

        email,
        phone,
        status: 'active',
      },
      disciplines: [
        {
          disciplineCode: 'kendo',
          practices: practicesKendo,
          gradeName: practicesKendo ? kendoGradeName : 'No aplica',
        },
        {
          disciplineCode: 'iaido',
          practices: practicesIaido,
          gradeName: practicesIaido ? iaidoGradeName : 'No aplica',
        },
        {
          disciplineCode: 'jodo',
          practices: practicesJodo,
          gradeName: practicesJodo ? jodoGradeName : 'No aplica',
        },
      ],
    })
  }

  console.log('Filas válidas:', parsedRows.length)
  console.log('Filas omitidas:', skippedRows.length)

  if (skippedRows.length > 0) {
    console.log('Detalle de omitidas:')
    console.table(skippedRows)
  }

  const uniqueDojos = [...new Set(parsedRows.map((row) => row.dojoName))].map(
    (name) => ({
      name,
      status: 'active',
    }),
  )

  if (uniqueDojos.length > 0) {
    const { error: dojoUpsertError } = await supabase
      .from('dojos')
      .upsert(uniqueDojos, {
        onConflict: 'name',
      })

    if (dojoUpsertError) {
      throw dojoUpsertError
    }
  }

  const dojoMap = await getTableMap('dojos', 'id, name', 'name')
  const disciplineMap = await getTableMap(
    'disciplines',
    'id, code, name',
    'code',
  )

  const { data: grades, error: gradesError } = await supabase
    .from('grade_catalog')
    .select('id, grade_name, discipline_id')

  if (gradesError) {
    throw gradesError
  }

  const gradeMap = new Map()

  for (const grade of grades ?? []) {
    gradeMap.set(`${grade.discipline_id}::${grade.grade_name}`, grade)
  }

  const membersToUpsert = parsedRows.map((row) => {
    const dojo = dojoMap.get(row.dojoName)

    return {
      ...row.member,
      dojo_id: dojo?.id ?? null,
    }
  })

  const { data: upsertedMembers, error: membersError } = await supabase
    .from('members')
    .upsert(membersToUpsert, {
      onConflict: 'curp',
    })
    .select('id, curp')

  if (membersError) {
    throw membersError
  }

  const memberIdByCurp = new Map()

  for (const member of upsertedMembers ?? []) {
    memberIdByCurp.set(member.curp, member.id)
  }

  const memberDisciplinesToUpsert = []

  const missingGrades = []

  for (const parsedRow of parsedRows) {
    const memberId = memberIdByCurp.get(parsedRow.member.curp)

    if (!memberId) {
      continue
    }

    for (const disciplineInput of parsedRow.disciplines) {
      const discipline = disciplineMap.get(disciplineInput.disciplineCode)

      if (!discipline) {
        continue
      }

      const gradeKey = `${discipline.id}::${disciplineInput.gradeName}`
      let grade = gradeMap.get(gradeKey)

      if (!grade) {
        const fallbackKey = `${discipline.id}::No aplica`
        grade = gradeMap.get(fallbackKey)

        missingGrades.push({
          curp: parsedRow.member.curp,
          discipline: disciplineInput.disciplineCode,
          gradeName: disciplineInput.gradeName,
        })
      }

      memberDisciplinesToUpsert.push({
        member_id: memberId,
        discipline_id: discipline.id,
        grade_id: grade?.id ?? null,
        practices: disciplineInput.practices,
      })
    }
  }

  if (memberDisciplinesToUpsert.length > 0) {
    const { error: memberDisciplinesError } = await supabase
      .from('member_disciplines')
      .upsert(memberDisciplinesToUpsert, {
        onConflict: 'member_id,discipline_id',
      })

    if (memberDisciplinesError) {
      throw memberDisciplinesError
    }
  }

  if (missingGrades.length > 0) {
    console.log('Grados no encontrados. Se usó "No aplica":')
    console.table(missingGrades)
  }

  console.log('Importación terminada correctamente.')
  console.log({
    miembrosProcesados: parsedRows.length,
    miembrosOmitidos: skippedRows.length,
    dojosProcesados: uniqueDojos.length,
    disciplinasProcesadas: memberDisciplinesToUpsert.length,
  })
}

main().catch((error) => {
  console.error('Error importando RENADE:')
  console.error(error)
  process.exit(1)
})
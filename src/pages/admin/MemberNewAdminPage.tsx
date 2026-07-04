import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLogo from '../../components/AppLogo'
import { supabase } from '../../lib/supabaseClient'

const PAGE_VERSION = 'Nuevo v04'

type DojoRow = {
  id: string
  name: string
}

type DisciplineCode = 'kendo' | 'iaido' | 'jodo'

type DisciplineInfo = {
  id: string
  code: string
  name: string
}

type GradeRow = {
  id: string
  grade_name: string
  discipline_id: string | null
}

type DisciplineForm = {
  practices: boolean
  grade_id: string
}

type NewMemberForm = {
  curp: string
  first_names: string
  paternal_last_name: string
  maternal_last_name: string
  maternal_last_name_not_applicable: boolean
  work_school_name: string
  japanese_name: string
  birth_date: string
  gender: string
  education_level: string
  currently_studying: string
  dojo_id: string
  email: string
  phone: string
  state: string
  municipality: string
  neighborhood: string
  street: string
  postal_code: string
  exterior_number: string
  interior_number: string
}

const disciplineCodes: DisciplineCode[] = ['kendo', 'iaido', 'jodo']

const disciplineLabels: Record<DisciplineCode, string> = {
  kendo: 'Kendo',
  iaido: 'Iaido',
  jodo: 'Jodo',
}

const initialForm: NewMemberForm = {
  curp: '',
  first_names: '',
  paternal_last_name: '',
  maternal_last_name: '',
  maternal_last_name_not_applicable: false,
  work_school_name: 'No registrado',
  japanese_name: '',
  birth_date: '',
  gender: '',
  education_level: '',
  currently_studying: '',
  dojo_id: '',
  email: '',
  phone: '',
  state: '',
  municipality: '',
  neighborhood: '',
  street: '',
  postal_code: '',
  exterior_number: '',
  interior_number: '',
}

const initialDisciplines: Record<DisciplineCode, DisciplineForm> = {
  kendo: {
    practices: true,
    grade_id: '',
  },
  iaido: {
    practices: false,
    grade_id: '',
  },
  jodo: {
    practices: false,
    grade_id: '',
  },
}

function normalizeCurp(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function isValidCurp(curp: string) {
  return /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(curp)
}

function emptyToNull(value: string) {
  const cleaned = value.trim()
  return cleaned === '' ? null : cleaned
}

function normalizeCode(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function birthDateFromCurp(curp: string) {
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

  return `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(
    2,
    '0',
  )}`
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-200">
        {label}
      </label>

      <input
        className={`w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300 ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
        type={type}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export default function MemberNewAdminPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState<NewMemberForm>(initialForm)
  const [disciplinesForm, setDisciplinesForm] =
    useState<Record<DisciplineCode, DisciplineForm>>(initialDisciplines)

  const [dojos, setDojos] = useState<DojoRow[]>([])
  const [disciplinesCatalog, setDisciplinesCatalog] = useState<
    DisciplineInfo[]
  >([])
  const [grades, setGrades] = useState<GradeRow[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadCatalogs() {
      setLoading(true)
      setErrorMessage(null)

      const { data: dojoData, error: dojoError } = await supabase
        .from('dojos')
        .select('id, name')
        .order('name', { ascending: true })

      if (dojoError) {
        setErrorMessage(dojoError.message)
        setLoading(false)
        return
      }

      const { data: disciplineData, error: disciplineError } = await supabase
        .from('disciplines')
        .select('id, code, name')

      if (disciplineError) {
        setErrorMessage(disciplineError.message)
        setLoading(false)
        return
      }

      const { data: gradeData, error: gradeError } = await supabase
        .from('grade_catalog')
        .select('id, grade_name, discipline_id')


      if (gradeError) {
        setErrorMessage(gradeError.message)
        setLoading(false)
        return
      }

      setDojos(dojoData ?? [])
      setDisciplinesCatalog((disciplineData ?? []) as DisciplineInfo[])
      setGrades((gradeData ?? []) as GradeRow[])
      setLoading(false)
    }

    loadCatalogs()
  }, [])

  function updateForm<K extends keyof NewMemberForm>(
    key: K,
    value: NewMemberForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateDiscipline(
    code: DisciplineCode,
    value: Partial<DisciplineForm>,
  ) {
    setDisciplinesForm((current) => ({
      ...current,
      [code]: {
        ...current[code],
        ...value,
      },
    }))
  }

  function getDisciplineCatalog(code: DisciplineCode) {
    return disciplinesCatalog.find(
      (discipline) => normalizeCode(discipline.code) === code,
    )
  }

  function getGradesByDiscipline(code: DisciplineCode) {
    const discipline = getDisciplineCatalog(code)

    if (!discipline) {
      return []
    }

    return grades.filter(
      (grade) =>
        grade.discipline_id === discipline.id &&
        grade.grade_name !== 'No aplica',
    )
  }

  function getNoAplicaGradeId(code: DisciplineCode) {
    const discipline = getDisciplineCatalog(code)

    if (!discipline) {
      return null
    }

    return (
      grades.find(
        (grade) =>
          grade.discipline_id === discipline.id &&
          grade.grade_name === 'No aplica',
      )?.id ?? null
    )
  }

  async function handleSave() {
    const curp = normalizeCurp(form.curp)
    const birthDate = birthDateFromCurp(curp)

    if (!isValidCurp(curp) || !birthDate) {
      setErrorMessage('La CURP no tiene un formato válido.')
      return
    }

    if (!form.first_names.trim()) {
      setErrorMessage('El nombre no puede estar vacío.')
      return
    }

    if (!form.paternal_last_name.trim()) {
      setErrorMessage('El apellido paterno no puede estar vacío.')
      return
    }

    if (
      !form.maternal_last_name_not_applicable &&
      !form.maternal_last_name.trim()
    ) {
      setErrorMessage('Captura el apellido materno o marca “No aplica”.')
      return
    }

    if (!form.work_school_name.trim()) {
      setErrorMessage('Trabajo/Escuela no puede estar vacío.')
      return
    }

    const hasAtLeastOneDiscipline = Object.values(disciplinesForm).some(
      (discipline) => discipline.practices,
    )

    if (!hasAtLeastOneDiscipline) {
      setErrorMessage('Selecciona al menos una disciplina.')
      return
    }

    const missingDiscipline = disciplineCodes.find(
      (code) => !getDisciplineCatalog(code),
    )

    if (missingDiscipline) {
      setErrorMessage(
        `No se encontró el catálogo de disciplina: ${missingDiscipline}.`,
      )
      return
    }

    setSaving(true)
    setErrorMessage(null)

    const maternalLastName = form.maternal_last_name_not_applicable
      ? '.'
      : form.maternal_last_name.trim()

    const interiorNumber = form.interior_number.trim()

    const { data: insertedMember, error: memberError } = await supabase
      .from('members')
      .insert({
        curp,
        first_names: form.first_names.trim(),
        paternal_last_name: form.paternal_last_name.trim(),
        maternal_last_name: maternalLastName,
        maternal_last_name_not_applicable:
          form.maternal_last_name_not_applicable,

        work_school_name: form.work_school_name.trim(),
        japanese_name: emptyToNull(form.japanese_name),
        birth_date: birthDate,
        gender: emptyToNull(form.gender),
        education_level: emptyToNull(form.education_level),
        currently_studying: emptyToNull(form.currently_studying),
        dojo_id: emptyToNull(form.dojo_id),

        email: emptyToNull(form.email),
        phone: emptyToNull(form.phone),

        state: emptyToNull(form.state),
        municipality: emptyToNull(form.municipality),
        neighborhood: emptyToNull(form.neighborhood),
        street: emptyToNull(form.street),
        postal_code: emptyToNull(form.postal_code),
        exterior_number: emptyToNull(form.exterior_number),
        interior_number: emptyToNull(form.interior_number),
        interior_number_not_applicable: interiorNumber === '',

        status: 'active',
      })
      .select('id')
      .single()

    if (memberError) {
      setErrorMessage(memberError.message)
      setSaving(false)
      return
    }

    const memberDisciplines = disciplineCodes.map((code) => {
      const discipline = getDisciplineCatalog(code)
      const selectedDiscipline = disciplinesForm[code]
      const noAplicaGradeId = getNoAplicaGradeId(code)

      return {
        member_id: insertedMember.id,
        discipline_id: discipline?.id ?? null,
        grade_id: selectedDiscipline.practices
          ? selectedDiscipline.grade_id || noAplicaGradeId
          : noAplicaGradeId,
        practices: selectedDiscipline.practices,
      }
    })

    const { error: disciplineInsertError } = await supabase
      .from('member_disciplines')
      .insert(memberDisciplines)

    if (disciplineInsertError) {
      setErrorMessage(disciplineInsertError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    navigate(`/admin/members/${insertedMember.id}`)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/members')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-bold text-cyan-300 transition active:scale-[0.97]"
              aria-label="Regresar"
              title="Regresar"
            >
              ‹
            </button>

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">
                AEKIA
              </p>

              <h1 className="mt-1 max-w-[230px] truncate text-base font-bold">
                Nuevo miembro
              </h1>

              <p className="mt-0.5 max-w-[230px] truncate text-xs text-slate-400">
                Gestión de miembros
              </p>
            </div>
          </div>

          <AppLogo size="sm" />
        </header>

        {loading && (
          <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-slate-300">Cargando catálogos...</p>
          </section>
        )}

        {!loading && (
          <>
            <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                Alta
              </p>

              <h1 className="mt-2 text-2xl font-bold">Registrar miembro</h1>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                Captura los datos principales, disciplinas y grados. El miembro
                se guardará como activo.
              </p>

              <p className="mt-3 text-xs text-slate-500">
                {PAGE_VERSION} · D:{disciplinesCatalog.length} · G:
                {grades.length}
              </p>
            </section>

            {errorMessage && (
              <section className="mt-5 rounded-3xl border border-red-400/30 bg-red-400/10 p-4">
                <p className="text-sm font-bold text-red-200">Error</p>

                <p className="mt-2 text-sm leading-6 text-red-100">
                  {errorMessage}
                </p>
              </section>
            )}

            <section className="mt-5 space-y-4 pb-8">
              <h2 className="text-lg font-bold">Datos generales</h2>

              <FormField
                label="CURP"
                value={form.curp}
                placeholder="CURP a 18 caracteres"
                onChange={(value) => {
                  const curp = normalizeCurp(value)
                  updateForm('curp', curp)
                  updateForm('birth_date', birthDateFromCurp(curp))
                }}
              />

              <FormField
                label="Nombre(s)"
                value={form.first_names}
                onChange={(value) => updateForm('first_names', value)}
              />

              <FormField
                label="Apellido paterno"
                value={form.paternal_last_name}
                onChange={(value) => updateForm('paternal_last_name', value)}
              />

              <FormField
                label="Apellido materno"
                value={form.maternal_last_name}
                disabled={form.maternal_last_name_not_applicable}
                onChange={(value) => updateForm('maternal_last_name', value)}
              />

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.maternal_last_name_not_applicable}
                  onChange={(event) => {
                    const checked = event.target.checked
                    updateForm('maternal_last_name_not_applicable', checked)
                    updateForm('maternal_last_name', checked ? '.' : '')
                  }}
                />

                <span>No aplica apellido materno</span>
              </label>

              <FormField
                label="Fecha de nacimiento"
                type="date"
                value={form.birth_date}
                disabled
                onChange={(value) => updateForm('birth_date', value)}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Sexo
                </label>

                <select
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  value={form.gender}
                  onChange={(event) => updateForm('gender', event.target.value)}
                >
                  <option value="">No registrado</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <FormField
                label="Trabajo/Escuela"
                value={form.work_school_name}
                onChange={(value) => updateForm('work_school_name', value)}
              />

              <FormField
                label="Nombre japonés"
                value={form.japanese_name}
                onChange={(value) => updateForm('japanese_name', value)}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  Dojo
                </label>

                <select
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                  value={form.dojo_id}
                  onChange={(event) =>
                    updateForm('dojo_id', event.target.value)
                  }
                >
                  <option value="">No registrado</option>

                  {dojos.map((dojo) => (
                    <option key={dojo.id} value={dojo.id}>
                      {dojo.name}
                    </option>
                  ))}
                </select>
              </div>

              <FormField
                label="Nivel educativo"
                value={form.education_level}
                onChange={(value) => updateForm('education_level', value)}
              />

              <FormField
                label="Actualmente estudia"
                value={form.currently_studying}
                onChange={(value) => updateForm('currently_studying', value)}
              />

              <h2 className="pt-4 text-lg font-bold">Disciplinas y grados</h2>

              {disciplineCodes.map((code) => {
                const gradeOptions = getGradesByDiscipline(code)

                return (
                  <div
                    key={code}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const nextValue = !disciplinesForm[code].practices

                        updateDiscipline(code, {
                          practices: nextValue,
                          grade_id: nextValue
                            ? disciplinesForm[code].grade_id
                            : '',
                        })
                      }}
                      className={
                        disciplinesForm[code].practices
                          ? 'w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.98]'
                          : 'w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition active:scale-[0.98]'
                      }
                    >
                      {disciplinesForm[code].practices
                        ? `${disciplineLabels[code]} seleccionado`
                        : `Agregar ${disciplineLabels[code]}`}
                    </button>

                    <select
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                      value={disciplinesForm[code].grade_id}
                      disabled={!disciplinesForm[code].practices}
                      onChange={(event) =>
                        updateDiscipline(code, {
                          grade_id: event.target.value,
                        })
                      }
                    >
                      <option value="">Sin grado / No aplica</option>

                      {gradeOptions.map((grade) => (
                        <option key={grade.id} value={grade.id}>
                          {grade.grade_name}
                        </option>
                      ))}
                    </select>

                    <p className="mt-2 text-xs text-slate-500">
                      Grados disponibles: {gradeOptions.length}
                    </p>
                  </div>
                )
              })}

              <h2 className="pt-4 text-lg font-bold">Contacto</h2>

              <FormField
                label="Correo"
                type="email"
                value={form.email}
                onChange={(value) => updateForm('email', value)}
              />

              <FormField
                label="Teléfono"
                value={form.phone}
                onChange={(value) => updateForm('phone', value)}
              />

              <h2 className="pt-4 text-lg font-bold">Domicilio</h2>

              <FormField
                label="Calle"
                value={form.street}
                onChange={(value) => updateForm('street', value)}
              />

              <FormField
                label="Número exterior"
                value={form.exterior_number}
                onChange={(value) => updateForm('exterior_number', value)}
              />

              <FormField
                label="Número interior"
                value={form.interior_number}
                onChange={(value) => updateForm('interior_number', value)}
              />

              <FormField
                label="Colonia"
                value={form.neighborhood}
                onChange={(value) => updateForm('neighborhood', value)}
              />

              <FormField
                label="Municipio"
                value={form.municipality}
                onChange={(value) => updateForm('municipality', value)}
              />

              <FormField
                label="Estado"
                value={form.state}
                onChange={(value) => updateForm('state', value)}
              />

              <FormField
                label="Código postal"
                value={form.postal_code}
                onChange={(value) => updateForm('postal_code', value)}
              />

              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => navigate('/admin/members')}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition active:scale-[0.98]"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
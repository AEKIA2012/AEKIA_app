import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLogo from '../../components/AppLogo'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'

const PAGE_VERSION = 'Editar v06'

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

type MemberForm = {
  id: string
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
  currently_studying_not_applicable: boolean
  dojo_id: string
  state: string
  municipality: string
  neighborhood: string
  street: string
  postal_code: string
  exterior_number: string
  interior_number: string
  interior_number_not_applicable: boolean
  email: string
  phone: string
}

const disciplineCodes: DisciplineCode[] = ['kendo', 'iaido', 'jodo']

const disciplineLabels: Record<DisciplineCode, string> = {
  kendo: 'Kendo',
  iaido: 'Iaido',
  jodo: 'Jodo',
}

const initialDisciplines: Record<DisciplineCode, DisciplineForm> = {
  kendo: {
    practices: false,
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

function emptyToNull(value: string) {
  const cleaned = value.trim()
  return cleaned === '' ? null : cleaned
}

function normalizeCode(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function isValidCurp(curp: string) {
  return /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(curp)
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

function getGradeWeight(gradeName: string) {
  const normalized = gradeName.toLowerCase()

  if (normalized === 'no aplica') return 0
  if (normalized.includes('6to kyu')) return 10
  if (normalized.includes('5to kyu')) return 20
  if (normalized.includes('4to kyu')) return 30
  if (normalized.includes('3er kyu')) return 40
  if (normalized.includes('2do kyu')) return 50
  if (normalized.includes('1er kyu')) return 60
  if (normalized.includes('1er dan')) return 70
  if (normalized.includes('2do dan')) return 80
  if (normalized.includes('3er dan')) return 90
  if (normalized.includes('4to dan')) return 100
  if (normalized.includes('5to dan')) return 110
  if (normalized.includes('6to dan')) return 120
  if (normalized.includes('7mo dan')) return 130
  if (normalized.includes('8vo dan')) return 140

  return 999
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

export default function MemberEditAdminPage() {
  const navigate = useNavigate()
  const { memberId } = useParams()
  const { permissions } = useCurrentAccess()
  const canEditJapaneseName = permissionImplies(permissions, 'members.japanese_name.edit')

  const [form, setForm] = useState<MemberForm | null>(null)
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
    async function loadData() {
      if (!memberId) {
        setErrorMessage('No se recibió el ID del miembro.')
        setLoading(false)
        return
      }

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

      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(
          `
          id,
          curp,
          first_names,
          paternal_last_name,
          maternal_last_name,
          maternal_last_name_not_applicable,
          work_school_name,
          japanese_name,
          birth_date,
          gender,
          education_level,
          currently_studying,
          dojo_id,
          state,
          municipality,
          neighborhood,
          street,
          postal_code,
          exterior_number,
          interior_number,
          interior_number_not_applicable,
          email,
          phone
        `,
        )
        .eq('id', memberId)
        .maybeSingle()

      if (memberError) {
        setErrorMessage(memberError.message)
        setLoading(false)
        return
      }

      if (!memberData) {
        setErrorMessage('No se encontró el miembro solicitado.')
        setLoading(false)
        return
      }

      const { data: memberDisciplinesData, error: memberDisciplinesError } =
        await supabase
          .from('member_disciplines')
          .select('discipline_id, grade_id, practices')
          .eq('member_id', memberId)

      if (memberDisciplinesError) {
        setErrorMessage(memberDisciplinesError.message)
        setLoading(false)
        return
      }

      const loadedDisciplines: Record<DisciplineCode, DisciplineForm> = {
        kendo: { practices: false, grade_id: '' },
        iaido: { practices: false, grade_id: '' },
        jodo: { practices: false, grade_id: '' },
      }

      for (const code of disciplineCodes) {
        const discipline = (disciplineData ?? []).find(
          (item) => normalizeCode(item.code) === code,
        )

        const currentMemberDiscipline = (
          memberDisciplinesData ?? []
        ).find((item) => item.discipline_id === discipline?.id)

        const currentGrade = (gradeData ?? []).find(
          (grade) => grade.id === currentMemberDiscipline?.grade_id,
        )

        loadedDisciplines[code] = {
          practices: currentMemberDiscipline?.practices ?? false,
          grade_id:
            currentGrade?.grade_name === 'No aplica'
              ? ''
              : currentMemberDiscipline?.grade_id ?? '',
        }
      }

      const calculatedBirthDate = birthDateFromCurp(memberData.curp ?? '')

      setDojos(dojoData ?? [])
      setDisciplinesCatalog((disciplineData ?? []) as DisciplineInfo[])
      setGrades((gradeData ?? []) as GradeRow[])
      setDisciplinesForm(loadedDisciplines)

      setForm({
        id: memberData.id,
        curp: memberData.curp ?? '',
        first_names: memberData.first_names ?? '',
        paternal_last_name: memberData.paternal_last_name ?? '',
        maternal_last_name: memberData.maternal_last_name ?? '',
        maternal_last_name_not_applicable: Boolean(
          memberData.maternal_last_name_not_applicable ??
            memberData.maternal_last_name === '.',
        ),
        work_school_name: memberData.work_school_name ?? '',
        japanese_name: memberData.japanese_name ?? '',
        birth_date: calculatedBirthDate || memberData.birth_date || '',
        gender: memberData.gender ?? '',
        education_level: memberData.education_level ?? '',
        currently_studying: memberData.currently_studying ?? '',
        currently_studying_not_applicable: memberData.currently_studying === 'No aplica',
        dojo_id: memberData.dojo_id ?? '',
        state: memberData.state ?? '',
        municipality: memberData.municipality ?? '',
        neighborhood: memberData.neighborhood ?? '',
        street: memberData.street ?? '',
        postal_code: memberData.postal_code ?? '',
        exterior_number: memberData.exterior_number ?? '',
        interior_number: memberData.interior_number ?? '',
        interior_number_not_applicable: Boolean(memberData.interior_number_not_applicable || memberData.interior_number === 'No aplica'),
        email: memberData.email ?? '',
        phone: memberData.phone ?? '',
      })

      setLoading(false)
    }

    loadData()
  }, [memberId])

  function updateForm<K extends keyof MemberForm>(key: K, value: MemberForm[K]) {
    if (!form) {
      return
    }

    setForm({
      ...form,
      [key]: value,
    })
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

    return grades
      .filter(
        (grade) =>
          grade.discipline_id === discipline.id &&
          grade.grade_name !== 'No aplica',
      )
      .sort((a, b) => {
        return (
          getGradeWeight(a.grade_name) - getGradeWeight(b.grade_name) ||
          a.grade_name.localeCompare(b.grade_name)
        )
      })
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
    if (!form) {
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

    const birthDate = birthDateFromCurp(form.curp)

    const { error: memberError } = await supabase
      .from('members')
      .update({
        first_names: form.first_names.trim(),
        paternal_last_name: form.paternal_last_name.trim(),
        maternal_last_name: maternalLastName,
        maternal_last_name_not_applicable:
          form.maternal_last_name_not_applicable,

        work_school_name: form.work_school_name.trim(),
        japanese_name: emptyToNull(form.japanese_name),
        birth_date: emptyToNull(birthDate),
        gender: emptyToNull(form.gender),
        education_level: emptyToNull(form.education_level),
        currently_studying: form.currently_studying_not_applicable ? 'No aplica' : emptyToNull(form.currently_studying),
        dojo_id: emptyToNull(form.dojo_id),

        state: emptyToNull(form.state),
        municipality: emptyToNull(form.municipality),
        neighborhood: emptyToNull(form.neighborhood),
        street: emptyToNull(form.street),
        postal_code: emptyToNull(form.postal_code),
        exterior_number: emptyToNull(form.exterior_number),
        interior_number: form.interior_number_not_applicable ? 'No aplica' : emptyToNull(form.interior_number),
        interior_number_not_applicable: form.interior_number_not_applicable,

        email: emptyToNull(form.email),
        phone: emptyToNull(form.phone),
      })
      .eq('id', form.id)

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
        member_id: form.id,
        discipline_id: discipline?.id ?? null,
        grade_id: selectedDiscipline.practices
          ? selectedDiscipline.grade_id || noAplicaGradeId
          : noAplicaGradeId,
        practices: selectedDiscipline.practices,
      }
    })

    const { error: disciplineError } = await supabase
      .from('member_disciplines')
      .upsert(memberDisciplines, {
        onConflict: 'member_id,discipline_id',
      })

    if (disciplineError) {
      setErrorMessage(disciplineError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    navigate(`/admin/members/${form.id}`, { state: { aekiaSaved: 'Datos del miembro actualizados correctamente.' } })
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() =>
                memberId
                  ? navigate(`/admin/members/${memberId}`)
                  : navigate('/admin/members')
              }
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
                Editar miembro
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
            <p className="text-sm text-slate-300">
              Cargando datos del miembro...
            </p>
          </section>
        )}

        {!loading && errorMessage && !form && (
          <section className="mt-6 rounded-3xl border border-red-400/30 bg-red-400/10 p-4">
            <p className="text-sm font-bold text-red-200">Error</p>

            <p className="mt-2 text-sm leading-6 text-red-100">
              {errorMessage}
            </p>
          </section>
        )}

        {!loading && form && (
          <>
            <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                Edición
              </p>

              <h1 className="mt-2 text-2xl font-bold">Datos del miembro</h1>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                Actualiza información general, contacto, domicilio, dojo,
                disciplinas y grados.
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
                disabled={!canEditJapaneseName}
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
                disabled={form.currently_studying_not_applicable}
                onChange={(value) => updateForm('currently_studying', value)}
              />

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.currently_studying_not_applicable}
                  onChange={(event) => {
                    const checked = event.target.checked
                    updateForm('currently_studying_not_applicable', checked)
                    updateForm('currently_studying', checked ? 'No aplica' : '')
                  }}
                />
                <span>No aplica cursando</span>
              </label>

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
                disabled={form.interior_number_not_applicable}
                onChange={(value) => updateForm('interior_number', value)}
              />

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.interior_number_not_applicable}
                  onChange={(event) => {
                    const checked = event.target.checked
                    updateForm('interior_number_not_applicable', checked)
                    updateForm('interior_number', checked ? 'No aplica' : '')
                  }}
                />
                <span>No aplica número interior</span>
              </label>

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
                  onClick={() => navigate(`/admin/members/${form.id}`)}
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

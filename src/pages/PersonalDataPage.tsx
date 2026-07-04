import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../components/ModuleShell'
import { Field, PrimaryButton, SelectField } from '../components/FormControls'
import { supabase } from '../lib/supabaseClient'
import { birthDateFromCurp, calculateAgeFromBirthDate, emptyToNull, getBirthdayFromCurp, isValidCurp, normalizeCurp } from '../lib/helpers'
import { useCurrentProfile } from '../lib/useCurrentProfile'

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

type DojoRow = { id: string; name: string }
type DisciplineCode = 'kendo' | 'iaido' | 'jodo'
type DisciplineRow = { id: string; code: string; name: string }
type GradeRow = { id: string; discipline_id: string; grade_name: string }
type DisciplineForm = { practices: boolean; grade_id: string }

const disciplineCodes: DisciplineCode[] = ['kendo', 'iaido', 'jodo']
const disciplineLabels: Record<DisciplineCode, string> = { kendo: 'Kendo', iaido: 'Iaido', jodo: 'Jodo' }

const educationOptions = [
  { value: '', label: 'No registrado' },
  { value: 'No aplica', label: 'No aplica' },
  { value: 'Kinder', label: 'Kinder' },
  { value: 'Primaria', label: 'Primaria' },
  { value: 'Secundaria', label: 'Secundaria' },
  { value: 'Bachillerato', label: 'Bachillerato' },
  { value: 'Universidad', label: 'Universidad' },
  { value: 'Maestría', label: 'Maestría' },
  { value: 'Doctorado', label: 'Doctorado' },
  { value: 'Otros', label: 'Otros' },
]

const genderOptions = [
  { value: '', label: 'No registrado' },
  { value: 'Masculino', label: 'Masculino' },
  { value: 'Femenino', label: 'Femenino' },
  { value: 'Otro', label: 'Otro' },
]

function normalizeCode(value: string | null | undefined): DisciplineCode | null {
  const clean = String(value ?? '').trim().toLowerCase()
  if (clean.includes('kendo')) return 'kendo'
  if (clean.includes('iaido')) return 'iaido'
  if (clean.includes('jodo')) return 'jodo'
  return null
}

function getGradeWeight(name: string) {
  const lower = name.toLowerCase()
  const kyu = lower.match(/(\d+)\s*kyu/)
  if (kyu) return 100 - Number(kyu[1])
  const dan = lower.match(/(\d+)/)
  if (lower.includes('dan') && dan) return 100 + Number(dan[1])
  if (lower.includes('no aplica')) return -1
  return 999
}


function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${checked ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-200'}`}>
      <input
        type="checkbox"
        className="h-5 w-5 accent-cyan-300"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export default function PersonalDataPage() {
  const { profile, loadingProfile, profileError } = useCurrentProfile()
  const [form, setForm] = useState<MemberForm | null>(null)
  const [disciplinesForm, setDisciplinesForm] = useState<Record<DisciplineCode, DisciplineForm>>({
    kendo: { practices: false, grade_id: '' },
    iaido: { practices: false, grade_id: '' },
    jodo: { practices: false, grade_id: '' },
  })
  const [dojos, setDojos] = useState<DojoRow[]>([])
  const [disciplines, setDisciplines] = useState<DisciplineRow[]>([])
  const [grades, setGrades] = useState<GradeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disciplinesDirty, setDisciplinesDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      if (loadingProfile) return

      if (!profile?.member_id) {
        setErrorMessage(profileError ?? 'Tu usuario todavía no está vinculado a un miembro.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage(null)

      const { data: dojoData, error: dojoError } = await supabase.from('dojos').select('id, name').order('name')
      if (dojoError) { setErrorMessage(dojoError.message); setLoading(false); return }

      const { data: disciplineData, error: disciplineError } = await supabase.from('disciplines').select('id, code, name')
      if (disciplineError) { setErrorMessage(disciplineError.message); setLoading(false); return }

      const { data: gradeData, error: gradeError } = await supabase.from('grade_catalog').select('id, grade_name, discipline_id')
      if (gradeError) { setErrorMessage(gradeError.message); setLoading(false); return }

      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('id, curp, first_names, paternal_last_name, maternal_last_name, maternal_last_name_not_applicable, work_school_name, japanese_name, birth_date, gender, education_level, currently_studying, dojo_id, state, municipality, neighborhood, street, postal_code, exterior_number, interior_number, interior_number_not_applicable, email, phone')
        .eq('id', profile.member_id)
        .maybeSingle()
      if (memberError) { setErrorMessage(memberError.message); setLoading(false); return }
      if (!memberData) { setErrorMessage('No se encontró tu ficha de miembro.'); setLoading(false); return }

      const { data: memberDisciplinesData, error: memberDisciplinesError } = await supabase
        .from('member_disciplines')
        .select('discipline_id, grade_id, practices')
        .eq('member_id', profile.member_id)
      if (memberDisciplinesError) { setErrorMessage(memberDisciplinesError.message); setLoading(false); return }

      const loadedDisciplines: Record<DisciplineCode, DisciplineForm> = {
        kendo: { practices: false, grade_id: '' },
        iaido: { practices: false, grade_id: '' },
        jodo: { practices: false, grade_id: '' },
      }

      for (const item of disciplineData ?? []) {
        const code = normalizeCode(item.code)
        if (!code) continue
        const current = (memberDisciplinesData ?? []).find((row) => row.discipline_id === item.id)
        const currentGrade = (gradeData ?? []).find((grade) => grade.id === current?.grade_id)
        loadedDisciplines[code] = {
          practices: Boolean(current?.practices),
          grade_id: currentGrade?.grade_name === 'No aplica' ? '' : current?.grade_id ?? '',
        }
      }

      const curp = memberData.curp ?? ''
      const currentlyStudying = memberData.currently_studying ?? ''
      setDojos(dojoData ?? [])
      setDisciplines((disciplineData ?? []) as DisciplineRow[])
      setGrades((gradeData ?? []) as GradeRow[])
      setDisciplinesForm(loadedDisciplines)
      setDisciplinesDirty(false)
      setForm({
        id: memberData.id,
        curp,
        first_names: memberData.first_names ?? '',
        paternal_last_name: memberData.paternal_last_name ?? '',
        maternal_last_name: memberData.maternal_last_name ?? '',
        maternal_last_name_not_applicable: Boolean(memberData.maternal_last_name_not_applicable || memberData.maternal_last_name === '.'),
        work_school_name: memberData.work_school_name ?? '',
        japanese_name: memberData.japanese_name ?? '',
        birth_date: birthDateFromCurp(curp) || memberData.birth_date || '',
        gender: memberData.gender ?? '',
        education_level: memberData.education_level ?? '',
        currently_studying: currentlyStudying,
        currently_studying_not_applicable: currentlyStudying === 'No aplica',
        dojo_id: memberData.dojo_id ?? '',
        state: memberData.state ?? '',
        municipality: memberData.municipality ?? '',
        neighborhood: memberData.neighborhood ?? '',
        street: memberData.street ?? '',
        postal_code: memberData.postal_code ?? '',
        exterior_number: memberData.exterior_number ?? '',
        interior_number: memberData.interior_number ?? '',
        interior_number_not_applicable: Boolean(memberData.interior_number_not_applicable || memberData.interior_number === 'No aplica'),
        email: memberData.email ?? profile.email ?? '',
        phone: memberData.phone ?? '',
      })
      setLoading(false)
    }

    loadData()
  }, [loadingProfile, profile, profileError])

  function updateForm<K extends keyof MemberForm>(key: K, value: MemberForm[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }

  function updateFormPatch(patch: Partial<MemberForm>) {
    setForm((current) => current ? { ...current, ...patch } : current)
  }

  function updateDiscipline(code: DisciplineCode, value: Partial<DisciplineForm>) {
    setDisciplinesDirty(true)
    setDisciplinesForm((current) => ({ ...current, [code]: { ...current[code], ...value } }))
  }

  function getDisciplineCatalog(code: DisciplineCode) {
    return disciplines.find((discipline) => normalizeCode(discipline.code) === code)
  }

  function getNoAplicaGradeId(code: DisciplineCode) {
    const discipline = getDisciplineCatalog(code)
    return grades.find((grade) => grade.discipline_id === discipline?.id && grade.grade_name === 'No aplica')?.id ?? null
  }

  function getGradesByDiscipline(code: DisciplineCode) {
    const discipline = getDisciplineCatalog(code)
    return grades
      .filter((grade) => grade.discipline_id === discipline?.id && grade.grade_name !== 'No aplica')
      .sort((a, b) => getGradeWeight(a.grade_name) - getGradeWeight(b.grade_name) || a.grade_name.localeCompare(b.grade_name))
  }

  async function handleSave() {
    if (!form) return

    const curp = normalizeCurp(form.curp)
    const birthDate = birthDateFromCurp(curp)

    if (!isValidCurp(curp) || !birthDate) {
      setErrorMessage('La CURP no tiene un formato válido.')
      return
    }

    if (!form.first_names.trim() || !form.paternal_last_name.trim()) {
      setErrorMessage('Nombre y apellido paterno son obligatorios.')
      return
    }

    if (!form.maternal_last_name_not_applicable && !form.maternal_last_name.trim()) {
      setErrorMessage('Captura el apellido materno o marca “No aplica”.')
      return
    }

    setSaving(true)
    setMessage(null)
    setErrorMessage(null)

    const { error } = await supabase
      .from('members')
      .update({
        curp,
        first_names: form.first_names.trim(),
        paternal_last_name: form.paternal_last_name.trim(),
        maternal_last_name: form.maternal_last_name_not_applicable ? '.' : form.maternal_last_name.trim(),
        maternal_last_name_not_applicable: form.maternal_last_name_not_applicable,
        work_school_name: form.work_school_name.trim(),
        birth_date: birthDate,
        gender: emptyToNull(form.gender),
        education_level: emptyToNull(form.education_level),
        currently_studying: form.currently_studying_not_applicable ? 'No aplica' : emptyToNull(form.currently_studying),
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

    if (error) { setErrorMessage(error.message); setSaving(false); return }

    const memberDisciplines = disciplineCodes.map((code) => {
      const discipline = getDisciplineCatalog(code)
      const selected = disciplinesForm[code]
      const noAplicaGradeId = getNoAplicaGradeId(code)
      return {
        member_id: form.id,
        discipline_id: discipline?.id ?? null,
        practices: selected.practices,
        grade_id: selected.practices ? selected.grade_id || noAplicaGradeId : noAplicaGradeId,
      }
    }).filter((row) => row.discipline_id)

    let disciplineError: { message: string } | null = null
    if (disciplinesDirty) {
      const { error: rpcError } = await supabase.rpc('aekia_save_my_member_disciplines', { p_items: memberDisciplines })
      disciplineError = rpcError
    }

    setSaving(false)

    if (disciplineError) { setErrorMessage(disciplineError.message); return }
    setDisciplinesDirty(false)
    setMessage('Datos guardados correctamente.')
  }

  const selectedDojoName = useMemo(() => dojos.find((dojo) => dojo.id === form?.dojo_id)?.name ?? 'No registrado', [dojos, form?.dojo_id])

  return (
    <ModuleShell title="Datos personales" subtitle="Consulta y actualiza tu información básica." icon="/icons/icon-personal-data.png" moduleType="Usuario" version="Datos personales v08">
      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando datos personales...</section>}
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      {message && <section className="rounded-3xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">{message}</section>}

      {form && (
        <>
          <button type="button" onClick={() => alert('Se notificó a un administrador para reiniciar tu password.')} className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-400/15 px-4 py-3 text-sm font-bold text-emerald-100 transition active:scale-[0.98]">Restablecer Password</button>

          <Field label="CURP" value={form.curp} required onChange={(value) => { const curp = normalizeCurp(value); updateFormPatch({ curp, birth_date: birthDateFromCurp(curp) }) }} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Edad</p><p className="mt-1 text-2xl font-bold">{calculateAgeFromBirthDate(form.birth_date) || '-'}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Cumpleaños</p><p className="mt-1 text-2xl font-bold">{getBirthdayFromCurp(form.curp) || '-'}</p></div>
          </div>

          <Field label="Nombre(s)" value={form.first_names} required onChange={(value) => updateForm('first_names', value)} />
          <Field label="Apellido paterno" value={form.paternal_last_name} required onChange={(value) => updateForm('paternal_last_name', value)} />
          <Field label="Apellido materno" value={form.maternal_last_name} required disabled={form.maternal_last_name_not_applicable} onChange={(value) => updateForm('maternal_last_name', value)} />
          <CheckRow checked={form.maternal_last_name_not_applicable} onChange={(checked) => updateFormPatch({ maternal_last_name_not_applicable: checked, maternal_last_name: checked ? '.' : '' })} label="No aplica apellido materno" />

          <Field label="Nombre trabajo/escuela" value={form.work_school_name} required onChange={(value) => updateForm('work_school_name', value)} />
          <Field label="Nombre japonés" value={form.japanese_name} disabled onChange={() => undefined} />
          <Field label="Dojo" value={selectedDojoName} disabled onChange={() => undefined} />
          <SelectField label="Género" value={form.gender} onChange={(value) => updateForm('gender', value)} options={genderOptions} />
          <SelectField label="Escolaridad" value={form.education_level} onChange={(value) => updateForm('education_level', value)} options={educationOptions} />
          <Field label="Cursando" value={form.currently_studying} disabled={form.currently_studying_not_applicable} onChange={(value) => updateForm('currently_studying', value)} />
          <CheckRow checked={form.currently_studying_not_applicable} onChange={(checked) => updateFormPatch({ currently_studying_not_applicable: checked, currently_studying: checked ? 'No aplica' : '' })} label="No aplica cursando" />

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Disciplinas y grados</p>
            <div className="mt-4 space-y-4">
              {disciplineCodes.map((code) => (
                <div key={code} className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                  <label className="mb-3 flex items-center gap-3 text-sm font-semibold text-slate-200"><input type="checkbox" checked={disciplinesForm[code].practices} onChange={(event) => updateDiscipline(code, { practices: event.target.checked, grade_id: event.target.checked ? disciplinesForm[code].grade_id : '' })} />{disciplineLabels[code]}</label>
                  <SelectField label="Grado" value={disciplinesForm[code].grade_id} disabled={!disciplinesForm[code].practices} onChange={(value) => updateDiscipline(code, { grade_id: value })} options={[{ value: '', label: 'Sin grado / No aplica' }, ...getGradesByDiscipline(code).map((grade) => ({ value: grade.id, label: grade.grade_name }))]} />
                </div>
              ))}
            </div>
          </section>

          <Field label="Estado" value={form.state} onChange={(value) => updateForm('state', value)} />
          <Field label="Municipio" value={form.municipality} onChange={(value) => updateForm('municipality', value)} />
          <Field label="Colonia" value={form.neighborhood} onChange={(value) => updateForm('neighborhood', value)} />
          <Field label="Calle" value={form.street} onChange={(value) => updateForm('street', value)} />
          <Field label="CP" value={form.postal_code} onChange={(value) => updateForm('postal_code', value)} />
          <Field label="Núm. Ext" value={form.exterior_number} onChange={(value) => updateForm('exterior_number', value)} />
          <Field label="Núm. Int" value={form.interior_number} disabled={form.interior_number_not_applicable} onChange={(value) => updateForm('interior_number', value)} />
          <CheckRow checked={form.interior_number_not_applicable} onChange={(checked) => updateFormPatch({ interior_number_not_applicable: checked, interior_number: checked ? 'No aplica' : '' })} label="No aplica número interior" />

          <Field label="Correo" type="email" value={form.email} onChange={(value) => updateForm('email', value)} />
          <Field label="Teléfono" value={form.phone} onChange={(value) => updateForm('phone', value)} />
          <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</PrimaryButton>
        </>
      )}
    </ModuleShell>
  )
}

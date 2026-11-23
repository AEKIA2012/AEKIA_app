import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'

type RelatedOne<T> = T | T[] | null

type DojoInfo = {
  name: string
}

type DisciplineInfo = {
  code: string
  name: string
}

type GradeInfo = {
  grade_name: string
}

type MemberDisciplineRow = {
  id: string
  practices: boolean
  disciplines: RelatedOne<DisciplineInfo>
  grade_catalog: RelatedOne<GradeInfo>
}

type MemberRow = {
  id: string
  curp: string
  first_names: string
  paternal_last_name: string
  maternal_last_name: string
  work_school_name: string
  birth_date: string | null
  gender: string | null
  education_level: string | null
  currently_studying: string | null
  state: string | null
  municipality: string | null
  neighborhood: string | null
  street: string | null
  postal_code: string | null
  exterior_number: string | null
  interior_number: string | null
  email: string | null
  phone: string | null
  status: string
  dojos: RelatedOne<DojoInfo>
  member_disciplines: MemberDisciplineRow[]
}

type StatusFilter = 'all' | 'active' | 'inactive'
type DisciplineFilter = 'kendo' | 'iaido' | 'jodo'

const disciplineOptions: { code: DisciplineFilter; label: string }[] = [
  { code: 'kendo', label: 'Kendo' },
  { code: 'iaido', label: 'Iaido' },
  { code: 'jodo', label: 'Jodo' },
]

const allDisciplineFilters: DisciplineFilter[] = ['kendo', 'iaido', 'jodo']

function getOne<T>(value: RelatedOne<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function escapeCsv(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function calculateAge(birthDate: string | null) {
  if (!birthDate) {
    return ''
  }

  const birth = new Date(`${birthDate}T00:00:00`)
  const today = new Date()

  let age = today.getFullYear() - birth.getFullYear()
  const monthDifference = today.getMonth() - birth.getMonth()

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birth.getDate())
  ) {
    age -= 1
  }

  return age
}

function gradeToRenade(gradeName: string | null | undefined) {
  if (!gradeName || gradeName === 'No aplica') {
    return 'Sin grado'
  }

  const map: Record<string, string> = {
    '6to Kyu': '6° Kyu',
    '5to Kyu': '5° Kyu',
    '4to Kyu': '4° Kyu',
    '3er Kyu': '3° Kyu',
    '2do Kyu': '2° Kyu',
    '1er Kyu': '1° Kyu',

    '1er Dan': '1° Dan',
    '2do Dan': '2° Dan',
    '3er Dan': '3° Dan',
    '4to Dan': '4° Dan',
    '5to Dan': '5° Dan',
    '6to Dan': '6° Dan',
    '6to Dan Renshi': '6° Dan Renshi',
    '7mo Dan': '7° Dan',
    '7mo Dan Renshi': '7° Dan Renshi',
    '7mo Dan Kyoshi': '7° Dan Kyoshi',
    '8vo Dan': '8° Dan',
    '8vo Dan Kyoshi': '8° Dan Kyoshi',
    '8vo Dan Hanshi': '8° Dan Hanshi',
  }

  return map[gradeName] ?? gradeName
}

function getDiscipline(member: MemberRow, disciplineCode: DisciplineFilter) {
  return (
    member.member_disciplines.find((item) => {
      const discipline = getOne(item.disciplines)
      return discipline?.code === disciplineCode
    }) ?? null
  )
}

function practicesDiscipline(
  member: MemberRow,
  disciplineCode: DisciplineFilter,
) {
  const discipline = getDiscipline(member, disciplineCode)
  return discipline?.practices === true
}

function getDisciplineGrade(
  member: MemberRow,
  disciplineCode: DisciplineFilter,
) {
  const discipline = getDiscipline(member, disciplineCode)

  if (!discipline?.practices) {
    return 'Sin grado'
  }

  const grade = getOne(discipline.grade_catalog)
  return gradeToRenade(grade?.grade_name)
}

function getDisciplinesSummary(member: MemberRow) {
  const activeDisciplines = disciplineOptions
    .filter((option) => practicesDiscipline(member, option.code))
    .map((option) => option.label)

  return activeDisciplines.length > 0
    ? activeDisciplines.join(', ')
    : 'Sin disciplina'
}

export default function MembersAdminPage() {
  const navigate = useNavigate()
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'members.edit')

  const [members, setMembers] = useState<MemberRow[]>([])
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [disciplineFilters, setDisciplineFilters] =
    useState<DisciplineFilter[]>(allDisciplineFilters)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadMembers() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase
        .from('members')
        .select(
          `
          id,
          curp,
          first_names,
          paternal_last_name,
          maternal_last_name,
          work_school_name,
          birth_date,
          gender,
          education_level,
          currently_studying,
          state,
          municipality,
          neighborhood,
          street,
          postal_code,
          exterior_number,
          interior_number,
          email,
          phone,
          status,
          dojos (
            name
          ),
          member_disciplines (
            id,
            practices,
            disciplines (
              code,
              name
            ),
            grade_catalog (
              grade_name
            )
          )
        `,
        )
        .order('paternal_last_name', { ascending: true })
        .order('maternal_last_name', { ascending: true })
        .order('first_names', { ascending: true })

      if (error) {
        setErrorMessage(error.message)
        setMembers([])
        setLoading(false)
        return
      }

      setMembers((data ?? []) as unknown as MemberRow[])
      setLoading(false)
    }

    loadMembers()
  }, [])

  const totalActive = useMemo(() => {
    return members.filter((member) => member.status === 'active').length
  }, [members])

  const totalInactive = useMemo(() => {
    return members.filter((member) => member.status === 'inactive').length
  }, [members])

  const filteredMembers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()

    return members.filter((member) => {
      const dojo = getOne(member.dojos)
      const disciplinesSummary = getDisciplinesSummary(member)

      const fullName =
        `${member.first_names} ${member.paternal_last_name} ${member.maternal_last_name}`.toLowerCase()

      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        member.curp.toLowerCase().includes(normalizedSearch) ||
        member.work_school_name.toLowerCase().includes(normalizedSearch) ||
        (member.email ?? '').toLowerCase().includes(normalizedSearch) ||
        (member.phone ?? '').toLowerCase().includes(normalizedSearch) ||
        (dojo?.name ?? '').toLowerCase().includes(normalizedSearch) ||
        disciplinesSummary.toLowerCase().includes(normalizedSearch)

      const matchesStatus =
        statusFilter === 'all' || member.status === statusFilter

      const matchesDiscipline =
        disciplineFilters.length === disciplineOptions.length ||
        disciplineFilters.some((disciplineCode) =>
          practicesDiscipline(member, disciplineCode),
        )

      return matchesSearch && matchesStatus && matchesDiscipline
    })
  }, [members, searchText, statusFilter, disciplineFilters])

  function toggleDisciplineFilter(disciplineCode: DisciplineFilter) {
    setDisciplineFilters((current) => {
      if (current.includes(disciplineCode)) {
        return current.filter((item) => item !== disciplineCode)
      }

      return [...current, disciplineCode]
    })
  }

  function handleExportCsv() {
    const headers = [
      'Dojo',
      'Curp',
      'Edad',
      'Nombre',
      'Apellido Paterno',
      'Apellido Materno',
      'Género',
      'Escolaridad',
      'Cursando',
      'Kendo',
      'Grado',
      'Iaido',
      'Grado',
      'Jodo',
      'Grado',
      'Estado',
      'Municipio',
      'Colonia',
      'Calle',
      'CP',
      'Núm. Ext',
      'Núm Int',
      'Correo',
      'Teléfono',
    ]

    const rows = filteredMembers.map((member) => {
      const dojo = getOne(member.dojos)

      return [
        dojo?.name ?? '',
        member.curp,
        calculateAge(member.birth_date),
        member.first_names,
        member.paternal_last_name,
        member.maternal_last_name,
        member.gender ?? '',
        member.education_level ?? '',
        member.currently_studying ?? '',

        practicesDiscipline(member, 'kendo') ? 'Si' : 'No',
        getDisciplineGrade(member, 'kendo'),

        practicesDiscipline(member, 'iaido') ? 'Si' : 'No',
        getDisciplineGrade(member, 'iaido'),

        practicesDiscipline(member, 'jodo') ? 'Si' : 'No',
        getDisciplineGrade(member, 'jodo'),

        member.state ?? '',
        member.municipality ?? '',
        member.neighborhood ?? '',
        member.street ?? '',
        member.postal_code ?? '',
        member.exterior_number ?? '',
        member.interior_number ?? '',
        member.email ?? '',
        member.phone ?? '',
      ]
    })

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n')

    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'RENADE-miembros-AEKIA.csv'
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <AppHeader title="Miembros" subtitle="Gestión de miembros" />

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center">
              <img
                src="/icons/icon-members.png"
                alt="Miembros"
                className="h-full w-full object-contain drop-shadow-xl"
              />
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                Gestión
              </p>

              <h1 className="mt-2 text-2xl font-bold">Lista de miembros</h1>

              <p className="mt-1 text-sm text-slate-300">
                Consulta, filtra y administra miembros registrados.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <p className="text-xs text-cyan-200">Total</p>
              <p className="mt-1 text-3xl font-bold">{members.length}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Mostrando</p>
              <p className="mt-1 text-3xl font-bold">
                {filteredMembers.length}
              </p>
            </div>

            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <p className="text-xs text-cyan-200">Activos</p>
              <p className="mt-1 text-3xl font-bold">{totalActive}</p>
            </div>

            <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-4">
              <p className="text-xs text-red-200">Inactivos</p>
              <p className="mt-1 text-3xl font-bold">{totalInactive}</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Buscar miembro
              </label>

              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                type="text"
                placeholder="Nombre, CURP, correo, teléfono, dojo..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Estatus
              </label>

              <select
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
              >
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Disciplinas
              </label>

              <div className="grid grid-cols-3 gap-2">
                {disciplineOptions.map((option) => {
                  const isSelected = disciplineFilters.includes(option.code)

                  return (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => toggleDisciplineFilter(option.code)}
                      className={
                        isSelected
                          ? 'rounded-2xl border border-cyan-400/40 bg-cyan-400 px-3 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.98]'
                          : 'rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-semibold text-slate-200 transition active:scale-[0.98]'
                      }
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => setDisciplineFilters(allDisciplineFilters)}
                className="mt-2 w-full rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition active:scale-[0.98]"
              >
                Seleccionar todas las disciplinas
              </button>
            </div>

            <div className={canEdit ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/members/new')}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition active:scale-[0.98]"
                >
                  Nuevo miembro
                </button>
              )}

              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition active:scale-[0.98]"
              >
                Exportar CSV
              </button>
            </div>
          </div>
        </section>

        {loading && (
          <section className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-slate-300">
              Cargando miembros desde Supabase...
            </p>
          </section>
        )}

        {!loading && errorMessage && (
          <section className="mt-5 rounded-3xl border border-red-400/30 bg-red-400/10 p-5">
            <p className="text-sm font-bold text-red-200">
              Error cargando miembros
            </p>

            <p className="mt-2 text-sm leading-6 text-red-100">
              {errorMessage}
            </p>
          </section>
        )}

        {!loading && !errorMessage && filteredMembers.length === 0 && (
          <section className="mt-5 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5">
            <p className="text-sm font-bold text-cyan-200">
              No hay miembros para mostrar
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              No existen miembros que coincidan con la búsqueda o los filtros
              seleccionados.
            </p>
          </section>
        )}

        {!loading && !errorMessage && filteredMembers.length > 0 && (
          <section className="mt-5 space-y-3" aria-label="Lista de miembros">
            {filteredMembers.map((member) => {
              const dojo = getOne(member.dojos)
              const memberName = `${member.first_names} ${member.paternal_last_name} ${member.maternal_last_name}`.trim()
              return (
                <article key={member.id} className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-base font-bold text-white">{memberName}</h2>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${member.status === 'active' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-red-400/30 bg-red-400/10 text-red-200'}`}>
                      {member.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-400">Dojo</dt><dd className="break-words text-slate-100">{dojo?.name || 'Sin dojo'}</dd></div>
                    <div><dt className="text-xs text-slate-400">Disciplinas</dt><dd className="break-words text-slate-100">{getDisciplinesSummary(member)}</dd></div>
                    <div><dt className="text-xs text-slate-400">Correo</dt><dd className="break-all text-slate-100">{member.email || 'Sin correo'}</dd></div>
                    <div><dt className="text-xs text-slate-400">Teléfono</dt><dd className="break-words text-slate-100">{member.phone || 'Sin teléfono'}</dd></div>
                    <div><dt className="text-xs text-slate-400">CURP</dt><dd className="break-all text-slate-100">{member.curp}</dd></div>
                    <div><dt className="text-xs text-slate-400">Trabajo / Escuela</dt><dd className="break-words text-slate-100">{member.work_school_name || 'No registrado'}</dd></div>
                  </dl>
                  <button type="button" onClick={() => navigate(`/admin/members/${member.id}`)} className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.98]">
                    Ver expediente y acciones
                  </button>
                </article>
              )
            })}
          </section>
        )}
      </section>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import AppLogo from '../../components/AppLogo'
import SaveConfirmation from '../../components/SaveConfirmation'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'

type RelatedOne<T> = T | T[] | null

type DisciplineInfo = {
  code: string
  name: string
}

type GradeInfo = {
  grade_name: string
}

type DojoInfo = {
  name: string
}

type DisciplineRow = {
  id: string
  practices: boolean
  disciplines: RelatedOne<DisciplineInfo>
  grade_catalog: RelatedOne<GradeInfo>
}

type MemberDetail = {
  id: string
  curp: string
  first_names: string
  paternal_last_name: string
  maternal_last_name: string
  work_school_name: string
  japanese_name: string | null
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
  member_disciplines: DisciplineRow[]
}

function getOne<T>(value: RelatedOne<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function FieldCard({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold text-slate-100">
        {value || 'No registrado'}
      </p>
    </div>
  )
}

export default function MemberDetailAdminPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'members.edit')
  const { memberId } = useParams()

  const [member, setMember] = useState<MemberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [preparingAccess, setPreparingAccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(() => (location.state as { aekiaSaved?: string } | null)?.aekiaSaved ?? null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadMember() {
      if (!memberId) {
        setErrorMessage('No se recibió el ID del miembro.')
        setLoading(false)
        return
      }

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
          japanese_name,
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
        .eq('id', memberId)
        .maybeSingle()

      if (error) {
        setErrorMessage(error.message)
        setMember(null)
        setLoading(false)
        return
      }

      if (!data) {
        setErrorMessage('No se encontró el miembro solicitado.')
        setMember(null)
        setLoading(false)
        return
      }

      setMember(data as unknown as MemberDetail)
      setLoading(false)
    }

    loadMember()
  }, [memberId])

  async function handleToggleStatus() {
    if (!canEdit) {
      setErrorMessage('Tu rol permite consultar miembros, pero no editarlos.')
      return
    }

    if (!member) {
      return
    }

    const newStatus = member.status === 'active' ? 'inactive' : 'active'

    const confirmed = window.confirm(
      newStatus === 'inactive'
        ? '¿Seguro que deseas inactivar este miembro?'
        : '¿Seguro que deseas activar este miembro?',
    )

    if (!confirmed) {
      return
    }

    setSavingStatus(true)
    setErrorMessage(null)

    const { error } = await supabase
      .from('members')
      .update({
        status: newStatus,
      })
      .eq('id', member.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingStatus(false)
      return
    }

    setMember({
      ...member,
      status: newStatus,
    })

    setSavingStatus(false)
  }


  async function handleResetPassword() {
    if (!canEdit) {
      setErrorMessage('Tu rol permite consultar miembros, pero no reiniciar passwords.')
      return
    }

    if (!member) {
      return
    }

    if (!member.email) {
      setErrorMessage('Este miembro no tiene correo registrado, no se puede reiniciar el password.')
      setSuccessMessage(null)
      return
    }

    const confirmed = window.confirm(
      `¿Seguro que deseas reiniciar el password de ${member.email} a 12345678?`,
    )

    if (!confirmed) {
      return
    }

    setResettingPassword(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    const { data, error } = await supabase.rpc('admin_reset_member_password', {
      p_member_id: member.id,
    })

    if (error) {
      setErrorMessage(error.message)
      setResettingPassword(false)
      return
    }

    setSuccessMessage(
      data || 'Password reiniciado a 12345678. El usuario deberá cambiarlo al entrar.',
    )
    setResettingPassword(false)
  }

  async function handlePrepareAccess() {
    if (!canEdit || !member || preparingAccess) return
    setErrorMessage(null)
    setSuccessMessage(null)
    setPreparingAccess(true)
    const {error} = await supabase.rpc('aekia_admin_prepare_member_access', {
      p_member_id:member.id,
    })
    setPreparingAccess(false)
    if (error) {setErrorMessage(error.message);return}
    setSuccessMessage('Acceso preparado. El miembro puede abrir /register → Activar acceso, confirmar su correo y entrar.')
  }

  const fullName = member
    ? `${member.first_names} ${member.paternal_last_name} ${member.maternal_last_name}`.trim()
    : ''

  const dojo = member ? getOne(member.dojos) : null

  const address = member
    ? [
        member.street,
        member.exterior_number ? `#${member.exterior_number}` : null,
        member.interior_number ? `Int. ${member.interior_number}` : null,
        member.neighborhood,
        member.municipality,
        member.state,
        member.postal_code ? `CP ${member.postal_code}` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <SaveConfirmation message={successMessage} onClose={() => { setSuccessMessage(null); navigate(location.pathname, { replace: true, state: null }) }} />
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
                Detalle de miembro
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
              Cargando detalle del miembro...
            </p>
          </section>
        )}

        {!loading && errorMessage && (
          <section className="mt-8 rounded-3xl border border-red-400/30 bg-red-400/10 p-5">
            <p className="text-sm font-bold text-red-200">
              Error cargando miembro
            </p>

            <p className="mt-2 text-sm leading-6 text-red-100">
              {errorMessage}
            </p>

            <button
              type="button"
              onClick={() => navigate('/admin/members')}
              className="mt-5 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition active:scale-[0.98]"
            >
              Volver a miembros
            </button>
          </section>
        )}

        {!loading && !errorMessage && member && (
          <>
            <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                    Miembro
                  </p>

                  <h1 className="mt-2 text-2xl font-bold leading-tight">
                    {fullName}
                  </h1>

                  <p className="mt-2 text-sm text-slate-400">{member.curp}</p>
                  <p className="mt-2 text-[11px] text-slate-600">Detalle miembros v05 roles</p>
                </div>

                <span
                  className={
                    member.status === 'active'
                      ? 'shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200'
                      : 'shrink-0 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-200'
                  }
                >
                  {member.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {errorMessage && (
                <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm leading-5 text-red-100">
                  {errorMessage}
                </div>
              )}

              {!canEdit && (
                <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-5 text-amber-100">
                  Modo consulta: tu rol permite ver este detalle, pero no editar ni reiniciar passwords.
                </div>
              )}

              {canEdit && (
                <div className="mt-5 grid grid-cols-1 gap-3">
                  <button
                  type="button"
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition active:scale-[0.98]"
                  onClick={() => navigate(`/admin/members/${member.id}/edit`)}
                >
                  Editar datos
                </button>

                <button
                  type="button"
                  disabled={savingStatus}
                  className={
                    member.status === 'active'
                      ? 'rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                      : 'rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                  }
                  onClick={handleToggleStatus}
                >
                  {savingStatus
                    ? 'Actualizando...'
                    : member.status === 'active'
                      ? 'Inactivar miembro'
                      : 'Activar miembro'}
                </button>

                  <button
                    type="button"
                    disabled={resettingPassword}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleResetPassword}
                  >
                    {resettingPassword
                      ? 'Reiniciando password...'
                      : 'Reiniciar password a 12345678'}
                  </button>

                  <button
                    type="button"
                    disabled={preparingAccess}
                    className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 transition active:scale-[0.98] disabled:opacity-60"
                    onClick={handlePrepareAccess}
                  >
                    {preparingAccess ? 'Preparando acceso...' : 'Preparar acceso de usuario'}
                  </button>
                </div>
              )}
            </section>

            <section className="mt-5 space-y-3">
              <h2 className="text-lg font-bold">Datos generales</h2>

              <FieldCard label="Nombre completo" value={fullName} />
              <FieldCard label="CURP" value={member.curp} />
              <FieldCard label="Fecha de nacimiento" value={member.birth_date} />
              <FieldCard label="Sexo" value={member.gender} />
              <FieldCard label="Correo" value={member.email} />
              <FieldCard label="Teléfono" value={member.phone} />
              <FieldCard
                label="Trabajo/Escuela"
                value={member.work_school_name}
              />
              <FieldCard label="Nombre japonés" value={member.japanese_name} />
              <FieldCard label="Dojo" value={dojo?.name} />
            </section>

            <section className="mt-6 space-y-3">
              <h2 className="text-lg font-bold">Domicilio</h2>

              <FieldCard label="Dirección" value={address} />
              <FieldCard label="Calle" value={member.street} />
              <FieldCard label="Número exterior" value={member.exterior_number} />
              <FieldCard label="Número interior" value={member.interior_number} />
              <FieldCard label="Colonia" value={member.neighborhood} />
              <FieldCard label="Municipio" value={member.municipality} />
              <FieldCard label="Estado" value={member.state} />
              <FieldCard label="Código postal" value={member.postal_code} />
            </section>

            <section className="mt-6 space-y-3 pb-8">
              <h2 className="text-lg font-bold">Disciplinas y grados</h2>

              {member.member_disciplines.length === 0 && (
                <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-5">
                  <p className="text-sm text-slate-300">
                    No hay disciplinas registradas para este miembro.
                  </p>
                </div>
              )}

              {member.member_disciplines.map((discipline) => {
                const disciplineInfo = getOne(discipline.disciplines)
                const gradeInfo = getOne(discipline.grade_catalog)

                return (
                  <article
                    key={discipline.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-white">
                          {disciplineInfo?.name || 'Disciplina'}
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          Grado: {gradeInfo?.grade_name || 'No aplica'}
                        </p>
                      </div>

                      <span
                        className={
                          discipline.practices
                            ? 'rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200'
                            : 'rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300'
                        }
                      >
                        {discipline.practices ? 'Practica' : 'No practica'}
                      </span>
                    </div>
                  </article>
                )
              })}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

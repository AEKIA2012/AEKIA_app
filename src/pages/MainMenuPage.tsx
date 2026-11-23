import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppLogo from '../components/AppLogo'
import { Field } from '../components/FormControls'
import { permissionImplies } from '../lib/accessControl'
import { logAuditEvent } from '../lib/audit'
import { loadMemberEligibility } from '../lib/eligibility'
import { supabase } from '../lib/supabaseClient'

const IMPERSONATE_KEY = 'aekia_visualizar_com_profile_id'
const IMPERSONATE_LABEL_KEY = 'aekia_visualizar_com_label'

type MenuItem = {
  title: string
  description: string
  icon: string
  path?: string
  externalUrl?: string
  permission?: string
}

type DashboardState = {
  attendancePercent: number
  completedWeeks: number
  totalWeeks: number
  requiredAttendances: number
  punctualAttendances: number
  paymentDebtCount: number
  eventEligible: boolean
  attendanceOk: boolean
  evaluationState: 'not_started' | 'no_classes' | 'evaluated'
  paymentsOk: boolean
  loading: boolean
}

type ActiveRole = { id: string; code: string; name: string }

type ProfileOption = {
  id: string
  display_name: string | null
  email: string
  member_id: string | null
}

type AlertRow = {
  key: string
  title: string
  message: string
  type: 'info' | 'warning' | 'danger' | 'success'
  module?: string
}

const userMenuItems: MenuItem[] = [
  { title: 'Datos personales', description: 'Consulta y actualiza tu información.', icon: '/icons/icon-personal-data.png', path: '/personal-data' },
  { title: 'Asistencia', description: 'Revisa tus asistencias registradas.', icon: '/icons/icon-attendance.png', path: '/attendance' },
  { title: 'Pagos', description: 'Consulta mensualidades, pagos y adeudos.', icon: '/icons/icon-payments.png', path: '/payments' },
  { title: 'Registro a evento', description: 'Regístrate a exámenes, seminarios o eventos.', icon: '/icons/icon-events.png', path: '/event-registration' },
  { title: 'Quejas', description: 'Envía quejas, comentarios o sugerencias.', icon: '/icons/icon-complaints.png', path: '/complaints' },
  { title: 'Reglamentos y estatutos', description: 'Abre el Drive oficial con documentos AEKIA.', icon: '/icons/icon-documents.png', externalUrl: 'https://drive.google.com/drive/folders/1UYedWfnWQvG-NJRGLChl_4XhYnDTMNCG?usp=drive_link' },
]

const adminMenuItems: MenuItem[] = [
  { title: 'Lista de miembros', description: 'Consulta, edita y administra miembros.', icon: '/icons/icon-members.png', path: '/admin/members', permission: 'members.view' },
  { title: 'Control de asistencia', description: 'Registra y consulta asistencia de miembros.', icon: '/icons/icon-attendance-admin.png', path: '/admin/attendance', permission: 'attendance.view_admin' },
  { title: 'Control de pagos', description: 'Registra mensualidades, adeudos y pagos.', icon: '/icons/icon-payments-admin.png', path: '/admin/payments', permission: 'payments.view_admin' },
  { title: 'Gestión de eventos', description: 'Crea eventos, exámenes y seminarios.', icon: '/icons/icon-events-admin.png', path: '/admin/events', permission: 'events.view_admin' },
  { title: 'Gestión de quejas', description: 'Revisa, responde y cierra quejas.', icon: '/icons/icon-complaints-admin.png', path: '/admin/complaints', permission: 'complaints.view_admin' },
  { title: 'Listas de acceso', description: 'Genera listas de acceso por día o evento.', icon: '/icons/icon-access-lists.png', path: '/admin/access-lists', permission: 'access_lists.view_admin' },
  { title: 'Roles y permisos', description: 'Consulta roles, permisos y asignaciones.', icon: '/icons/icon-roles.png', path: '/admin/roles', permission: 'roles.view_admin' },
  { title: 'Log / auditoría', description: 'Consulta accesos, vistas y cambios.', icon: '/icons/icon-alerts.png', path: '/admin/audit-logs', permission: 'audit_logs.view' },
]

function MenuCard({ item }: { item: MenuItem }) {
  const body = (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg">
        <img src={item.icon} alt={item.title} className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-white">{item.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-400">{item.description}</p>
      </div>
    </div>
  )
  const className = 'block rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-lg transition active:scale-[0.98]'
  if (item.externalUrl) return <a href={item.externalUrl} target="_blank" rel="noreferrer" className={className}>{body}</a>
  return <Link to={item.path ?? '/menu'} className={className}>{body}</Link>
}

function DashboardCard({ dashboard }: { dashboard: DashboardState }) {
  const hasDebt = dashboard.paymentDebtCount > 0
  const percent = Math.min(Math.max(dashboard.attendancePercent, 0), 100)
  const eligible = dashboard.eventEligible
  const hasEvaluation = dashboard.evaluationState === 'evaluated'
  const pendingMessage = dashboard.evaluationState === 'not_started'
    ? 'La evaluación reglamentaria empieza el 1 de enero de 2027.'
    : 'Todavía no hay semanas con clase realizada para evaluar.'

  return (
    <section className="mt-5 rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/15 to-white/5 p-5 shadow-2xl">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Resumen rápido</p>
      <div className="mt-4 grid grid-cols-[100px_1fr] gap-4">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-slate-950/60">
          <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeDasharray={`${percent} 100`} strokeLinecap="round" strokeWidth="4" className="text-cyan-300" />
          </svg>
          <span className="absolute text-lg font-black text-white">{dashboard.loading ? '...' : hasEvaluation ? `${percent}%` : '—'}</span>
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-sm font-bold text-white">Asistencia reglamentaria</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              {hasEvaluation ? `Últimos 3 meses evaluables: ${dashboard.completedWeeks}/${dashboard.requiredAttendances} semanas cumplidas. Se exige 75% de semanas con clase realizada; una asistencia puntual completa la semana.` : pendingMessage}
            </p>
          </div>
          <div className={`rounded-2xl border p-3 ${hasDebt ? 'border-red-400/30 bg-red-400/10 text-red-100' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}>
            <p className="text-sm font-bold">{hasDebt ? 'Tienes adeudo' : 'Sin adeudo actual'}</p>
            <p className="mt-1 text-xs opacity-90">{hasDebt ? `${dashboard.paymentDebtCount} mensualidad(es) u otro(s) cargo(s) vencido(s).` : 'Mensualidades y otros cargos vencidos al corriente.'}</p>
          </div>
          <div className={`rounded-2xl border p-3 ${!hasEvaluation ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : eligible ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-red-400/30 bg-red-400/10 text-red-100'}`}>
            <p className="text-sm font-bold">{!hasEvaluation ? 'Elegibilidad pendiente de evaluación' : eligible ? 'Apto para eventos, exámenes, torneos, etc.' : 'No apto para eventos, exámenes, torneos, etc.'}</p>
            <p className="mt-1 text-xs opacity-90">{!hasEvaluation ? pendingMessage : eligible ? 'Cumple asistencia reglamentaria y pagos vencidos.' : 'Debe cumplir asistencia puntual reglamentaria y no tener adeudos vencidos.'}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

const emptyDashboard: DashboardState = {
  attendancePercent: 0,
  completedWeeks: 0,
  totalWeeks: 0,
  requiredAttendances: 0,
  punctualAttendances: 0,
  paymentDebtCount: 0,
  eventEligible: false,
  attendanceOk: false,
  evaluationState: 'not_started',
  paymentsOk: false,
  loading: true,
}

function profileOptionLabel(profile: ProfileOption) {
  return profile.display_name?.trim() || profile.email
}

function alertClasses(type: AlertRow['type']) {
  if (type === 'danger') return 'border-red-400/30 bg-red-400/10 text-red-100'
  if (type === 'warning') return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  if (type === 'success') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
  return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
}

export default function MainMenuPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('Usuario AEKIA')
  const [roleNames, setRoleNames] = useState<string[]>([])
  const [ownPermissions, setOwnPermissions] = useState<string[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [showAlerts, setShowAlerts] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [ownProfile, setOwnProfile] = useState<ProfileOption | null>(null)
  const [impersonatedProfileId, setImpersonatedProfileId] = useState(localStorage.getItem(IMPERSONATE_KEY) ?? '')
  const [profileSearch, setProfileSearch] = useState('')
  const [alerts, setAlerts] = useState<AlertRow[]>([])

  const canAdminImpersonate = permissionImplies(ownPermissions, 'roles.view_admin') || permissionImplies(ownPermissions, 'roles.edit') || permissionImplies(ownPermissions, 'roles.manage') || permissionImplies(ownPermissions, 'audit_logs.view')
  const canViewAs = profiles.length > 1

  async function loadDashboardForMember(memberId: string | null | undefined) {
    if (!memberId) { setDashboard({ ...emptyDashboard, loading: false }); return }
    try {
      const eligibility = await loadMemberEligibility(memberId)
      setDashboard({
        attendancePercent: Number(eligibility.attendance_percent ?? 0),
        completedWeeks: Number(eligibility.completed_weeks ?? 0),
        totalWeeks: Number(eligibility.total_class_weeks ?? 0),
        requiredAttendances: Number(eligibility.required_attendances ?? eligibility.total_class_weeks ?? 0),
        punctualAttendances: Number(eligibility.punctual_attendances ?? 0),
        paymentDebtCount: Number(eligibility.payment_debt_count ?? 0),
        eventEligible: Boolean(eligibility.eligible),
        attendanceOk: Boolean(eligibility.attendance_ok),
        evaluationState: eligibility.evaluation_state,
        paymentsOk: Boolean(eligibility.payments_ok),
        loading: false,
      })
    } catch {
      setDashboard({ ...emptyDashboard, loading: false })
    }
  }

  async function loadAlerts() {
    const { data, error } = await supabase.rpc('aekia_current_alerts')
    if (error || !Array.isArray(data)) { setAlerts([]); return }
    setAlerts(data.filter((item): item is AlertRow => Boolean(item?.key && item?.title)))
  }

  async function loadProfilesForViewAs() {
    const { data } = await supabase.rpc('aekia_available_view_as_profiles')
    const next = Array.isArray(data) ? (data as ProfileOption[]) : []
    setProfiles(next)
    const selected = localStorage.getItem(IMPERSONATE_KEY)
    if (selected && !next.some((profile) => profile.id === selected)) {
      localStorage.removeItem(IMPERSONATE_KEY)
      localStorage.removeItem(IMPERSONATE_LABEL_KEY)
      setImpersonatedProfileId('')
    }
  }

  async function loadProfileAndDashboard() {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('id, display_name, email, member_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    const own = profileData as ProfileOption | null
    setOwnProfile(own)

    const selectedId = localStorage.getItem(IMPERSONATE_KEY) || ''
    let dashboardProfile = own
    let effectivePermissions = ownPermissions

    if (selectedId) {
      const { data: selectedProfileData, error: selectedProfileError } = await supabase.rpc('aekia_profile_for_view_as', { p_profile_id: selectedId })
      const selectedProfile = Array.isArray(selectedProfileData) ? selectedProfileData[0] : selectedProfileData

      if (!selectedProfileError && selectedProfile) {
        dashboardProfile = selectedProfile as ProfileOption
        const { data: selectedPermissions, error: permissionError } = await supabase.rpc('aekia_permission_codes_for_profile', { p_profile_id: selectedProfile.id })
        if (!permissionError && Array.isArray(selectedPermissions)) {
          effectivePermissions = selectedPermissions.filter((item): item is string => typeof item === 'string')
        } else {
          effectivePermissions = ['member']
        }
      } else {
        localStorage.removeItem(IMPERSONATE_KEY)
        localStorage.removeItem(IMPERSONATE_LABEL_KEY)
        setImpersonatedProfileId('')
        effectivePermissions = ownPermissions
      }
    }

    setPermissions(effectivePermissions)
    if (dashboardProfile?.id) {
      const { data: rolesData } = await supabase.rpc('aekia_roles_for_profile', { p_profile_id: dashboardProfile.id })
      setRoleNames(Array.isArray(rolesData) ? (rolesData as ActiveRole[]).map((item) => item.name) : [])
    } else {
      setRoleNames([])
    }
    const label = dashboardProfile?.display_name || dashboardProfile?.email || 'Usuario AEKIA'
    setDisplayName(selectedId ? `Visualizando: ${label}` : label)
    await loadDashboardForMember(dashboardProfile?.member_id)
    await loadAlerts()
  }

  useEffect(() => {
    logAuditEvent('Menú principal', 'consulta')
    async function loadPermissions() {
      const { data, error } = await supabase.rpc('aekia_current_permission_codes')
      if (error) { setPermissionError(error.message); setOwnPermissions([]); setPermissions([]); return }
      const next = Array.isArray(data) ? data.filter((item): item is string => typeof item === 'string') : []
      setOwnPermissions(next)
      setPermissions(next)
    }
    loadPermissions()
  }, [])

  useEffect(() => { loadProfilesForViewAs() }, [ownPermissions])
  useEffect(() => { loadProfileAndDashboard() }, [ownPermissions, impersonatedProfileId])

  const allowedAdminMenuItems = useMemo(() => adminMenuItems.filter((item) => !item.permission || permissionImplies(permissions, item.permission)), [permissions])
  const selectedProfile = useMemo(() => profiles.find((profile) => profile.id === impersonatedProfileId) ?? null, [profiles, impersonatedProfileId])
  const filteredProfiles = useMemo(() => {
    const clean = profileSearch.trim().toLowerCase()
    const list = profiles
      .filter((profile) => `${profileOptionLabel(profile)} ${profile.email}`.toLowerCase().includes(clean))
      .sort((a, b) => {
        if (a.id === impersonatedProfileId) return -1
        if (b.id === impersonatedProfileId) return 1
        if (a.id === ownProfile?.id) return -1
        if (b.id === ownProfile?.id) return 1
        return profileOptionLabel(a).localeCompare(profileOptionLabel(b), 'es')
      })
      .slice(0, clean ? 12 : 8)
    if (selectedProfile && !list.some((profile) => profile.id === selectedProfile.id)) return [selectedProfile, ...list]
    return list
  }, [profiles, profileSearch, selectedProfile, impersonatedProfileId, ownProfile])

  async function handleLogout() {
    localStorage.removeItem(IMPERSONATE_KEY)
    localStorage.removeItem(IMPERSONATE_LABEL_KEY)
    await supabase.auth.signOut()
    navigate('/login')
  }

  function handleImpersonationChange(profileId: string) {
    const normalizedId = !profileId || profileId === ownProfile?.id ? '' : profileId
    setImpersonatedProfileId(normalizedId)
    setPermissions(normalizedId ? ['member'] : ownPermissions)
    setProfileSearch('')
    if (!normalizedId) {
      localStorage.removeItem(IMPERSONATE_KEY)
      localStorage.removeItem(IMPERSONATE_LABEL_KEY)
    } else {
      const selected = profiles.find((profile) => profile.id === normalizedId)
      localStorage.setItem(IMPERSONATE_KEY, normalizedId)
      localStorage.setItem(IMPERSONATE_LABEL_KEY, selected ? profileOptionLabel(selected) : '')
    }
  }

  async function dismissAlert(key: string) {
    await supabase.rpc('aekia_dismiss_alert', { p_alert_key: key })
    setAlerts((current) => current.filter((alert) => alert.key !== key))
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AppLogo size="sm" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">AEKIA</p>
              <h1 className="mt-1 max-w-[210px] truncate text-base font-bold">Menú principal</h1>
              <p className="mt-0.5 max-w-[210px] truncate text-xs text-slate-400">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAlerts((current) => !current)} className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5 transition active:scale-[0.97]" aria-label="Alertas" title="Alertas">
              <img src="/icons/icon-alerts.png" alt="Alertas" className="h-full w-full scale-125 object-contain drop-shadow-lg" />
              {alerts.length > 0 && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-red-400" />}
            </button>
            <button type="button" onClick={handleLogout} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5 transition active:scale-[0.97]" aria-label="Cerrar sesión" title="Cerrar sesión"><img src="/icons/icon-logout.png" alt="Cerrar sesión" className="h-full w-full scale-125 object-contain drop-shadow-lg" /></button>
          </div>
        </header>

        {permissionError && <section className="mt-5 rounded-[2rem] border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">No se pudieron cargar permisos: {permissionError}</section>}

        <section className="mt-5 rounded-3xl border border-cyan-400/35 bg-cyan-400/10 px-4 py-3 shadow-lg" aria-label="Roles activos">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{impersonatedProfileId ? 'Roles del perfil visualizado' : 'Mis roles activos'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roleNames.length > 0 ? roleNames.map((role) => <span key={role} className="rounded-full border border-cyan-300/30 bg-slate-950/70 px-3 py-1.5 text-sm font-bold text-white">{role}</span>) : <span className="text-sm text-slate-300">Sin roles disponibles · aplica primero SQL v14</span>}
          </div>
        </section>

        {canViewAs && (
          <section className="mt-5 rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">{canAdminImpersonate ? 'Admin' : 'Familia'}</p>
            <h2 className="mt-1 text-lg font-bold">Visualizar como usuario</h2>
            <p className="mt-2 text-xs leading-5 text-slate-300">Busca y toca una persona para cambiar inmediatamente lo que ves.</p>
            {selectedProfile && <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">Activo: {profileOptionLabel(selectedProfile)}</p>}
            <div className="mt-4 space-y-3">
              <Field label="Buscar" value={profileSearch} onChange={setProfileSearch} placeholder="Nombre o correo" />
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 p-2">
                {filteredProfiles.map((profile) => {
                  const isOwn = profile.id === ownProfile?.id
                  const isActive = (!impersonatedProfileId && isOwn) || profile.id === impersonatedProfileId
                  return (
                    <button key={profile.id} type="button" onClick={() => handleImpersonationChange(profile.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition active:scale-[0.98] ${isActive ? 'border-cyan-300 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-200'}`}>
                      <span className="block font-bold">{isOwn ? 'Yo mismo' : profileOptionLabel(profile)}</span>
                      <span className="mt-0.5 block text-slate-400">{profile.email}</span>
                    </button>
                  )
                })}
              </div>
              {impersonatedProfileId && <button type="button" onClick={() => handleImpersonationChange('')} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition active:scale-[0.98]">Volver a mi usuario</button>}
            </div>
          </section>
        )}

        {showAlerts && (
          <section className="mt-5 rounded-[2rem] border border-cyan-400/20 bg-cyan-400/10 p-5 shadow-2xl">
            <p className="text-sm font-bold text-cyan-100">Alertas pendientes</p>
            <div className="mt-3 space-y-3">
              {alerts.length === 0 && <p className="text-sm leading-6 text-slate-300">No tienes alertas pendientes.</p>}
              {alerts.map((alert) => (
                <div key={alert.key} className={`rounded-2xl border p-3 ${alertClasses(alert.type)}`}>
                  <p className="text-sm font-bold">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-90">{alert.message}</p>
                  <button type="button" onClick={() => dismissAlert(alert.key)} className="mt-3 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold">Dismiss</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowAlerts(false)} className="mt-4 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition active:scale-[0.98]">Cerrar</button>
          </section>
        )}

        <DashboardCard dashboard={dashboard} />

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Usuario</p><h2 className="mt-2 text-2xl font-bold">Mis módulos</h2><p className="mt-2 text-sm leading-6 text-slate-300">Accesos personales para consulta de datos, pagos, asistencia, eventos y comunicación.</p></section>
        <section className="mt-5 space-y-3">{userMenuItems.map((item) => <MenuCard key={item.path ?? item.externalUrl} item={item} />)}</section>

        {allowedAdminMenuItems.length > 0 && <><section className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Administración</p><h2 className="mt-2 text-2xl font-bold">Mesa directiva</h2><p className="mt-2 text-sm leading-6 text-slate-300">Herramientas disponibles según el usuario visualizado.</p></section><section className="mt-5 space-y-3 pb-8">{allowedAdminMenuItems.map((item) => <MenuCard key={item.path} item={item} />)}</section></>}
      </section>
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { Field, ModalPanel, PrimaryButton, SelectField, StatusBadge, TextArea } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'
import { fullName } from '../../lib/helpers'

type RoleRow = { id: string; code: string; name: string; description: string | null; status: string }
type PermissionRow = { id: string; code: string; name: string; module: string | null }
type ProfileMember = { first_names: string | null; paternal_last_name: string | null; maternal_last_name: string | null }
type ProfileRow = { id: string; display_name: string | null; email: string; status: string; members?: ProfileMember | ProfileMember[] | null }
type UserRoleRow = { id?: string; user_profile_id: string; role_id: string; status: string }
type RolePermissionRow = { role_id: string; permission_id: string }

function makeCode(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function profileLabel(profile: ProfileRow) {
  // Para roles preferimos display_name porque algunos correos familiares estaban
  // vinculados originalmente a hijos(as). El display_name se corrige por SQL.
  const member = Array.isArray(profile.members) ? profile.members[0] : profile.members
  const memberName = fullName(member ?? {})
  return profile.display_name?.trim() || memberName || profile.email
}

export default function AdminRolesPage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'roles.edit')
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [permissionRows, setPermissionRows] = useState<PermissionRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([])
  const [statusFilter, setStatusFilter] = useState('active')
  const [selectedRole, setSelectedRole] = useState<RoleRow | null>(null)
  const [roleName, setRoleName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [roleStatus, setRoleStatus] = useState('active')
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')
  const [searchProfile, setSearchProfile] = useState('')
  const [permissionModuleFilter, setPermissionModuleFilter] = useState('all')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function loadData() {
    setErrorMessage(null)
    let roleQuery = supabase.from('roles').select('id, code, name, description, status').order('name', { ascending: true })
    if (statusFilter !== 'all') roleQuery = roleQuery.eq('status', statusFilter)
    const { data: roleData, error: roleError } = await roleQuery
    if (roleError) { setErrorMessage(roleError.message); return }

    const { data: permissionData, error: permissionError } = await supabase.from('permissions').select('id, code, name, module').order('module').order('code')
    if (permissionError) { setErrorMessage(permissionError.message); return }

    const { data: profileData, error: profileError } = await supabase.from('user_profiles').select('id, display_name, email, status, members(first_names, paternal_last_name, maternal_last_name)').eq('status', 'active').order('display_name')
    if (profileError) { setErrorMessage(profileError.message); return }

    const { data: userRoleData, error: userRoleError } = await supabase.from('user_roles').select('id, user_profile_id, role_id, status')
    if (userRoleError) { setErrorMessage(userRoleError.message); return }

    const { data: rolePermissionData, error: rolePermissionError } = await supabase.from('role_permissions').select('role_id, permission_id')
    if (rolePermissionError) { setErrorMessage(rolePermissionError.message); return }

    setRoles((roleData ?? []) as RoleRow[])
    setPermissionRows((permissionData ?? []) as PermissionRow[])
    setProfiles((profileData ?? []) as ProfileRow[])
    setUserRoles((userRoleData ?? []) as UserRoleRow[])
    setRolePermissions((rolePermissionData ?? []) as RolePermissionRow[])
  }

  useEffect(() => { loadData() }, [statusFilter])

  function openRole(role: RoleRow) {
    setSelectedRole(role)
    setRoleName(role.name)
    setRoleDescription(role.description ?? '')
    setRoleStatus(role.status)
    setSearchProfile('')
    setPermissionModuleFilter('all')
  }

  async function createRole() {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar roles, pero no crear o editar roles.'); return }
    const name = newRoleName.trim()
    if (!name) { setErrorMessage('El nombre del rol es obligatorio.'); return }
    const { error } = await supabase.from('roles').insert({ code: makeCode(name), name, description: newRoleDescription.trim() || null, status: 'active' })
    if (error) { setErrorMessage(error.message); return }
    setNewRoleName(''); setNewRoleDescription('')
    setSuccessMessage('Rol creado correctamente.')
    await loadData()
  }

  async function saveRole() {
    if (!canEdit || !selectedRole) return
    const { error } = await supabase.from('roles').update({ name: roleName.trim(), description: roleDescription.trim() || null, status: roleStatus }).eq('id', selectedRole.id)
    if (error) { setErrorMessage(error.message); return }
    setSelectedRole(null)
    setSuccessMessage('Rol guardado correctamente.')
    await loadData()
  }

  function roleHasPermission(permissionId: string) {
    return Boolean(selectedRole && rolePermissions.some((row) => row.role_id === selectedRole.id && row.permission_id === permissionId))
  }

  async function togglePermission(permissionId: string, checked: boolean) {
    if (!canEdit || !selectedRole) return
    setErrorMessage(null)
    if (checked) {
      const { error } = await supabase.from('role_permissions').upsert({ role_id: selectedRole.id, permission_id: permissionId }, { onConflict: 'role_id,permission_id' })
      if (error) { setErrorMessage(error.message); return }
      setRolePermissions((rows) => rows.some((row) => row.role_id === selectedRole.id && row.permission_id === permissionId) ? rows : [...rows, { role_id: selectedRole.id, permission_id: permissionId }])
    } else {
      const { error } = await supabase.from('role_permissions').delete().eq('role_id', selectedRole.id).eq('permission_id', permissionId)
      if (error) { setErrorMessage(error.message); return }
      setRolePermissions((rows) => rows.filter((row) => !(row.role_id === selectedRole.id && row.permission_id === permissionId)))
    }
  }

  function profileHasRole(profileId: string) {
    return Boolean(selectedRole && userRoles.some((row) => row.role_id === selectedRole.id && row.user_profile_id === profileId && row.status === 'active'))
  }

  async function toggleProfile(profileId: string, checked: boolean) {
    if (!canEdit || !selectedRole) return
    setErrorMessage(null)
    if (checked) {
      const { error } = await supabase.from('user_roles').upsert({ user_profile_id: profileId, role_id: selectedRole.id, status: 'active' }, { onConflict: 'user_profile_id,role_id' })
      if (error) { setErrorMessage(error.message); return }
      setUserRoles((rows) => rows.some((row) => row.user_profile_id === profileId && row.role_id === selectedRole.id) ? rows.map((row) => row.user_profile_id === profileId && row.role_id === selectedRole.id ? { ...row, status: 'active' } : row) : [...rows, { user_profile_id: profileId, role_id: selectedRole.id, status: 'active' }])
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_profile_id', profileId).eq('role_id', selectedRole.id)
      if (error) { setErrorMessage(error.message); return }
      setUserRoles((rows) => rows.filter((row) => !(row.user_profile_id === profileId && row.role_id === selectedRole.id)))
    }
  }

  const roleCount = (roleId: string) => userRoles.filter((row) => row.role_id === roleId && row.status === 'active').length
  const permissionCount = (roleId: string) => rolePermissions.filter((row) => row.role_id === roleId).length

  const moduleOptions = useMemo(() => {
    const modules = Array.from(new Set(permissionRows.map((permission) => permission.module ?? 'General'))).sort()
    return [{ value: 'all', label: 'Todos los módulos' }, ...modules.map((module) => ({ value: module, label: module }))]
  }, [permissionRows])

  const groupedPermissions = useMemo(() => {
    return permissionRows
      .filter((permission) => permissionModuleFilter === 'all' || (permission.module ?? 'General') === permissionModuleFilter)
      .reduce<Record<string, PermissionRow[]>>((groups, permission) => {
        const module = permission.module ?? 'General'
        groups[module] = [...(groups[module] ?? []), permission]
        return groups
      }, {})
  }, [permissionRows, permissionModuleFilter])

  const filteredProfiles = useMemo(() => {
    const clean = searchProfile.trim().toLowerCase()
    return profiles
      .filter((profile) => `${profileLabel(profile)} ${profile.display_name ?? ''} ${profile.email}`.toLowerCase().includes(clean))
      .sort((a, b) => Number(profileHasRole(b.id)) - Number(profileHasRole(a.id)) || profileLabel(a).localeCompare(profileLabel(b)))
      .slice(0, 100)
  }, [profiles, searchProfile, userRoles, selectedRole])

  return (
    <ModuleShell title="Roles y permisos" subtitle="Crea roles, asigna usuarios y asigna privilegios por módulo." icon="/icons/icon-roles.png" moduleType="Gestión" version="Roles v09">
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      <SaveConfirmation message={successMessage} onClose={() => setSuccessMessage(null)} />
      {canEdit && <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Nuevo rol</p><div className="mt-4 space-y-4"><Field label="Rol" value={newRoleName} onChange={setNewRoleName} /><TextArea label="Descripción" value={newRoleDescription} onChange={setNewRoleDescription} rows={3} /><PrimaryButton onClick={createRole}>Crear rol</PrimaryButton></div></section>}
      {!canEdit && <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Modo consulta: puedes revisar roles y asignaciones, pero no modificarlos.</section>}
      <SelectField label="Estatus" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'active', label: 'Activos' }, { value: 'inactive', label: 'Inactivos' }, { value: 'all', label: 'Todos' }]} />

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[640px]"><div className="grid grid-cols-[90px_210px_110px_110px_110px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300"><div>Editar</div><div>Rol</div><div>Estatus</div><div>Usuarios</div><div>Permisos</div></div>
        <div className="divide-y divide-white/10">{roles.map((role) => <div key={role.id} className="grid grid-cols-[90px_210px_110px_110px_110px] items-center px-4 py-3 text-sm"><button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => openRole(role)}>Abrir</button><div className="truncate">{role.name}<p className="text-xs text-slate-500">{role.code}</p></div><div><StatusBadge status={role.status} /></div><div>{roleCount(role.id)}</div><div>{permissionCount(role.id)}</div></div>)}</div></div>
      </section>

      {selectedRole && <ModalPanel title={`Rol: ${selectedRole.name}`} onClose={() => setSelectedRole(null)}><div className="space-y-5"><Field label="Nombre del rol" value={roleName} onChange={setRoleName} disabled={!canEdit} /><TextArea label="Descripción" value={roleDescription} onChange={setRoleDescription} rows={3} /><SelectField label="Estatus" value={roleStatus} onChange={setRoleStatus} disabled={!canEdit} options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }]} />{canEdit && <PrimaryButton onClick={saveRole}>Guardar rol</PrimaryButton>}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4"><p className="text-sm font-bold">Permisos del rol</p><div className="mt-3"><SelectField label="Filtrar permisos por menú" value={permissionModuleFilter} onChange={setPermissionModuleFilter} options={moduleOptions} /></div><div className="mt-3 space-y-4">{Object.entries(groupedPermissions).map(([module, items]) => <div key={module}><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{module}</p><div className="space-y-2">{items.map((permission) => <label key={permission.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900 p-3 text-sm text-slate-200"><input type="checkbox" checked={roleHasPermission(permission.id)} disabled={!canEdit} onChange={(event) => togglePermission(permission.id, event.target.checked)} /><span><span className="font-semibold">{permission.name}</span><span className="block text-xs text-slate-500">{permission.code}</span></span></label>)}</div></div>)}</div></section>
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4"><p className="text-sm font-bold">Usuarios asignados</p><Field label="Buscar usuario" value={searchProfile} onChange={setSearchProfile} placeholder="Nombre o correo" /><p className="mt-2 text-xs text-slate-500">Los usuarios ya asignados aparecen primero.</p><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{filteredProfiles.map((profile) => <label key={profile.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900 p-3 text-sm text-slate-200"><input type="checkbox" checked={profileHasRole(profile.id)} disabled={!canEdit} onChange={(event) => toggleProfile(profile.id, event.target.checked)} /><span><span className="font-semibold">{profileLabel(profile)}</span><span className="block text-xs text-slate-500">{profile.email}</span></span></label>)}</div></section>
      </div></ModalPanel>}
    </ModuleShell>
  )
}

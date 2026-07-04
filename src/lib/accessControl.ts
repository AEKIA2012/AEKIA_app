import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

export type PermissionCode = string

export type CurrentAccess = {
  permissions: PermissionCode[]
  loadingAccess: boolean
  accessError: string | null
  can: (permissionCode: PermissionCode) => boolean
  canAny: (permissionCodes: PermissionCode[]) => boolean
  refreshAccess: () => Promise<void>
}

const publicUserPermissions = new Set([
  'personal_data.view_own',
  'personal_data.update_own',
  'attendance.view_own',
  'payments.view_own',
  'events.register_own',
  'complaints.create_own',
])

export const adminRoutePermissions: Array<{
  startsWith: string
  permission: PermissionCode
}> = [
  { startsWith: '/admin/members/new', permission: 'members.edit' },
  { startsWith: '/admin/members/', permission: 'members.view' },
  { startsWith: '/admin/members', permission: 'members.view' },
  { startsWith: '/admin/attendance', permission: 'attendance.view_admin' },
  { startsWith: '/admin/payments', permission: 'payments.view_admin' },
  { startsWith: '/admin/events', permission: 'events.view_admin' },
  { startsWith: '/admin/complaints', permission: 'complaints.view_admin' },
  { startsWith: '/admin/access-lists', permission: 'access_lists.view_admin' },
  { startsWith: '/admin/roles', permission: 'roles.view_admin' },
  { startsWith: '/admin/audit-logs', permission: 'audit_logs.view' },
]

export function routeRequiredPermission(pathname: string) {
  const editMemberPattern = /^\/admin\/members\/[^/]+\/edit$/

  if (editMemberPattern.test(pathname)) {
    return 'members.edit'
  }

  return adminRoutePermissions.find((item) => pathname.startsWith(item.startsWith))
    ?.permission ?? null
}

export function permissionImplies(
  permissions: PermissionCode[],
  requestedPermission: PermissionCode,
) {
  if (permissions.includes(requestedPermission)) {
    return true
  }

  if (permissions.includes('roles.edit')) {
    return true
  }

  if (publicUserPermissions.has(requestedPermission)) {
    return permissions.includes('member')
  }

  return false
}

const IMPERSONATE_KEY = 'aekia_visualizar_com_profile_id'

export async function loadPermissionCodes() {
  const impersonatedProfileId = localStorage.getItem(IMPERSONATE_KEY)

  const { data, error } = impersonatedProfileId
    ? await supabase.rpc('aekia_permission_codes_for_profile', { p_profile_id: impersonatedProfileId })
    : await supabase.rpc('aekia_current_permission_codes')

  if (error) {
    if (impersonatedProfileId) {
      localStorage.removeItem(IMPERSONATE_KEY)
      localStorage.removeItem('aekia_visualizar_com_label')
    }
    throw error
  }

  if (!Array.isArray(data)) {
    return []
  }

  return data.filter((item): item is string => typeof item === 'string')
}

export function useCurrentAccess(): CurrentAccess {
  const [permissions, setPermissions] = useState<PermissionCode[]>([])
  const [loadingAccess, setLoadingAccess] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)

  const refreshAccess = useCallback(async () => {
    setLoadingAccess(true)
    setAccessError(null)

    try {
      const nextPermissions = await loadPermissionCodes()
      setPermissions(nextPermissions)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar permisos.'
      setAccessError(message)
      setPermissions([])
    } finally {
      setLoadingAccess(false)
    }
  }, [])

  useEffect(() => {
    refreshAccess()
  }, [refreshAccess])

  const can = useCallback(
    (permissionCode: PermissionCode) => permissionImplies(permissions, permissionCode),
    [permissions],
  )

  const canAny = useCallback(
    (permissionCodes: PermissionCode[]) =>
      permissionCodes.some((permissionCode) => can(permissionCode)),
    [can],
  )

  return useMemo(
    () => ({ permissions, loadingAccess, accessError, can, canAny, refreshAccess }),
    [permissions, loadingAccess, accessError, can, canAny, refreshAccess],
  )
}

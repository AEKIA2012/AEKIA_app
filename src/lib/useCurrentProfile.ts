import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const IMPERSONATE_KEY = 'aekia_visualizar_com_profile_id'

export type CurrentProfile = {
  id: string
  auth_user_id: string | null
  member_id: string | null
  email: string
  display_name: string | null
  status: string
  is_impersonated?: boolean
}

export function useCurrentProfile() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProfile() {
      setLoadingProfile(true)
      setProfileError(null)

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        setProfileError(sessionError.message)
        setLoadingProfile(false)
        return
      }

      const user = sessionData.session?.user

      if (!user) {
        setProfileError('No hay sesión activa.')
        setLoadingProfile(false)
        return
      }

      const { data: ownProfile, error } = await supabase
        .from('user_profiles')
        .select('id, auth_user_id, member_id, email, display_name, status')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error) {
        setProfileError(error.message)
        setLoadingProfile(false)
        return
      }

      if (!ownProfile) {
        setProfileError('No se encontró perfil de usuario.')
        setLoadingProfile(false)
        return
      }

      const selectedProfileId = localStorage.getItem(IMPERSONATE_KEY)
      if (selectedProfileId) {
        const { data: selectedProfile, error: viewAsError } = await supabase.rpc('aekia_profile_for_view_as', { p_profile_id: selectedProfileId })
        let profileFromRpc = Array.isArray(selectedProfile) ? selectedProfile[0] : selectedProfile

        if (!viewAsError && !profileFromRpc) {
          const {data:familyProfile,error:familyError} = await supabase.rpc('aekia_family_member_for_view_as',{p_member_id:selectedProfileId})
          if (!familyError) profileFromRpc = Array.isArray(familyProfile) ? familyProfile[0] : familyProfile
        }

        if (!viewAsError && profileFromRpc?.status === 'active') {
          setProfile({ ...(profileFromRpc as CurrentProfile), is_impersonated: true })
          setLoadingProfile(false)
          return
        }

        localStorage.removeItem(IMPERSONATE_KEY)
      }

      setProfile(ownProfile as CurrentProfile)
      setLoadingProfile(false)
    }

    loadProfile()
  }, [])

  return { profile, loadingProfile, profileError }
}

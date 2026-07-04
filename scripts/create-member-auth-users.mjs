import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const defaultPassword = process.env.DEFAULT_MEMBER_PASSWORD ?? '12345678'

if (!supabaseUrl) {
  throw new Error('Falta SUPABASE_URL')
}

if (!serviceRoleKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function fullName(member) {
  return [member.first_names, member.paternal_last_name, member.maternal_last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function listAllAuthUsers() {
  const users = []
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) {
      throw error
    }

    users.push(...data.users)

    if (!data.users || data.users.length < 1000) {
      break
    }

    page += 1
  }

  return users
}

async function main() {
  console.log('Creando/verificando usuarios de miembros...')

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select('id, email, first_names, paternal_last_name, maternal_last_name, status')
    .not('email', 'is', null)

  if (memberError) {
    throw memberError
  }

  const authUsers = await listAllAuthUsers()
  const authByEmail = new Map(
    authUsers
      .filter((user) => user.email)
      .map((user) => [user.email.toLowerCase(), user]),
  )

  const results = {
    membersWithEmail: 0,
    createdAuthUsers: 0,
    updatedAuthUsers: 0,
    profilesUpserted: 0,
    skippedInvalidEmail: 0,
  }

  for (const member of members ?? []) {
    const email = String(member.email ?? '').trim().toLowerCase()

    if (!email || !email.includes('@') || !email.includes('.')) {
      results.skippedInvalidEmail += 1
      continue
    }

    results.membersWithEmail += 1
    const displayName = fullName(member) || email
    let authUser = authByEmail.get(email)

    if (!authUser) {
      const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          member_id: member.id,
        },
      })

      if (createError) {
        console.log(`No se pudo crear ${email}. Intentando buscar existente...`)
        const refreshedUsers = await listAllAuthUsers()
        authUser = refreshedUsers.find((user) => user.email?.toLowerCase() === email)

        if (!authUser) {
          console.error(`ERROR creando ${email}:`, createError.message)
          continue
        }
      } else {
        authUser = createdData.user
        results.createdAuthUsers += 1
      }
    } else {
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          member_id: member.id,
        },
      })

      if (updateError) {
        console.error(`ERROR actualizando password de ${email}:`, updateError.message)
        continue
      }

      results.updatedAuthUsers += 1
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          auth_user_id: authUser.id,
          member_id: member.id,
          email,
          display_name: displayName,
          status: member.status === 'inactive' ? 'inactive' : 'active',
          must_change_password: true,
        },
        {
          onConflict: 'email',
        },
      )

    if (profileError) {
      console.error(`ERROR perfil ${email}:`, profileError.message)
      continue
    }

    results.profilesUpserted += 1
  }

  console.log('Usuarios de miembros procesados.')
  console.table(results)
}

main().catch((error) => {
  console.error('Error creando usuarios de miembros:')
  console.error(error)
  process.exit(1)
})

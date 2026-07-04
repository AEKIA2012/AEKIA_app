import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2]?.trim().toLowerCase()
const password = process.argv[3] ?? '12345678'

if (!supabaseUrl) {
  throw new Error('Falta SUPABASE_URL')
}

if (!serviceRoleKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
}

if (!email) {
  throw new Error('Uso: node scripts/reset-member-password.mjs correo@ejemplo.com [password]')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function findAuthUserByEmail(targetEmail) {
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) {
      throw error
    }

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === targetEmail,
    )

    if (found) {
      return found
    }

    if (!data.users || data.users.length < 1000) {
      return null
    }

    page += 1
  }
}

async function main() {
  const authUser = await findAuthUserByEmail(email)

  if (!authUser) {
    throw new Error(`No existe usuario Auth para ${email}`)
  }

  const { error: updateAuthError } = await supabase.auth.admin.updateUserById(authUser.id, {
    password,
    email_confirm: true,
  })

  if (updateAuthError) {
    throw updateAuthError
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({
      must_change_password: true,
      status: 'active',
    })
    .eq('auth_user_id', authUser.id)

  if (profileError) {
    throw profileError
  }

  console.log(`Password reseteado para ${email}.`)
  console.log('Password temporal:', password)
  console.log('Debe pedir cambio de password en el próximo login.')
}

main().catch((error) => {
  console.error('Error reseteando password:')
  console.error(error)
  process.exit(1)
})

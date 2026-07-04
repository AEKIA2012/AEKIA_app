import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const adminEmail = process.env.ADMIN_EMAIL ?? 'kendoaguascalientesaekia@gmail.com'
const adminPassword = process.env.ADMIN_PASSWORD ?? 'Kenshi43'

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

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) {
    throw error
  }

  return data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  )
}

async function main() {
  console.log('Creando/verificando usuario admin...')

  let authUser = null

  const { data: createdUserData, error: createUserError } =
    await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        display_name: 'Administrador AEKIA',
      },
    })

  if (createUserError) {
    console.log('No se pudo crear como nuevo. Buscando usuario existente...')
    authUser = await findUserByEmail(adminEmail)

    if (!authUser) {
      throw createUserError
    }

    console.log('Usuario existente encontrado. Actualizando password...')

    const { error: updateUserError } = await supabase.auth.admin.updateUserById(
      authUser.id,
      {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          display_name: 'Administrador AEKIA',
        },
      },
    )

    if (updateUserError) {
      throw updateUserError
    }
  } else {
    authUser = createdUserData.user
  }

  if (!authUser?.id) {
    throw new Error('No se obtuvo auth_user_id')
  }

  console.log('Auth user ID:', authUser.id)

  const { data: profileData, error: profileError } = await supabase
    .from('user_profiles')
    .upsert(
      {
        auth_user_id: authUser.id,
        member_id: null,
        email: adminEmail,
        display_name: 'Administrador AEKIA',
        status: 'active',
        must_change_password: false,
      },
      {
        onConflict: 'email',
      },
    )
    .select('id, email, display_name, status, must_change_password')
    .single()

  if (profileError) {
    throw profileError
  }

  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('id, code, name')
    .eq('code', 'admin')
    .single()

  if (roleError) {
    throw roleError
  }

  const { error: userRoleError } = await supabase.from('user_roles').upsert(
    {
      user_profile_id: profileData.id,
      role_id: roleData.id,
      status: 'active',
    },
    {
      onConflict: 'user_profile_id,role_id',
    },
  )

  if (userRoleError) {
    throw userRoleError
  }

  console.log('Admin vinculado correctamente.')
  console.log({
    email: profileData.email,
    display_name: profileData.display_name,
    status: profileData.status,
    must_change_password: profileData.must_change_password,
    role: roleData.code,
  })
}

main().catch((error) => {
  console.error('Error creando admin:')
  console.error(error)
  process.exit(1)
})
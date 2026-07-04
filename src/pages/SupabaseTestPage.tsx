import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabaseClient'

type HealthCheckRow = {
  id: number
  message: string
  created_at: string
}

export default function SupabaseTestPage() {
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<HealthCheckRow | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase
        .from('health_check')
        .select('id, message, created_at')
        .order('id', { ascending: true })
        .limit(1)
        .single()

      if (error) {
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      setRow(data)
      setLoading(false)
    }

    testConnection()
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <AppHeader title="Supabase" subtitle="Prueba de conexión" />

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="mx-auto flex h-24 w-24 items-center justify-center">
            <img
              src="/logo-aekia.png"
              alt="Logo AEKIA"
              className="h-full w-full object-contain drop-shadow-xl"
            />
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
              Base de datos
            </p>

            <h1 className="mt-3 text-3xl font-bold">Conexión Supabase</h1>
          </div>

          {loading && (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-300">
                Probando conexión con la base de datos...
              </p>
            </div>
          )}

          {!loading && errorMessage && (
            <div className="mt-6 rounded-3xl border border-red-400/30 bg-red-400/10 p-4">
              <p className="text-sm font-bold text-red-200">
                Error de conexión
              </p>

              <p className="mt-2 text-sm leading-6 text-red-100">
                {errorMessage}
              </p>
            </div>
          )}

          {!loading && row && (
            <div className="mt-6 rounded-3xl border border-cyan-400/30 bg-cyan-400/10 p-4">
              <p className="text-sm font-bold text-cyan-200">
                Conexión exitosa
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-200">
                {row.message}
              </p>

              <p className="mt-3 text-xs text-slate-400">
                Registro ID: {row.id}
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
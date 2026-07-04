import { Link } from 'react-router-dom'
import AppLogo from '../components/AppLogo'

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-6 py-8">
        <div className="flex items-center justify-between">
          <Link to="/login" className="text-sm font-semibold text-cyan-300">
            ← Regresar
          </Link>

          <AppLogo size="sm" />
        </div>

        <div className="mt-8">
          <h1 className="text-3xl font-bold">Registro</h1>
          <p className="mt-2 text-sm text-slate-300">
            Captura tus datos básicos para solicitar acceso.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          {[
            'Nombre(s)',
            'Apellido paterno',
            'Apellido materno',
            'Nombre trabajo/escuela',
            'CURP',
            'Correo electrónico',
          ].map((label) => (
            <div key={label} className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-200">
                *{label}
              </label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
                placeholder={label}
              />
            </div>
          ))}

          <button className="mt-2 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-400/20">
            Solicitar registro
          </button>
        </div>
      </section>
    </main>
  )
}
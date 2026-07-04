import AppHeader from '../components/AppHeader'

type ModulePlaceholderPageProps = {
  title: string
  description: string
  icon: string
  moduleType: 'Usuario' | 'Gestión'
}

export default function ModulePlaceholderPage({
  title,
  description,
  icon,
  moduleType,
}: ModulePlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <AppHeader title={title} subtitle={moduleType} />

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="mx-auto flex h-28 w-28 items-center justify-center">
            <img
              src={icon}
              alt={title}
              className="h-full w-full object-contain drop-shadow-xl"
            />
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
              {moduleType}
            </p>

            <h1 className="mt-3 text-3xl font-bold">{title}</h1>

            <p className="mt-4 text-sm leading-6 text-slate-300">
              {description}
            </p>
          </div>

          <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            <p className="text-sm font-semibold text-cyan-200">
              Pantalla en construcción
            </p>

            <p className="mt-1 text-sm leading-6 text-slate-300">
              Esta ruta ya está conectada. El siguiente paso será convertirla en
              el módulo funcional con formularios, filtros, tablas y conexión a
              base de datos.
            </p>
          </div>
        </section>
      </section>
    </main>
  )
}
import { useEffect, type ReactNode } from 'react'
import AppHeader from './AppHeader'
import { AEKIA_BUILD_VERSION } from '../lib/helpers'
import { logAuditEvent } from '../lib/audit'

type ModuleShellProps = {
  title: string
  subtitle: string
  icon: string
  moduleType?: string
  version?: string
  children: ReactNode
}

export default function ModuleShell({
  title,
  subtitle,
  icon,
  moduleType = 'AEKIA',
  version,
  children,
}: ModuleShellProps) {
  useEffect(() => {
    logAuditEvent(title, 'consulta', { moduleType, version: version ?? AEKIA_BUILD_VERSION })
  }, [title, moduleType, version])

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen w-full max-w-md px-5 py-5">
        <AppHeader title={title} subtitle={subtitle} />

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center">
              <img
                src={icon}
                alt={title}
                className="h-full w-full object-contain drop-shadow-xl"
              />
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">
                {moduleType}
              </p>

              <h1 className="mt-2 text-2xl font-bold">{title}</h1>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                {subtitle}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            {version ?? AEKIA_BUILD_VERSION}
          </p>
        </section>

        <section className="mt-5 space-y-4 pb-8">{children}</section>
      </section>
    </main>
  )
}

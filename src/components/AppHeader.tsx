import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLogo from './AppLogo'
import { supabase } from '../lib/supabaseClient'

type AppHeaderProps = {
  title: string
  subtitle?: string
  showBack?: boolean
  showAlerts?: boolean
  showLogout?: boolean
}

type AlertRow = {
  key: string
  title: string
  message: string
  type?: 'danger' | 'warning' | 'info' | 'success'
}

function alertClasses(type?: AlertRow['type']) {
  if (type === 'danger') return 'border-red-400/30 bg-red-400/10 text-red-100'
  if (type === 'warning') return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  if (type === 'success') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
  return 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
}

export default function AppHeader({
  title,
  subtitle,
  showBack = true,
  showAlerts = true,
  showLogout = true,
}: AppHeaderProps) {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [showAlertPanel, setShowAlertPanel] = useState(false)

  useEffect(() => {
    if (!showAlerts) return
    loadAlerts()
  }, [showAlerts])

  async function loadAlerts() {
    const { data, error } = await supabase.rpc('aekia_current_alerts')
    if (error || !Array.isArray(data)) { setAlerts([]); return }
    setAlerts(data.filter((item): item is AlertRow => Boolean(item?.key && item?.title)))
  }

  async function dismissAlert(key: string) {
    await supabase.rpc('aekia_dismiss_alert', { p_alert_key: key })
    setAlerts((current) => current.filter((alert) => alert.key !== key))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {showBack ? (
            <button
              type="button"
              onClick={() => navigate('/menu')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-bold text-cyan-300 transition active:scale-[0.97]"
              aria-label="Regresar"
              title="Regresar"
            >
              ‹
            </button>
          ) : (
            <AppLogo size="sm" />
          )}

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">AEKIA</p>
            <h1 className="mt-1 max-w-[190px] truncate text-base font-bold">{title}</h1>
            {subtitle && <p className="mt-0.5 max-w-[190px] truncate text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showAlerts && (
            <button
              type="button"
              onClick={() => setShowAlertPanel(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5 transition active:scale-[0.97]"
              aria-label="Alertas"
              title="Alertas"
            >
              <img src="/icons/icon-alerts.png" alt="Alertas" className="h-full w-full scale-125 object-contain drop-shadow-lg" />
              {alerts.length > 0 && <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-red-400" />}
            </button>
          )}

          {showLogout && (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5 transition active:scale-[0.97]"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <img src="/icons/icon-logout.png" alt="Cerrar sesión" className="h-full w-full scale-125 object-contain drop-shadow-lg" />
            </button>
          )}
        </div>
      </header>

      {showAlertPanel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 pb-4 pt-16 backdrop-blur-sm sm:items-center sm:pb-16">
          <section className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Alertas</h2>
              <button type="button" onClick={() => setShowAlertPanel(false)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200">Cerrar</button>
            </div>
            <div className="mt-4 space-y-3">
              {alerts.length === 0 && <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">No tienes alertas pendientes.</p>}
              {alerts.map((alert) => (
                <div key={alert.key} className={`rounded-2xl border p-3 ${alertClasses(alert.type)}`}>
                  <p className="text-sm font-bold">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-90">{alert.message}</p>
                  <button type="button" onClick={() => dismissAlert(alert.key)} className="mt-3 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold">Dismiss</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

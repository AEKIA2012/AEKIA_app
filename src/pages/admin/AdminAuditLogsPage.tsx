import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import { Field, SecondaryButton, StatusBadge } from '../../components/FormControls'
import { downloadXlsx } from '../../lib/exportExcel'
import { formatDate, sanitizeFilename, todayIso } from '../../lib/helpers'
import { supabase } from '../../lib/supabaseClient'

type RelatedProfile = { display_name: string | null; email: string | null }
type RelatedOne<T> = T | T[] | null

type AuditRow = {
  id: string
  module: string
  action: string
  entity_table: string | null
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
  user_profiles: RelatedOne<RelatedProfile>
}

function getOne<T>(value: RelatedOne<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function isoMonthsAgo(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function shortJson(value: Record<string, unknown> | null) {
  if (!value) return ''
  const text = JSON.stringify(value)
  return text.length > 140 ? `${text.slice(0, 140)}...` : text
}

export default function AdminAuditLogsPage() {
  const [fromDate, setFromDate] = useState(isoMonthsAgo(2))
  const [toDate, setToDate] = useState(todayIso())
  const [moduleFilter, setModuleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadRows() {
    setLoading(true)
    setErrorMessage(null)
    let query = supabase
      .from('audit_logs')
      .select('id, module, action, entity_table, entity_id, old_values, new_values, created_at, user_profiles(display_name, email)')
      .gte('created_at', `${fromDate}T00:00:00`)
      .lte('created_at', `${toDate}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(500)

    if (moduleFilter.trim()) query = query.ilike('module', `%${moduleFilter.trim()}%`)

    const { data, error } = await query
    setLoading(false)
    if (error) { setErrorMessage(error.message); setRows([]); return }
    setRows((data ?? []) as unknown as AuditRow[])
  }

  useEffect(() => { loadRows() }, [])

  const filteredRows = useMemo(() => {
    const clean = search.trim().toLowerCase()
    if (!clean) return rows
    return rows.filter((row) => {
      const profile = getOne(row.user_profiles)
      return [
        row.module,
        row.action,
        row.entity_table ?? '',
        row.entity_id ?? '',
        profile?.display_name ?? '',
        profile?.email ?? '',
        shortJson(row.new_values),
        shortJson(row.old_values),
      ].join(' ').toLowerCase().includes(clean)
    })
  }, [rows, search])

  function exportLogs() {
    downloadXlsx(
      `auditoria-aekia-${sanitizeFilename(fromDate)}-${sanitizeFilename(toDate)}.xlsx`,
      'Auditoria',
      ['Fecha', 'Usuario', 'Correo', 'Módulo', 'Acción', 'Tabla', 'Entidad', 'Antes', 'Después'],
      filteredRows.map((row) => {
        const profile = getOne(row.user_profiles)
        return [
          formatDate(row.created_at),
          profile?.display_name ?? '',
          profile?.email ?? '',
          row.module,
          row.action,
          row.entity_table ?? '',
          row.entity_id ?? '',
          JSON.stringify(row.old_values ?? {}),
          JSON.stringify(row.new_values ?? {}),
        ]
      }),
    )
  }

  return (
    <ModuleShell title="Log / auditoría" subtitle="Consulta accesos, vistas y cambios de los últimos 2 meses." icon="/icons/icon-alerts.png" moduleType="Admin" version="Auditoría v11">
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde" type="date" value={fromDate} onChange={setFromDate} />
          <Field label="Hasta" type="date" value={toDate} onChange={setToDate} />
        </div>
        <div className="mt-3 grid gap-3">
          <Field label="Módulo" value={moduleFilter} onChange={setModuleFilter} placeholder="Ej. Pagos" />
          <Field label="Buscar" value={search} onChange={setSearch} placeholder="Usuario, correo, acción, tabla..." />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton onClick={loadRows}>{loading ? 'Cargando...' : 'Aplicar filtros'}</SecondaryButton>
          <SecondaryButton onClick={exportLogs}>Exportar Excel</SecondaryButton>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">La base conserva auditoría por 2 meses y elimina lo anterior automáticamente al registrar nuevos movimientos.</p>
      </section>

      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[115px_160px_130px_130px_120px_1fr] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            <div>Fecha</div><div>Usuario</div><div>Módulo</div><div>Acción</div><div>Tabla</div><div>Detalle</div>
          </div>
          <div className="divide-y divide-white/10">
            {filteredRows.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">Sin registros.</div>}
            {filteredRows.map((row) => {
              const profile = getOne(row.user_profiles)
              return (
                <div key={row.id} className="grid grid-cols-[115px_160px_130px_130px_120px_1fr] items-start gap-2 px-4 py-3 text-xs">
                  <div>{formatDate(row.created_at)}</div>
                  <div className="min-w-0"><p className="truncate font-semibold text-white">{profile?.display_name ?? 'Sistema'}</p><p className="truncate text-slate-500">{profile?.email ?? ''}</p></div>
                  <div>{row.module}</div>
                  <div><StatusBadge status={row.action} /></div>
                  <div className="truncate text-slate-300">{row.entity_table ?? '-'}</div>
                  <div className="break-words text-slate-400">{shortJson(row.new_values) || shortJson(row.old_values) || row.entity_id || '-'}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </ModuleShell>
  )
}

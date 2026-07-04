import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import { ModalPanel, PrimaryButton, SelectField, StatusBadge, TextArea } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { downloadXlsx } from '../../lib/exportExcel'
import { supabase } from '../../lib/supabaseClient'
import { formatDate, fullName } from '../../lib/helpers'

type ComplaintRow = {
  id: string
  title: string
  description: string
  status: string
  resolution_comment: string | null
  created_at: string
  closed_at: string | null
  members: { first_names: string; paternal_last_name: string; maternal_last_name: string } | null
}

export default function AdminComplaintsPage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'complaints.edit')
  const [rows, setRows] = useState<ComplaintRow[]>([])
  const [selected, setSelected] = useState<ComplaintRow | null>(null)
  const [statusFilter, setStatusFilter] = useState('open')
  const [nextStatus, setNextStatus] = useState('in_process')
  const [resolutionComment, setResolutionComment] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadRows() {
    setErrorMessage(null)
    let query = supabase
      .from('complaints_suggestions')
      .select('id, title, description, status, resolution_comment, created_at, closed_at, members(first_names, paternal_last_name, maternal_last_name)')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) { setErrorMessage(error.message); return }
    setRows((data ?? []) as unknown as ComplaintRow[])
  }

  useEffect(() => { loadRows() }, [statusFilter])

  const openCount = useMemo(() => rows.filter((row) => row.status !== 'closed').length, [rows])

  function openDetail(row: ComplaintRow) {
    setSelected(row)
    setNextStatus(row.status)
    setResolutionComment(row.resolution_comment ?? '')
  }

  async function updateComplaint() {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar quejas, pero no editarlas.'); return }
    if (!selected) return
    if (nextStatus === 'closed' && !resolutionComment.trim()) { setErrorMessage('Para cerrar la queja necesitas comentario obligatorio.'); return }

    const { error } = await supabase
      .from('complaints_suggestions')
      .update({
        status: nextStatus,
        resolution_comment: resolutionComment.trim() || selected.resolution_comment,
        closed_at: nextStatus === 'closed' ? new Date().toISOString() : selected.closed_at,
      })
      .eq('id', selected.id)

    if (error) { setErrorMessage(error.message); return }
    setSelected(null)
    setResolutionComment('')
    await loadRows()
  }

  function exportExcel() {
    downloadXlsx(
      'quejas-aekia.xlsx',
      'Quejas',
      ['Título', 'Detalle', 'Miembro', 'Fecha subida', 'Fecha resolución', 'Estatus', 'Resolución'],
      rows.map((row) => [row.title, row.description, fullName(row.members ?? {}), formatDate(row.created_at), formatDate(row.closed_at), row.status, row.resolution_comment ?? '']),
    )
  }

  return (
    <ModuleShell title="Gestión de quejas" subtitle="Da seguimiento y cierra solicitudes." icon="/icons/icon-complaints-admin.png" moduleType="Gestión" version="Gestión quejas v07">
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      <section className="rounded-[2rem] border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
        Alertas: {openCount > 0 ? `${openCount} queja(s) abiertas o en proceso requieren revisión.` : 'No hay quejas pendientes en el filtro actual.'}
      </section>
      <SelectField label="Estatus" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'open', label: 'Abiertas' }, { value: 'in_process', label: 'En proceso' }, { value: 'closed', label: 'Cerradas' }, { value: 'all', label: 'Todas' }]} />
      <PrimaryButton onClick={exportExcel}>Descargar Excel</PrimaryButton>
      {!canEdit && <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Modo consulta: puedes revisar quejas, pero no cambiar estatus.</section>}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[90px_160px_150px_110px_120px_110px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            <div>Detalle</div><div>Título</div><div>Miembro</div><div>Alta</div><div>Resolución</div><div>Estatus</div>
          </div>
          <div className="divide-y divide-white/10">
            {rows.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">Sin solicitudes.</div>}
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[90px_160px_150px_110px_120px_110px] items-center px-4 py-3 text-sm">
                <button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => openDetail(row)}>Ver</button>
                <div className="truncate">{row.title}</div>
                <div className="truncate text-slate-300">{fullName(row.members ?? {})}</div>
                <div>{formatDate(row.created_at)}</div>
                <div>{formatDate(row.closed_at)}</div>
                <div><StatusBadge status={row.status} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selected && (
        <ModalPanel title={selected.title} onClose={() => setSelected(null)}>
          <div className="space-y-4 text-sm leading-6 text-slate-300">
            <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Miembro</p><p className="mt-1 font-semibold text-white">{fullName(selected.members ?? {}) || '-'}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Detalle</p><p className="mt-2 whitespace-pre-wrap rounded-3xl border border-white/10 bg-white/5 p-4">{selected.description}</p></div>
            <div className="grid grid-cols-2 gap-3"><p>Alta: {formatDate(selected.created_at)}</p><p>Resolución: {formatDate(selected.closed_at)}</p></div>
            <SelectField label="Estatus" value={nextStatus} onChange={setNextStatus} disabled={!canEdit} options={[{ value: 'open', label: 'Abierta' }, { value: 'in_process', label: 'En proceso' }, { value: 'closed', label: 'Cerrada' }]} />
            <TextArea label="Comentario de cierre/seguimiento" value={resolutionComment} onChange={setResolutionComment} rows={5} />
            <div className="grid grid-cols-2 gap-3">
              {canEdit ? <PrimaryButton onClick={updateComplaint}>Guardar</PrimaryButton> : <PrimaryButton onClick={() => setSelected(null)}>Cerrar</PrimaryButton>}
              <button type="button" className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200" onClick={() => setSelected(null)}>Cancelar</button>
            </div>
          </div>
        </ModalPanel>
      )}
    </ModuleShell>
  )
}

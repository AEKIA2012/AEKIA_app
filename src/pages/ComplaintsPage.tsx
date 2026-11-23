import { useEffect, useState } from 'react'
import ModuleShell from '../components/ModuleShell'
import SaveConfirmation from '../components/SaveConfirmation'
import { Field, ModalPanel, PrimaryButton, SelectField, StatusBadge, TextArea } from '../components/FormControls'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/helpers'
import { useCurrentProfile } from '../lib/useCurrentProfile'

type ComplaintRow = {
  id: string
  title: string
  description: string
  status: string
  resolution_comment: string | null
  created_at: string
  closed_at: string | null
}

export default function ComplaintsPage() {
  const { profile, loadingProfile, profileError } = useCurrentProfile()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rows, setRows] = useState<ComplaintRow[]>([])
  const [selected, setSelected] = useState<ComplaintRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function loadComplaints() {
    if (loadingProfile) return

    if (!profile?.id) {
      setErrorMessage(profileError ?? 'No se encontró tu perfil.')
      return
    }

    setLoading(true)
    setErrorMessage(null)

    let query = supabase
      .from('complaints_suggestions')
      .select('id, title, description, status, resolution_comment, created_at, closed_at')
      .eq('user_profile_id', profile.id)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data, error } = await query
    setLoading(false)

    if (error) { setErrorMessage(error.message); setRows([]); return }
    setRows((data ?? []) as ComplaintRow[])
  }

  useEffect(() => { loadComplaints() }, [statusFilter, loadingProfile, profile, profileError])

  async function handleSubmit() {
    if (!profile) return
    if (!title.trim() || !description.trim()) { setErrorMessage('Título y descripción son obligatorios.'); return }

    const { error } = await supabase.from('complaints_suggestions').insert({
      user_profile_id: profile.id,
      member_id: profile.member_id,
      title: title.trim(),
      description: description.trim(),
      status: 'open',
    })

    if (error) { setErrorMessage(error.message); return }
    setTitle('')
    setDescription('')
    setMessage('Solicitud enviada correctamente.')
    await loadComplaints()
  }

  return (
    <ModuleShell title="Quejas y sugerencias" subtitle="Envía solicitudes y consulta tu historial." icon="/icons/icon-complaints.png" moduleType="Usuario" version="Quejas usuario v06">
      <SaveConfirmation message={message} onClose={() => setMessage(null)} />
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}

      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Nueva solicitud</p>
        <div className="mt-4 space-y-4">
          <Field label="Título" value={title} required onChange={setTitle} />
          <TextArea label="Descripción" value={description} required onChange={setDescription} rows={7} />
          <PrimaryButton onClick={handleSubmit}>Mandar</PrimaryButton>
        </div>
      </section>

      <SelectField label="Mi historial" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'open', label: 'Abiertos' }, { value: 'in_process', label: 'En proceso' }, { value: 'closed', label: 'Cerrados' }]} />
      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando historial...</section>}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[430px]">
          <div className="grid grid-cols-[90px_150px_100px_90px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            <div>Detalle</div><div>Título</div><div>Fecha</div><div>Estatus</div>
          </div>
          <div className="divide-y divide-white/10">
            {rows.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">Sin solicitudes.</div>}
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[90px_150px_100px_90px] items-center px-4 py-3 text-sm">
                <button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => setSelected(row)}>Ver</button>
                <div className="truncate">{row.title}</div>
                <div>{formatDate(row.created_at)}</div>
                <div><StatusBadge status={row.status} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selected && (
        <ModalPanel title={selected.title} onClose={() => setSelected(null)}>
          <div className="space-y-4 text-sm leading-6 text-slate-300">
            <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Descripción</p><p className="mt-2 whitespace-pre-wrap rounded-3xl border border-white/10 bg-white/5 p-4">{selected.description}</p></div>
            <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Estatus</p><div className="mt-2"><StatusBadge status={selected.status} /></div></div>
            <div className="grid grid-cols-2 gap-3"><p>Alta: {formatDate(selected.created_at)}</p><p>Cierre: {formatDate(selected.closed_at)}</p></div>
            {selected.resolution_comment && <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Respuesta / resolución</p><p className="mt-2 whitespace-pre-wrap rounded-3xl border border-white/10 bg-white/5 p-4">{selected.resolution_comment}</p></div>}
          </div>
        </ModalPanel>
      )}
    </ModuleShell>
  )
}

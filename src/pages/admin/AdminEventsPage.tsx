import { useEffect, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { Field, ModalPanel, PrimaryButton, SelectField, StatusBadge, TextArea } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { downloadXlsx } from '../../lib/exportExcel'
import { supabase } from '../../lib/supabaseClient'
import { formatDate, fullName, money, sanitizeFilename, statusLabel } from '../../lib/helpers'

type EventRow = {
  id: string
  title: string
  description: string | null
  event_date: string | null
  location: string | null
  has_cost: boolean
  total_cost: number | null
  status: string
}

type RegistrationRow = {
  id: string
  registration_status: string
  registered_at: string
  members: { id: string; first_names: string; paternal_last_name: string; maternal_last_name: string; email: string | null; phone: string | null } | null
}

type GradeRow = {
  member_id: string
  disciplines: { code: string | null; name: string | null } | null
  grade_catalog: { grade_name: string | null } | null
}

export default function AdminEventsPage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'events.edit')
  const [events, setEvents] = useState<EventRow[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [hasCost, setHasCost] = useState(false)
  const [totalCost, setTotalCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function loadEvents() {
    setLoading(true)
    setErrorMessage(null)
    let query = supabase.from('events').select('id, title, description, event_date, location, has_cost, total_cost, status').order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const { data, error } = await query
    setLoading(false)
    if (error) { setErrorMessage(error.message); setEvents([]); return }
    setEvents((data ?? []) as EventRow[])
  }

  async function loadRegistrations(eventId: string) {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('id, registration_status, registered_at, members(id, first_names, paternal_last_name, maternal_last_name, email, phone)')
      .eq('event_id', eventId)
      .order('registered_at', { ascending: true })
    if (error) { setErrorMessage(error.message); setRegistrations([]); return }
    setRegistrations((data ?? []) as unknown as RegistrationRow[])
  }

  useEffect(() => { const timer = window.setTimeout(() => { void loadEvents() }, 0); return () => window.clearTimeout(timer) }, [statusFilter])

  async function createEvent() {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar eventos, pero no crearlos.'); return }
    if (!title.trim()) { setErrorMessage('El nombre del evento es obligatorio.'); return }
    const { error } = await supabase.from('events').insert({ title: title.trim(), description: description.trim() || null, event_date: eventDate || null, location: location.trim() || null, has_cost: hasCost, total_cost: hasCost ? Number(totalCost || 0) : null, status: 'active' })
    if (error) { setErrorMessage(error.message); return }
    setTitle(''); setDescription(''); setEventDate(''); setLocation(''); setHasCost(false); setTotalCost('')
    await loadEvents()
    setSuccessMessage('Evento creado correctamente.')
  }

  function editSelected(event: EventRow) {
    setSelectedEvent(event)
    setTitle(event.title)
    setDescription(event.description ?? '')
    setEventDate(event.event_date ?? '')
    setLocation(event.location ?? '')
    setHasCost(event.has_cost)
    setTotalCost(event.total_cost === null || event.total_cost === undefined ? '' : String(event.total_cost))
    loadRegistrations(event.id)
  }

  async function saveSelected() {
    if (!canEdit || !selectedEvent) { setErrorMessage('Tu rol permite consultar eventos, pero no editarlos.'); return }
    const { error } = await supabase.from('events').update({ title: title.trim(), description: description.trim() || null, event_date: eventDate || null, location: location.trim() || null, has_cost: hasCost, total_cost: hasCost ? Number(totalCost || 0) : null }).eq('id', selectedEvent.id)
    if (error) { setErrorMessage(error.message); return }
    setSelectedEvent(null)
    await loadEvents()
    setSuccessMessage('Evento guardado correctamente.')
  }

  async function updateStatus(eventId: string, status: string, closeModal = false) {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar eventos, pero no cambiar estatus.'); return }
    const { error } = await supabase.from('events').update({ status }).eq('id', eventId)
    if (error) { setErrorMessage(error.message); return }
    if (closeModal) setSelectedEvent(null)
    else if (selectedEvent?.id === eventId) setSelectedEvent({ ...selectedEvent, status })
    await loadEvents()
  }

  async function exportRegistrations() {
    if (!selectedEvent) return
    const memberIds = registrations.map((row) => row.members?.id).filter((id): id is string => Boolean(id))
    const { data: gradeData } = memberIds.length > 0
      ? await supabase
        .from('member_disciplines')
        .select('member_id, disciplines(code, name), grade_catalog(grade_name)')
        .in('member_id', memberIds)
      : { data: [] }

    const grades = new Map<string, Record<string, string>>()
    for (const row of ((gradeData ?? []) as unknown as GradeRow[])) {
      const key = String(row.disciplines?.code ?? row.disciplines?.name ?? '').toLowerCase()
      const discipline = key.includes('iaid') ? 'Iaido' : key.includes('jod') ? 'Jodo' : 'Kendo'
      const current = grades.get(row.member_id) ?? {}
      current[discipline] = row.grade_catalog?.grade_name ?? ''
      grades.set(row.member_id, current)
    }

    downloadXlsx(
      `${sanitizeFilename(selectedEvent.title)}-registrados.xlsx`,
      'Registrados',
      ['Nombre completo', 'Grado Kendo', 'Grado Iaido', 'Grado Jodo'],
      registrations.map((row) => {
        const gradeMap = row.members?.id ? grades.get(row.members.id) ?? {} : {}
        return [fullName(row.members ?? {}), gradeMap.Kendo ?? '', gradeMap.Iaido ?? '', gradeMap.Jodo ?? '']
      }),
    )
  }

  return (
    <ModuleShell title="Gestión de eventos" subtitle="Crea, edita, reactiva eventos y revisa registros." icon="/icons/icon-events-admin.png" moduleType="Gestión" version="Eventos gestión v09">
      <SaveConfirmation message={successMessage} onClose={() => setSuccessMessage(null)} />
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}

      {canEdit && (
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Nuevo evento</p>
          <div className="mt-4 space-y-4">
            <Field label="Nombre" value={title} required onChange={setTitle} />
            <TextArea label="Descripción" value={description} onChange={setDescription} rows={3} />
            <Field label="Fecha" type="date" value={eventDate} onChange={setEventDate} />
            <Field label="Lugar" value={location} onChange={setLocation} />
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"><input type="checkbox" checked={hasCost} onChange={(event) => setHasCost(event.target.checked)} /><span>Este evento tiene costo</span></label>
            {hasCost && <Field label="Total" type="number" value={totalCost} onChange={setTotalCost} />}
            <PrimaryButton onClick={createEvent}>Crear evento</PrimaryButton>
          </div>
        </section>
      )}

      {!canEdit && <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Modo consulta: puedes revisar eventos y registros, pero no crear ni cambiar estatus.</section>}
      <SelectField label="Estatus" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'active', label: 'Activos' }, { value: 'closed', label: 'Cerrados' }, { value: 'cancelled', label: 'Cancelados' }, { value: 'all', label: 'Todos' }]} />
      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando eventos...</section>}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[90px_190px_110px_130px_130px_90px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300"><div>Detalle</div><div>Evento</div><div>Fecha</div><div>Total</div><div>Estatus</div><div>Regs.</div></div>
          <div className="divide-y divide-white/10">
            {events.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">Sin eventos.</div>}
            {events.map((event) => (
              <div key={event.id} className="grid grid-cols-[90px_190px_110px_130px_130px_90px] items-center px-4 py-3 text-sm">
                <button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => editSelected(event)}>Ver</button>
                <div className="truncate font-semibold">{event.title}</div>
                <div>{formatDate(event.event_date)}</div>
                <div>{event.has_cost ? money(event.total_cost) : 'Sin costo'}</div>
                <div><StatusBadge status={event.status} /></div>
                <div className="text-slate-300">—</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selectedEvent && (
        <ModalPanel title={selectedEvent.title} onClose={() => setSelectedEvent(null)}>
          <div className="space-y-4">
            {canEdit ? (
              <>
                <Field label="Nombre" value={title} onChange={setTitle} />
                <TextArea label="Descripción" value={description} onChange={setDescription} rows={4} />
                <Field label="Fecha" type="date" value={eventDate} onChange={setEventDate} />
                <Field label="Lugar" value={location} onChange={setLocation} />
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"><input type="checkbox" checked={hasCost} onChange={(event) => setHasCost(event.target.checked)} /><span>Este evento tiene costo</span></label>
                {hasCost && <Field label="Total" type="number" value={totalCost} onChange={setTotalCost} />}
                <PrimaryButton onClick={saveSelected}>Guardar evento</PrimaryButton>
                <div className="grid grid-cols-3 gap-3"><button type="button" className="rounded-2xl border border-emerald-400/30 px-4 py-3 text-sm font-semibold text-emerald-100" onClick={() => updateStatus(selectedEvent.id, 'active', true)}>Reactivar</button><button type="button" className="rounded-2xl border border-amber-400/30 px-4 py-3 text-sm font-semibold text-amber-100" onClick={() => updateStatus(selectedEvent.id, 'closed', true)}>Cerrar</button><button type="button" className="rounded-2xl border border-red-400/30 px-4 py-3 text-sm font-semibold text-red-100" onClick={() => updateStatus(selectedEvent.id, 'cancelled', true)}>Cancelar</button></div>
              </>
            ) : <p className="whitespace-pre-wrap rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">{selectedEvent.description ?? 'Sin descripción.'}</p>}

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Registrados ({registrations.length})</p><button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={exportRegistrations}>Descargar lista</button></div>
              <div className="mt-3 divide-y divide-white/10">
                {registrations.length === 0 && <p className="py-3 text-sm text-slate-400">Sin registrados.</p>}
                {registrations.map((row) => <div key={row.id} className="py-3 text-sm"><p className="font-semibold">{fullName(row.members ?? {})}</p><p className="text-xs text-slate-500">{row.members?.email ?? ''} · {statusLabel(row.registration_status)}</p></div>)}
              </div>
            </section>
          </div>
        </ModalPanel>
      )}
    </ModuleShell>
  )
}

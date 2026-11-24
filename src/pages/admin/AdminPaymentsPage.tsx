import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { Field, ModalPanel, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { downloadWorkbookXlsx } from '../../lib/exportExcel'
import { supabase } from '../../lib/supabaseClient'
import { currentYear, fullName, formatDate, money, monthLabels, statusLabel } from '../../lib/helpers'

type MemberRow = { id: string; first_names: string; paternal_last_name: string; maternal_last_name: string }
type PeriodRow = { id: string; payment_month: number; due_amount: number }
type PaymentRow = { id: string; member_id: string; period_id: string; payment_status: string; amount_paid: number | null }
type OtherPaymentRow = {
  id: string
  member_id: string
  assigned_amount: number
  amount_paid: number
  payment_status: string
  due_date: string | null
  notes: string | null
  members: MemberRow | null
  other_payment_types: { name: string } | null
  events: { title: string } | null
}
type PaymentLogRow = {
  id: string
  payment_id: string
  member_id: string | null
  new_values: { amount?: number; notes?: string; kind?: string; previous_paid?: number; next_paid?: number } | null
  created_at: string
}

const paymentOptions = [
  { value: 'paid', label: 'Pagado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'partial', label: 'Parcial' },
]

const otherStatusOptions = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'paid', label: 'Pagados' },
  { value: 'all', label: 'Todos' },
]

function paymentLabel(status: string) {
  return statusLabel(status) || 'Pendiente'
}

function paymentClasses(status: string) {
  if (status === 'paid') return 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
  if (status === 'partial') return 'border-amber-400/40 bg-amber-400/15 text-amber-200'
  return 'border-red-400/40 bg-red-400/15 text-red-200'
}

function otherPaymentRemaining(payment: OtherPaymentRow) {
  return Math.max(Number(payment.assigned_amount ?? 0) - Number(payment.amount_paid ?? 0), 0)
}

export default function AdminPaymentsPage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'payments.edit')
  const [year, setYear] = useState(String(currentYear()))
  const [searchText, setSearchText] = useState('')
  const [otherStatusFilter, setOtherStatusFilter] = useState('pending')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [periods, setPeriods] = useState<PeriodRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [otherPayments, setOtherPayments] = useState<OtherPaymentRow[]>([])
  const [paymentLogs, setPaymentLogs] = useState<PaymentLogRow[]>([])
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showChargeModal, setShowChargeModal] = useState(false)
  const [chargeMemberId, setChargeMemberId] = useState('')
  const [chargeName, setChargeName] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeDueDate, setChargeDueDate] = useState('')
  const [chargeNotes, setChargeNotes] = useState('')
  const [selectedOtherPayment, setSelectedOtherPayment] = useState<OtherPaymentRow | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [editingLogId, setEditingLogId] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setErrorMessage(null)

    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('id, first_names, paternal_last_name, maternal_last_name')
      .eq('status', 'active')
      .order('paternal_last_name', { ascending: true })
    if (memberError) { setErrorMessage(memberError.message); setLoading(false); return }

    const { data: periodData, error: periodError } = await supabase
      .from('monthly_payment_periods')
      .select('id, payment_month, due_amount')
      .eq('payment_year', Number(year))
      .order('payment_month', { ascending: true })
    if (periodError) { setErrorMessage(periodError.message); setLoading(false); return }

    const periodIds = (periodData ?? []).map((period) => period.id)
    const { data: paymentData, error: paymentError } = periodIds.length > 0
      ? await supabase.from('monthly_payments').select('id, member_id, period_id, payment_status, amount_paid').in('period_id', periodIds)
      : { data: [], error: null }
    if (paymentError) { setErrorMessage(paymentError.message); setLoading(false); return }

    const { data: otherData, error: otherError } = await supabase
      .from('other_payment_assignments')
      .select('id, member_id, assigned_amount, amount_paid, payment_status, due_date, notes, members(id, first_names, paternal_last_name, maternal_last_name), other_payment_types(name), events(title)')
      .neq('payment_status', 'cancelled')
      .order('created_at', { ascending: false })
    if (otherError) { setErrorMessage(otherError.message); setLoading(false); return }

    const otherIds = (otherData ?? []).map((row) => row.id)
    const { data: logData, error: logError } = otherIds.length > 0
      ? await supabase.from('payment_logs').select('id, payment_id, member_id, new_values, created_at').eq('payment_area', 'other').in('payment_id', otherIds).order('created_at', { ascending: false })
      : { data: [], error: null }
    if (logError) { setErrorMessage(logError.message); setLoading(false); return }

    setMembers((memberData ?? []) as MemberRow[])
    setPeriods((periodData ?? []) as PeriodRow[])
    setPayments((paymentData ?? []) as PaymentRow[])
    setOtherPayments((otherData ?? []) as unknown as OtherPaymentRow[])
    setPaymentLogs((logData ?? []) as unknown as PaymentLogRow[])
    setLoading(false)
  }

  useEffect(() => { const timer = window.setTimeout(() => { void loadData() }, 0); return () => window.clearTimeout(timer) }, [year])

  function getPayment(memberId: string, periodId: string) {
    return payments.find((payment) => payment.member_id === memberId && payment.period_id === periodId)
  }

  function getPaymentStatus(memberId: string, periodId: string) {
    return getPayment(memberId, periodId)?.payment_status ?? 'pending'
  }

  function paidScore(member: MemberRow) {
    return periods.reduce((total, period) => {
      const status = getPaymentStatus(member.id, period.id)
      if (status === 'paid') return total + 2
      if (status === 'partial') return total + 1
      return total
    }, 0)
  }

  async function setPaymentStatus(memberId: string, period: PeriodRow, nextStatus: string) {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar pagos, pero no editarlos.'); return }
    const current = getPayment(memberId, period.id)
    const cellKey = `${memberId}-${period.id}`
    setSavingCell(cellKey)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('monthly_payments')
      .upsert({
        id: current?.id,
        member_id: memberId,
        period_id: period.id,
        payment_status: nextStatus,
        amount_paid: nextStatus === 'paid' ? period.due_amount : nextStatus === 'partial' ? period.due_amount / 2 : 0,
        paid_at: nextStatus === 'paid' ? new Date().toISOString() : null,
      })
      .select('id, member_id, period_id, payment_status, amount_paid')
      .single()

    setSavingCell(null)
    if (error) { setErrorMessage(error.message); return }
    setPayments((currentRows) => [...currentRows.filter((payment) => !(payment.member_id === memberId && payment.period_id === period.id)), data as PaymentRow])
  }

  async function createCharge() {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar pagos, pero no crear cargos.'); return }
    if (!chargeMemberId || !chargeName.trim() || Number(chargeAmount) <= 0) { setErrorMessage('Selecciona integrante, concepto y monto válido.'); return }

    const { data: typeData, error: typeError } = await supabase
      .from('other_payment_types')
      .upsert({ name: chargeName.trim(), default_amount: Number(chargeAmount), status: 'active' }, { onConflict: 'name' })
      .select('id')
      .single()
    if (typeError) { setErrorMessage(typeError.message); return }

    const { error } = await supabase.from('other_payment_assignments').insert({
      payment_type_id: typeData.id,
      member_id: chargeMemberId,
      assigned_amount: Number(chargeAmount),
      amount_paid: 0,
      payment_status: 'pending',
      due_date: chargeDueDate || null,
      notes: chargeNotes.trim() || null,
    })
    if (error) { setErrorMessage(error.message); return }

    setShowChargeModal(false)
    setChargeMemberId('')
    setChargeName('')
    setChargeAmount('')
    setChargeDueDate('')
    setChargeNotes('')
    await loadData()
  }

  function openPaymentModal(payment: OtherPaymentRow) {
    setSelectedOtherPayment(payment)
    setPaymentAmount('')
    setPaymentNotes('')
    setEditingLogId(null)
  }

  function logsForPayment(paymentId: string) {
    return paymentLogs.filter((log) => log.payment_id === paymentId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  }

  async function recalculateOtherPayment(paymentId: string, assignedAmount: number) {
    const { data, error } = await supabase
      .from('payment_logs')
      .select('new_values')
      .eq('payment_area', 'other')
      .eq('payment_id', paymentId)
    if (error) { setErrorMessage(error.message); return false }

    const totalPaid = (data ?? []).reduce((sum, log) => sum + Number((log.new_values as { amount?: number } | null)?.amount ?? 0), 0)
    const nextPaid = Math.min(totalPaid, assignedAmount)
    const nextStatus = nextPaid >= assignedAmount ? 'paid' : nextPaid > 0 ? 'partial' : 'pending'
    const { error: updateError } = await supabase
      .from('other_payment_assignments')
      .update({ amount_paid: nextPaid, payment_status: nextStatus })
      .eq('id', paymentId)
    if (updateError) { setErrorMessage(updateError.message); return false }
    return true
  }

  async function registerOtherPayment() {
    if (!canEdit || !selectedOtherPayment) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setErrorMessage('Captura un abono válido.'); return }

    const { error: logError } = await supabase.from('payment_logs').insert({
      payment_area: 'other',
      payment_id: selectedOtherPayment.id,
      member_id: selectedOtherPayment.member_id,
      old_values: {},
      new_values: { kind: 'abono', amount, notes: paymentNotes.trim() || null },
    })
    if (logError) { setErrorMessage(logError.message); return }

    const ok = await recalculateOtherPayment(selectedOtherPayment.id, Number(selectedOtherPayment.assigned_amount ?? 0))
    if (!ok) return
    setPaymentAmount('')
    setPaymentNotes('')
    setEditingLogId(null)
    await loadData()
    const refreshed = otherPayments.find((item) => item.id === selectedOtherPayment.id)
    if (refreshed) setSelectedOtherPayment(refreshed)
    setSuccessMessage('Abono registrado correctamente.')
  }

  function startEditLog(log: PaymentLogRow) {
    setEditingLogId(log.id)
    setPaymentAmount(String(log.new_values?.amount ?? ''))
    setPaymentNotes(String(log.new_values?.notes ?? ''))
  }

  async function saveEditedLog() {
    if (!canEdit || !selectedOtherPayment || !editingLogId) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setErrorMessage('Captura un abono válido.'); return }
    const currentLog = paymentLogs.find((log) => log.id === editingLogId)
    const { error } = await supabase.from('payment_logs').update({
      new_values: { ...(currentLog?.new_values ?? {}), kind: 'abono', amount, notes: paymentNotes.trim() || null },
    }).eq('id', editingLogId)
    if (error) { setErrorMessage(error.message); return }
    const ok = await recalculateOtherPayment(selectedOtherPayment.id, Number(selectedOtherPayment.assigned_amount ?? 0))
    if (!ok) return
    setPaymentAmount('')
    setPaymentNotes('')
    setEditingLogId(null)
    await loadData()
    const refreshed = otherPayments.find((item) => item.id === selectedOtherPayment.id)
    if (refreshed) setSelectedOtherPayment(refreshed)
    setSuccessMessage('Abono actualizado correctamente.')
  }

  async function deleteLog(logId: string) {
    if (!canEdit || !selectedOtherPayment) return
    if (!window.confirm('¿Eliminar este abono?')) return
    const { error } = await supabase.from('payment_logs').delete().eq('id', logId)
    if (error) { setErrorMessage(error.message); return }
    const ok = await recalculateOtherPayment(selectedOtherPayment.id, Number(selectedOtherPayment.assigned_amount ?? 0))
    if (!ok) return
    await loadData()
    const refreshed = otherPayments.find((item) => item.id === selectedOtherPayment.id)
    if (refreshed) setSelectedOtherPayment(refreshed)
  }

  const filteredMembers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return members
      .filter((member) => fullName(member).toLowerCase().includes(normalizedSearch))
      .sort((a, b) => paidScore(b) - paidScore(a) || fullName(a).localeCompare(fullName(b)))
  }, [members, payments, periods, searchText])

  const filteredOtherPayments = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return otherPayments
      .filter((payment) => {
        const name = fullName(payment.members ?? {}).toLowerCase()
        const concept = String(payment.events?.title ?? payment.other_payment_types?.name ?? '').toLowerCase()
        const matchesText = !normalizedSearch || name.includes(normalizedSearch) || concept.includes(normalizedSearch)
        const matchesStatus = otherStatusFilter === 'all' || (otherStatusFilter === 'pending' ? ['pending', 'partial'].includes(payment.payment_status) : payment.payment_status === 'paid')
        return matchesText && matchesStatus
      })
      .sort((a, b) => otherPaymentRemaining(b) - otherPaymentRemaining(a) || fullName(a.members ?? {}).localeCompare(fullName(b.members ?? {})))
  }, [otherPayments, searchText, otherStatusFilter])

  function exportExcel() {
    downloadWorkbookXlsx(`control-pagos-aekia-${year}.xlsx`, [
      {
        sheetName: 'Mensualidades',
        headers: ['Integrante', ...monthLabels],
        rows: filteredMembers.map((member) => [fullName(member), ...periods.map((period) => paymentLabel(getPaymentStatus(member.id, period.id)))]),
      },
      {
        sheetName: 'Otros cargos',
        headers: ['Integrante', 'Concepto', 'Asignado', 'Pagado', 'Restante', 'Estatus', 'Fecha límite', 'Notas'],
        rows: filteredOtherPayments.map((payment) => [
          fullName(payment.members ?? {}),
          payment.events?.title ?? payment.other_payment_types?.name ?? 'Cargo',
          Number(payment.assigned_amount),
          Number(payment.amount_paid),
          otherPaymentRemaining(payment),
          paymentLabel(payment.payment_status),
          formatDate(payment.due_date),
          payment.notes ?? '',
        ]),
      },
      {
        sheetName: 'Abonos otros cargos',
        headers: ['Integrante', 'Concepto', 'Fecha abono', 'Monto', 'Pagado acumulado', 'Notas'],
        rows: paymentLogs.map((log) => {
          const payment = otherPayments.find((item) => item.id === log.payment_id)
          return [
            fullName(payment?.members ?? {}),
            payment?.events?.title ?? payment?.other_payment_types?.name ?? 'Cargo',
            formatDate(log.created_at),
            Number(log.new_values?.amount ?? 0),
            Number(log.new_values?.next_paid ?? 0),
            log.new_values?.notes ?? '',
          ]
        }),
      },
    ])
  }

  return (
    <ModuleShell title="Control de pagos" subtitle="Administra mensualidades, cargos individuales y abonos." icon="/icons/icon-payments-admin.png" moduleType="Gestión" version="Control pagos v09">
      <SaveConfirmation message={successMessage} onClose={() => setSuccessMessage(null)} />
      <Field label="Año" type="number" value={year} onChange={setYear} />
      <Field label="Filtro" value={searchText} onChange={setSearchText} placeholder="Buscar integrante o concepto" />
      <div className="grid grid-cols-2 gap-3">
        <SecondaryButton onClick={exportExcel}>Exportar Excel</SecondaryButton>
        {canEdit && <PrimaryButton onClick={() => setShowChargeModal(true)}>Nuevo cargo</PrimaryButton>}
      </div>

      {!canEdit && <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Modo consulta: tu rol permite revisar y exportar pagos, pero no modificar registros.</section>}
      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando pagos...</section>}
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}

      <section className="space-y-3">
        {filteredMembers.map((member) => (
          <div key={member.id} className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-bold">{fullName(member)}</p><p className="text-xs text-slate-500">Mensualidades más al corriente aparecen primero.</p></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {periods.map((period) => {
                const currentStatus = getPaymentStatus(member.id, period.id)
                const cellKey = `${member.id}-${period.id}`
                return (
                  <select key={period.id} className={`rounded-2xl border px-2 py-2 text-xs font-bold outline-none ${paymentClasses(currentStatus)}`} value={currentStatus} disabled={savingCell === cellKey || !canEdit} onChange={(event) => setPaymentStatus(member.id, period, event.target.value)}>
                    {paymentOptions.map((option) => <option key={option.value} value={option.value}>{monthLabels[period.payment_month - 1].slice(0, 3)} · {option.label}</option>)}
                  </select>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Otros cargos</div>
        <div className="p-4"><SelectField label="Estatus de otros cargos" value={otherStatusFilter} onChange={setOtherStatusFilter} options={otherStatusOptions} /></div>
        <div className="divide-y divide-white/10">
          {filteredOtherPayments.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">Sin otros cargos con ese filtro.</div>}
          {filteredOtherPayments.map((payment) => {
            const remaining = otherPaymentRemaining(payment)
            return (
              <div key={payment.id} className="px-4 py-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{fullName(payment.members ?? {})}</p><p className="mt-1 text-xs text-slate-400">{payment.events?.title ?? payment.other_payment_types?.name} · Asignado {money(payment.assigned_amount)} · Pagado {money(payment.amount_paid)} · Restante {money(remaining)}</p>{payment.due_date && <p className="mt-1 text-xs text-slate-500">Fecha límite: {formatDate(payment.due_date)}</p>}{payment.notes && <p className="mt-2 text-xs text-slate-500">{payment.notes}</p>}</div>
                  <div className="flex shrink-0 flex-col items-end gap-2"><StatusBadge status={payment.payment_status} />{canEdit && <button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => openPaymentModal(payment)}>Detalle / abonos</button>}</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {showChargeModal && (
        <ModalPanel title="Nuevo cargo individual" onClose={() => setShowChargeModal(false)}>
          <div className="space-y-4">
            <SelectField label="Integrante" value={chargeMemberId} onChange={setChargeMemberId} options={[{ value: '', label: 'Selecciona...' }, ...members.map((member) => ({ value: member.id, label: fullName(member) }))]} />
            <Field label="Concepto" value={chargeName} onChange={setChargeName} placeholder="Ej. Bogu, shinai, seminario..." />
            <Field label="Monto asignado a esta persona" type="number" value={chargeAmount} onChange={setChargeAmount} />
            <Field label="Fecha límite" type="date" value={chargeDueDate} onChange={setChargeDueDate} />
            <TextArea label="Notas" value={chargeNotes} onChange={setChargeNotes} rows={4} />
            <PrimaryButton onClick={createCharge}>Crear cargo</PrimaryButton>
          </div>
        </ModalPanel>
      )}

      {selectedOtherPayment && (
        <ModalPanel title="Detalle de abonos" onClose={() => { setSelectedOtherPayment(null); setEditingLogId(null); setPaymentAmount(''); setPaymentNotes('') }}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-300">{fullName(selectedOtherPayment.members ?? {})}<br />{selectedOtherPayment.events?.title ?? selectedOtherPayment.other_payment_types?.name}<br />Asignado: <strong className="text-white">{money(selectedOtherPayment.assigned_amount)}</strong> · Pagado: <strong className="text-white">{money(selectedOtherPayment.amount_paid)}</strong> · Restante: <strong className="text-white">{money(otherPaymentRemaining(selectedOtherPayment))}</strong></p>
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-bold">Abonos registrados</p>
              <div className="mt-3 divide-y divide-white/10">
                {logsForPayment(selectedOtherPayment.id).length === 0 && <p className="py-3 text-sm text-slate-400">Sin abonos registrados.</p>}
                {logsForPayment(selectedOtherPayment.id).map((log) => (
                  <div key={log.id} className="py-3 text-sm">
                    <p className="font-semibold">{money(log.new_values?.amount ?? 0)} <span className="text-xs font-normal text-slate-500">· {formatDate(log.created_at)}</span></p>
                    {log.new_values?.notes && <p className="mt-1 text-xs text-slate-400">{log.new_values.notes}</p>}
                    {canEdit && <div className="mt-2 flex gap-2"><button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => startEditLog(log)}>Editar</button><button type="button" className="rounded-xl border border-red-400/30 px-3 py-2 text-xs text-red-100" onClick={() => deleteLog(log.id)}>Eliminar</button></div>}
                  </div>
                ))}
              </div>
            </section>
            {selectedOtherPayment.payment_status !== 'paid' || editingLogId ? <>
              <Field label={editingLogId ? 'Monto del abono a editar' : 'Monto del nuevo abono'} type="number" value={paymentAmount} onChange={setPaymentAmount} />
              <TextArea label="Notas del abono" value={paymentNotes} onChange={setPaymentNotes} rows={3} />
              <div className="grid grid-cols-2 gap-3"><PrimaryButton onClick={editingLogId ? saveEditedLog : registerOtherPayment}>{editingLogId ? 'Guardar cambio' : 'Guardar abono'}</PrimaryButton>{editingLogId && <SecondaryButton onClick={() => { setEditingLogId(null); setPaymentAmount(''); setPaymentNotes('') }}>Cancelar edición</SecondaryButton>}</div>
            </> : <p className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">Este cargo ya está saldado.</p>}
          </div>
        </ModalPanel>
      )}
    </ModuleShell>
  )
}

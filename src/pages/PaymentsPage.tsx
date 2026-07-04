import { useEffect, useState } from 'react'
import ModuleShell from '../components/ModuleShell'
import { Field, StatusBadge } from '../components/FormControls'
import { supabase } from '../lib/supabaseClient'
import { currentYear, money, monthLabels } from '../lib/helpers'
import { useCurrentProfile } from '../lib/useCurrentProfile'

type MonthlyPaymentRow = {
  id: string
  payment_status: string
  amount_paid: number | null
  paid_at: string | null
  monthly_payment_periods: {
    payment_month: number
    due_amount: number
  } | null
}

type OtherPaymentRow = {
  id: string
  assigned_amount: number
  amount_paid: number
  payment_status: string
  due_date: string | null
  notes: string | null
  other_payment_types: {
    name: string
  } | null
  events: {
    title: string
  } | null
}

function paymentSymbol(status: string) {
  if (status === 'paid') return '✓'
  if (status === 'partial') return '◐'
  return '□'
}

function paymentClasses(status: string) {
  if (status === 'paid') return 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
  if (status === 'partial') return 'border-amber-400/40 bg-amber-400/15 text-amber-200'
  return 'border-red-400/40 bg-red-400/15 text-red-200'
}

function paymentText(status: string) {
  if (status === 'paid') return 'Pagado'
  if (status === 'partial') return 'Parcial'
  if (status === 'waived') return 'Condonado'
  return 'Pendiente'
}

export default function PaymentsPage() {
  const { profile, loadingProfile, profileError } = useCurrentProfile()
  const [year, setYear] = useState(String(currentYear()))
  const [monthlyRows, setMonthlyRows] = useState<MonthlyPaymentRow[]>([])
  const [otherRows, setOtherRows] = useState<OtherPaymentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadPayments() {
      if (loadingProfile) return

      if (!profile?.member_id) {
        setErrorMessage(profileError ?? 'Tu usuario todavía no está vinculado a un miembro.')
        return
      }

      setLoading(true)
      setErrorMessage(null)

      const { data: monthlyData, error: monthlyError } = await supabase
        .from('monthly_payments')
        .select('id, payment_status, amount_paid, paid_at, monthly_payment_periods(payment_month, due_amount)')
        .eq('member_id', profile.member_id)
        .eq('monthly_payment_periods.payment_year', Number(year))

      if (monthlyError) {
        setErrorMessage(monthlyError.message)
        setLoading(false)
        return
      }

      const { data: otherData, error: otherError } = await supabase
        .from('other_payment_assignments')
        .select('id, assigned_amount, amount_paid, payment_status, due_date, notes, other_payment_types(name), events(title)')
        .eq('member_id', profile.member_id)
        .neq('payment_status', 'cancelled')
        .order('created_at', { ascending: false })

      setLoading(false)

      if (otherError) {
        setErrorMessage(otherError.message)
        return
      }

      setMonthlyRows((monthlyData ?? []) as unknown as MonthlyPaymentRow[])
      setOtherRows((otherData ?? []) as unknown as OtherPaymentRow[])
    }

    loadPayments()
  }, [year, loadingProfile, profile, profileError])

  const monthlyMap = new Map<number, MonthlyPaymentRow>()
  for (const row of monthlyRows) {
    const month = row.monthly_payment_periods?.payment_month
    if (month) monthlyMap.set(month, row)
  }

  return (
    <ModuleShell
      title="Mis pagos"
      subtitle="Consulta mensualidades, pagos asignados y adeudos."
      icon="/icons/icon-payments.png"
      moduleType="Usuario"
      version="Pagos usuario v06"
    >
      <Field label="Año" type="number" value={year} onChange={setYear} />

      {loading && <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-300">Cargando pagos...</section>}
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}

      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Mensualidades</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {monthLabels.map((label, index) => {
            const payment = monthlyMap.get(index + 1)
            const status = payment?.payment_status ?? 'pending'
            return (
              <div key={label} className={`rounded-2xl border p-3 text-center ${paymentClasses(status)}`}>
                <p className="text-xs opacity-90">{label.slice(0, 3)}</p>
                <p className="mt-2 text-2xl font-black">{paymentSymbol(status)}</p>
                <p className="mt-1 text-[11px] font-semibold">{paymentText(status)}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">Verde: pagado · Amarillo: parcial · Rojo: pendiente.</p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
          Otros pagos asignados
        </div>
        <div className="divide-y divide-white/10">
          {otherRows.length === 0 && <div className="px-4 py-5 text-sm text-slate-300">Sin otros pagos registrados.</div>}
          {otherRows.map((row) => {
            const remaining = Math.max(Number(row.assigned_amount ?? 0) - Number(row.amount_paid ?? 0), 0)
            return (
              <div key={row.id} className="px-4 py-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.events?.title ?? row.other_payment_types?.name ?? 'Pago'}</p>
                    <p className="mt-1 text-xs text-slate-400">Asignado: {money(row.assigned_amount)} · Pagado: {money(row.amount_paid)} · Restante: {money(remaining)}</p>
                    {row.due_date && <p className="mt-1 text-xs text-slate-500">Vence: {row.due_date}</p>}
                    {row.notes && <p className="mt-2 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-xs leading-5 text-slate-300">{row.notes}</p>}
                  </div>
                  <StatusBadge status={paymentText(row.payment_status)} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </ModuleShell>
  )
}

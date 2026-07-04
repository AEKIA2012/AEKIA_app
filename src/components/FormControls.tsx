import { useRef, type ReactNode } from 'react'
import { statusLabel } from '../lib/helpers'
type FieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  required?: boolean
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  required = false,
}: FieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isDate = type === 'date'

  function openDatePicker() {
    if (disabled || !inputRef.current) return
    const input = inputRef.current as HTMLInputElement & { showPicker?: () => void }
    input.focus()
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-200">
        {required ? '*' : ''}
        {label}
      </label>

      <div className={isDate ? 'space-y-2' : ''}>
        <input
          ref={inputRef}
          className={`w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300 ${
            disabled ? 'cursor-not-allowed opacity-60' : ''
          }`}
          type={type}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onFocus={isDate ? openDatePicker : undefined}
          onClick={isDate ? openDatePicker : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {isDate && (
          <button
            type="button"
            onClick={openDatePicker}
            disabled={disabled}
            className="flex h-12 w-full items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-xl text-cyan-100 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Abrir calendario para ${label}`}
            title="Abrir calendario"
          >
            📅
          </button>
        )}
      </div>
    </div>
  )
}

type TextAreaProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  rows?: number
}

export function TextArea({
  label,
  value,
  onChange,
  required = false,
  rows = 5,
}: TextAreaProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-200">
        {required ? '*' : ''}
        {label}
      </label>

      <textarea
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

type SelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: SelectProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-200">
        {label}
      </label>

      <select
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

type PrimaryButtonProps = {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  onClick,
  disabled = false,
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const isGood = ['active', 'paid', 'registered', 'closed', 'success', 'present', 'activa', 'activo'].includes(normalized)
  const isWarning = ['pending', 'partial', 'in_process', 'late', 'abierto', 'open'].includes(normalized)

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
        isGood
          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
          : isWarning
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
            : 'border-red-400/30 bg-red-400/10 text-red-200'
      }`}
    >
      {statusLabel(status)}
    </span>
  )
}


export function ModalPanel({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 pb-4 pt-16 backdrop-blur-sm sm:items-center sm:pb-16">
      <section className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-xl font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-xl text-slate-200"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

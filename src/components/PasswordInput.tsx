import { useState } from 'react'

type PasswordInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  onEnter?: () => void
}

export default function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  onEnter,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const inputId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor={inputId}>
        {label}
      </label>

      <div className="relative">
        <input
          id={inputId}
          className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 pr-14 text-white outline-none transition focus:border-cyan-300"
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onEnter?.()
            }
          }}
        />

        <button
          type="button"
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-cyan-200 transition active:scale-[0.97]"
          aria-label={visible ? 'Ocultar password' : 'Mostrar password'}
          title={visible ? 'Ocultar password' : 'Mostrar password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  )
}

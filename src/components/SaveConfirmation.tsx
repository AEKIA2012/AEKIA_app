import { useEffect } from 'react'

type Props = { message: string | null; onClose: () => void }

export default function SaveConfirmation({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [message, onClose])

  if (!message) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-5" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="save-confirmation-title" aria-describedby="save-confirmation-message" className="w-full max-w-sm rounded-[2rem] border border-emerald-400/40 bg-slate-900 p-6 text-center text-white shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/20 text-4xl text-emerald-300" aria-hidden="true">✓</div>
        <h2 id="save-confirmation-title" className="mt-4 text-xl font-extrabold">Operación realizada</h2>
        <p id="save-confirmation-message" className="mt-3 text-sm leading-6 text-slate-200">{message}</p>
        <button type="button" autoFocus onClick={onClose} className="mt-6 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-400/20 transition active:scale-[0.98]">Entendido</button>
      </section>
    </div>
  )
}

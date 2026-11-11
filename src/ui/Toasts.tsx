import { useEffect } from 'react'
import { useGame, type Toast } from '../state/gameStore'

const TOAST_SECONDS = 3.6

/** Short messages that slide in at the top of the screen and leave by themselves. */
export function Toasts() {
  const toasts = useGame((state) => state.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((state) => state.dismissToast)
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [toast.id, dismiss])
  return <div className="toast">{toast.text}</div>
}

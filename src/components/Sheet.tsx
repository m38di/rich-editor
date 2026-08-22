import { useEffect } from 'react'
import { Xmark } from './icons'

interface SheetProps {
  onClose: () => void
  title: string
  /** dialogs that render their own Cancel/Done header pass `bare` */
  bare?: boolean
  children: React.ReactNode
}

export function Sheet({ onClose, title, bare, children }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />

      <div className="ios-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />

        {!bare && (
          <div className="sheet-head">
            <span className="sheet-heading">{title}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <Xmark size={18} />
            </button>
          </div>
        )}

        <div className="sheet-scroll">{children}</div>
      </div>
    </>
  )
}

import { useEffect } from 'react'

interface SheetProps {
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Sheet({ onClose, title, children }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        className="sheet-backdrop"
        onClick={onClose}
        aria-hidden
      />

      <div
        className="ios-sheet"
        role="dialog"
        aria-label={title}
      >
        <div className="grabber" />
        <div className="sheet-scroll">
          {children}
        </div>
      </div>
    </>
  )
}

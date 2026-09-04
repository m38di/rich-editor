import { useCallback, useRef, useState } from 'react'

/**
 * Plays the CSS "closing" phase before unmounting, so sheets/dialogs can
 * animate OUT instead of vanishing. The caller renders `${closing ? ' closing' : ''}`
 * on the animated elements and invokes `close()` from every dismiss path
 * (Esc, backdrop, X, Cancel) — `onClose` fires once, after `ms`.
 */
export function useAnimatedClose(onClose: () => void, ms = 240) {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(onClose, ms)
  }, [onClose, ms])

  return { closing, close }
}

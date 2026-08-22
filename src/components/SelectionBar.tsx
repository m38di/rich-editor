// src/components/SelectionBar.tsx — floats the formatting strip next to the
// current selection (Notion/Medium style) instead of pinning it to a bar.
// Falls back to below the selection when there is no room above.

import { useLayoutEffect, useRef, useState } from 'react'
import { EditorView } from 'prosemirror-view'
import { Command } from 'prosemirror-state'
import { SelectionInfo } from '../editor/plugins'
import { FormattingPanel } from './FormattingPanel'

interface SelectionBarProps {
  info: SelectionInfo
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  onOpenLink: () => void
  onOpenDate: () => void
  onOpenMath: () => void
  /** px of chrome that must stay clear at the bottom on small screens */
  bottomInset: number
}

const GAP = 10
const EDGE = 8

export function SelectionBar({ info, viewRef, run, bottomInset, ...handlers }: SelectionBarProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const view = viewRef.current
    const el = ref.current
    if (!view || !el) return

    const { from, to } = view.state.selection
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)

    const box = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const centre = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2
    let left = centre - box.width / 2
    left = Math.max(EDGE, Math.min(left, vw - box.width - EDGE))

    const above = Math.min(start.top, end.top) - box.height - GAP
    const below = Math.max(start.bottom, end.bottom) + GAP
    const topLimit = 70
    const inset = vw < 768 ? bottomInset : 16
    const bottomLimit = vh - inset - box.height - GAP

    let top = above
    if (above < topLimit) top = below
    top = Math.max(topLimit, Math.min(top, Math.max(topLimit, bottomLimit)))

    setPos({ top, left })
  }, [info, viewRef, bottomInset])

  return (
    <div
      ref={ref}
      className="fmt-float"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <FormattingPanel info={info} run={run} {...handlers} />
    </div>
  )
}

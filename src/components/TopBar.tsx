// src/components/TopBar.tsx — Telegram iOS navigation bar:
// translucent vibrancy, back chevron, centered title, undo/redo with the
// widget's own iv_undo / iv_redo drawables.

import { Iv } from './ivIcons'
import { ChevronLeft } from './icons'

interface TopBarProps {
  canUndo: boolean
  canRedo: boolean
  chars: number
  onUndo: () => void
  onRedo: () => void
}

export function TopBar({ canUndo, canRedo, chars, onUndo, onRedo }: TopBarProps) {
  return (
    <header className="ios-nav ios-vibrancy">
      <div className="absolute left-1.5 flex items-center">
        <button type="button" className="ios-icon-btn" title="Close" aria-label="Close">
          <ChevronLeft size={24} />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 text-center">
        <div className="ios-nav-title">Rich Editor</div>
        <div className="ios-nav-sub tabular-nums">
          {chars.toLocaleString()} characters · HTML export
        </div>
      </div>
      <div className="absolute right-1.5 flex items-center">
        <button
          type="button"
          onClick={onImportHtml}
        >
          Import HTML
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="ios-icon-btn"
          title="Undo"
          aria-label="Undo"
        >
          <Iv name="undo" size={21} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="ios-icon-btn"
          title="Redo"
          aria-label="Redo"
        >
          <Iv name="redo" size={21} />
        </button>
      </div>
    </header>
  )
}

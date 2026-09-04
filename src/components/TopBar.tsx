// src/components/TopBar.tsx — the app bar: live document title/stats,
// undo/redo, theme switch and the primary Generate action.

import { Iv } from './ivIcons'
import { Sun, Moon, Auto, Sparkle, Upload } from './icons'
import type { ThemeChoice } from '../hooks/useTheme'

interface TopBarProps {
  title: string
  canUndo: boolean
  canRedo: boolean
  chars: number
  words: number
  theme: ThemeChoice
  onCycleTheme: () => void
  onUndo: () => void
  onRedo: () => void
  onImport: () => void
  onGenerate: () => void
}

const THEME_LABEL: Record<ThemeChoice, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Follows your system',
}

function ThemeGlyph({ theme }: { theme: ThemeChoice }) {
  if (theme === 'light') return <Sun size={18} />
  if (theme === 'dark') return <Moon size={18} />
  return <Auto size={18} />
}

export function TopBar({
  title,
  canUndo,
  canRedo,
  chars,
  words,
  theme,
  onCycleTheme,
  onUndo,
  onRedo,
  onImport,
  onGenerate,
}: TopBarProps) {
  const minutes = Math.max(1, Math.round(words / 220))

  return (
    <header className="app-bar">
      {/* the document itself is the title — brand lives nowhere in the bar */}
      <span className="bar-doc-title">
        <Sparkle size={13} className="shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{title}</span>
      </span>

      <div className="flex-1" />

      <span className="stat-chip hidden lg:inline-flex" title="Document statistics">
        <span className="dot" aria-hidden />
        {words.toLocaleString()} words · {chars.toLocaleString()} chars · {minutes} min read
      </span>

      <span className="mx-1 hidden h-6 w-px bg-ios-sep lg:block" aria-hidden />

      {/* Import — the inverse of Generate/Download: opens an .html file
          back into the editor (single undo step, like Telegram history) */}
      <button
        type="button"
        onClick={onImport}
        className="icon-btn"
        title="Import .html file"
        aria-label="Import HTML file"
      >
        <Upload size={20} />
      </button>

      {/* Telegram history pill — undo+redo share one 22px-radius pill */}
      <div className="history-pill">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="icon-btn"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Iv name="undo" size={20} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="icon-btn"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Iv name="redo" size={20} />
        </button>
      </div>

      <button
        type="button"
        onClick={onCycleTheme}
        className="history-pill icon-btn"
        style={{ width: 44, height: 44, borderRadius: 22 }}
        title={`${THEME_LABEL[theme]} — click to change`}
        aria-label={`Theme: ${THEME_LABEL[theme]}`}
      >
        <ThemeGlyph theme={theme} />
      </button>
    </header>
  )
}

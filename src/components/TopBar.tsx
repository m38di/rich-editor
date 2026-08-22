// src/components/TopBar.tsx — the app bar: brand, live document stats,
// undo/redo, theme switch and the primary Generate action.

import { Iv } from './ivIcons'
import { Sun, Moon, Auto, Sparkle } from './icons'
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
  onGenerate,
}: TopBarProps) {
  const minutes = Math.max(1, Math.round(words / 220))

  return (
    <header className="app-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Sparkle size={19} />
        </span>
        <span className="min-w-0">
          <span className="brand-title block">Rich Editor</span>
          <span className="brand-sub block max-w-[38vw] sm:max-w-[320px]">{title}</span>
        </span>
      </div>

      <div className="flex-1" />

      <span className="stat-chip hidden lg:inline-flex" title="Document statistics">
        <span className="dot" aria-hidden />
        {words.toLocaleString()} words · {chars.toLocaleString()} chars · {minutes} min read
      </span>

      <span className="mx-1 hidden h-6 w-px bg-ios-sep lg:block" aria-hidden />

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="icon-btn"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Iv name="undo" size={19} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="icon-btn"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <Iv name="redo" size={19} />
      </button>

      <button
        type="button"
        onClick={onCycleTheme}
        className="icon-btn"
        title={`${THEME_LABEL[theme]} — click to change`}
        aria-label={`Theme: ${THEME_LABEL[theme]}`}
      >
        <ThemeGlyph theme={theme} />
      </button>

      <button
        type="button"
        onClick={onGenerate}
        className="pill-btn primary ml-1.5"
        title="Generate HTML → Preview → Download"
      >
        <Iv name="send_plane_24" size={16} />
        <span className="hidden sm:inline">Generate</span>
      </button>
    </header>
  )
}

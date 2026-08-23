// src/components/FormattingPanel.tsx — Telegram-style formatting chrome:
// three adjacent floating pills (RichEditor.java formattingLayout1/2/3),
// each 44px tall with 2px inner padding and 8px gaps between pills.
//
// BUG FIX kept from before: every button preventDefaults mousedown —
// otherwise the click steals focus from the editor, ProseMirror collapses
// the selection, and the command silently does nothing.

import { Command } from 'prosemirror-state'
import { SelectionInfo } from '../editor/plugins'
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleMono,
  toggleSpoiler,
  toggleSub,
  toggleSup,
  toggleHighlight,
  clearFormatting,
  setTextType,
} from '../editor/commands'
import { Iv } from './ivIcons'
import { Calendar, ClearFormat } from './icons'

interface FormattingPanelProps {
  info: SelectionInfo
  run: (cmd: Command) => void
  onOpenLink: () => void
  onOpenDate: () => void
  onOpenMath: () => void
}

interface Btn {
  key: string
  label: React.ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

const keepSelection = (e: React.MouseEvent) => e.preventDefault()

function Pill({
  buttons,
  scroll,
  delay = 0,
}: {
  buttons: Btn[]
  scroll?: boolean
  delay?: number
}) {
  return (
    <div
      className={`fmt-pill${scroll ? ' fmt-pill-scroll' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          title={b.title}
          aria-label={b.title}
          aria-pressed={!!b.active}
          disabled={b.disabled}
          onMouseDown={keepSelection}
          onClick={b.onClick}
          className={`fmt-btn ${b.active ? 'on' : ''}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

export function FormattingPanel({ info, run, onOpenLink, onOpenDate, onOpenMath }: FormattingPanelProps) {
  const inHeading = info.block.type === 'heading'
  const empty = info.empty

  // pill 1 — inline styles (scrollable), quote toggles here too like the
  // Android styles row
  const styles: Btn[] = [
    { key: 'b', label: <Iv name="formatting_bold" size={20} />, title: 'Bold (Ctrl+B)', active: info.marks.bold, disabled: inHeading, onClick: () => run(toggleBold) },
    { key: 'i', label: <Iv name="formatting_italic" size={20} />, title: 'Italic (Ctrl+I)', active: info.marks.italic, onClick: () => run(toggleItalic) },
    { key: 'u', label: <Iv name="formatting_underline" size={20} />, title: 'Underline (Ctrl+U)', active: info.marks.underline, onClick: () => run(toggleUnderline) },
    { key: 's', label: <Iv name="formatting_strikethrough" size={20} />, title: 'Strikethrough', active: info.marks.strike, onClick: () => run(toggleStrike) },
    { key: 'spoiler', label: <Iv name="formatting_spoiler" size={20} />, title: 'Spoiler', active: info.marks.spoiler, onClick: () => run(toggleSpoiler) },
    { key: 'mono', label: <Iv name="formatting_code" size={20} />, title: 'Monospace (Ctrl+E)', active: info.marks.code, onClick: () => run(toggleMono) },
    { key: 'mark', label: <Iv name="formatting_marked" size={20} />, title: 'Highlight', active: info.marks.mark, onClick: () => run(toggleHighlight) },
    { key: 'sub', label: <Iv name="sub" size={20} />, title: 'Subscript', active: info.marks.sub, onClick: () => run(toggleSub) },
    { key: 'sup', label: <Iv name="super" size={20} />, title: 'Superscript', active: info.marks.sup, onClick: () => run(toggleSup) },
    { key: 'quote', label: <Iv name="quote" size={20} />, title: info.block.inQuote ? 'Unquote' : 'Quote', active: info.block.inQuote, onClick: () => run(setTextType(info.block.inQuote ? 'unquote' : 'quote')) },
  ]

  // pill 2 — links & dates
  const refs: Btn[] = [
    { key: 'link', label: <Iv name="media_link_24" size={20} />, title: 'Link (Ctrl+K)', disabled: empty, active: !!info.marks.link, onClick: onOpenLink },
    { key: 'date', label: <Calendar size={19} />, title: 'Date & time', disabled: empty, onClick: onOpenDate },
  ]

  // pill 3 — math & reset
  const extras: Btn[] = [
    { key: 'math', label: <Iv name="math" size={20} />, title: 'Inline math', disabled: empty, onClick: onOpenMath },
    { key: 'clear', label: <ClearFormat size={19} />, title: 'Clear formatting', disabled: empty, onClick: () => run(clearFormatting) },
  ]

  return (
    <div className="fmt-bar animate-pop-in" role="toolbar" aria-label="Formatting">
      <Pill buttons={styles} scroll delay={0} />
      <Pill buttons={refs} delay={30} />
      <Pill buttons={extras} delay={60} />
    </div>
  )
}

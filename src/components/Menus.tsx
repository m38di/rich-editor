// src/components/Menus.tsx
//
// Telegram iOS–style sheets, now carrying the REAL widget icons from the
// Android module (iv_h1…iv_h6, iv_quote, iv_todo, iv_details, iv_table_*,
// iv_media_collage, iv_location, iv_math, …). Selection-transforming rows
// preventDefault on mousedown so the editor selection survives the click.

import { useEffect, useState } from 'react'
import { Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { SelectionInfo, SlashState } from '../editor/plugins'
import {
  setTextType,
  wrapBullet,
  wrapOrdered,
  wrapTask,
  unwrapList,
  indentList,
  outdentList,
  insertDivider,
  insertMedia,
  insertMap,
  insertMathBlock,
  insertDetails,
  insertGallery,
} from '../editor/commands'
import {
  addRow,
  addColumn,
  deleteRows,
  deleteColumns,
  toggleBordered,
  toggleStriped,
  findTableContext,
} from '../editor/tableCommands'
import { EMOJI_SET, SlashDef, matchSlash } from '../lib/util'
import { Iv } from './ivIcons'
import { Check } from './icons'
import { Sheet } from './Sheet'

const keepSelection = (e: React.MouseEvent) => e.preventDefault()

/** slash command id → Telegram drawable key */
const SLASH_ICON: Record<string, string> = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  quote: 'quote', pullquote: 'pullquote', code: 'code', footer: 'footer',
  list: 'list', ordered: 'ordered_list', todo: 'todo', toggle: 'details',
  table: 'table', math: 'math', divider: 'divider',
  image: 'media', video: 'media', audio: 'audio', map: 'location',
}

interface RowProps {
  icon?: React.ReactNode
  iconBg?: string
  label: string
  labelStyle?: React.CSSProperties
  sub?: string
  active?: boolean
  disabled?: boolean
  keep?: boolean
  onClick: () => void
}

function Row({ icon, iconBg, label, labelStyle, sub, active, disabled, keep, onClick }: RowProps) {
  return (
    <button
      type="button"
      className="sheet-row"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={keep ? keepSelection : undefined}
    >
      {icon && (
        <span className="row-icon" style={{ background: iconBg || '#007AFF' }}>
          {icon}
        </span>
      )}
      <span className="row-label">
        <span style={labelStyle}>{label}</span>
        {sub && <span className="row-sub block">{sub}</span>}
      </span>
      {active && <Check size={19} className="check" />}
    </button>
  )
}

// ── text style (iv_text2) ───────────────────────────────────────────────

interface TextTypeMenuProps {
  info: SelectionInfo
  run: (cmd: Command) => void
  close: () => void
}

export function TextTypeMenu({ info, run, close }: TextTypeMenuProps) {
  const pick = (cmd: Command) => {
    run(cmd)
    close()
  }
  const headingSizes = [22, 20, 18.5, 17.5, 16.5, 15.5]
  return (
    <Sheet onClose={close} title="Text style">
      <div className="sheet-card">
        <Row
          icon={<Iv name="text" size={17} />}
          iconBg="#8E8E93"
          label="Paragraph"
          active={info.block.type === 'paragraph' && !info.block.inQuote}
          keep
          onClick={() => pick(setTextType('paragraph'))}
        />
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <Row
            key={l}
            icon={<Iv name={`h${l}`} size={17} />}
            iconBg="#007AFF"
            label={`Heading ${l}`}
            labelStyle={{ fontSize: headingSizes[l - 1], fontFamily: "heading", letterSpacing: '-0.4px' }}
            active={info.block.type === 'heading' && info.block.level === l}
            keep
            onClick={() => pick(setTextType('heading', l))}
          />
        ))}
      </div>
      <div className="sheet-card">
        <Row
          icon={<Iv name="quote" size={16} />}
          iconBg="#007AFF"
          label="Quote"
          active={info.block.inQuote}
          keep
          onClick={() => pick(setTextType(info.block.inQuote ? 'unquote' : 'quote'))}
        />
        <Row
          icon={<Iv name="pullquote" size={16} />}
          iconBg="#5856D6"
          label="Pull quote"
          active={info.block.type === 'pullquote'}
          keep
          onClick={() => pick(setTextType('pullquote'))}
        />
        <Row
          icon={<Iv name="code" size={16} />}
          iconBg="#8E8E93"
          label="Code block"
          active={info.block.type === 'code'}
          keep
          onClick={() => pick(setTextType('code'))}
        />
        <Row
          icon={<Iv name="footer" size={16} />}
          iconBg="#FF9500"
          label="Footer"
          active={info.block.type === 'footer'}
          keep
          onClick={() => pick(setTextType('footer'))}
        />
      </div>
    </Sheet>
  )
}

// ── lists (iv_lists) ────────────────────────────────────────────────────

interface ListMenuProps {
  info: SelectionInfo
  run: (cmd: Command) => void
  close: () => void
}

export function ListMenu({ info, run, close }: ListMenuProps) {
  const pick = (cmd: Command) => {
    run(cmd)
    close()
  }
  const inList = info.block.inList !== 'none'
  return (
    <Sheet onClose={close} title="Lists">
      <div className="sheet-card">
        <Row label="None" disabled={!inList} active={!inList} keep onClick={() => pick(unwrapList)} />
        <Row
          icon={<Iv name="list" size={17} />}
          iconBg="#007AFF"
          label="Bulleted"
          active={info.block.inList === 'bullet'}
          keep
          onClick={() => pick(wrapBullet)}
        />
        <Row
          icon={<Iv name="ordered_list" size={17} />}
          iconBg="#34C759"
          label="Numbered"
          active={info.block.inList === 'ordered'}
          keep
          onClick={() => pick(wrapOrdered)}
        />
        <Row
          icon={<Iv name="todo" size={17} />}
          iconBg="#5AC8FA"
          label="Checklist"
          active={info.block.inList === 'task'}
          keep
          onClick={() => pick(wrapTask)}
        />
        <Row
          icon={<Iv name="details" size={17} />}
          iconBg="#AF52DE"
          label="Toggle"
          keep
          onClick={() => pick(insertDetails)}
        />
      </div>
      <div className="sheet-card flex">
        <button
          type="button"
          className="sheet-row flex-1 justify-center gap-2"
          disabled={!inList}
          onMouseDown={keepSelection}
          onClick={() => run(outdentList)}
        >
          <Iv name="list_untab" size={18} className="text-ios-blue" />
          <span className="text-[15px] font-semibold text-ios-blue">Outdent</span>
        </button>
        <button
          type="button"
          className="sheet-row flex-1 justify-center gap-2"
          disabled={!inList}
          onMouseDown={keepSelection}
          onClick={() => run(indentList)}
        >
          <Iv name="list_tab" size={18} className="text-ios-blue" />
          <span className="text-[15px] font-semibold text-ios-blue">Indent</span>
        </button>
      </div>
    </Sheet>
  )
}

// ── table ops (iv_table_*) ──────────────────────────────────────────────
// Table-level settings. Cell operations (merge/split, insert, delete,
// highlight, alignment) live in the cell-selection context menu —
// TableCellMenu.tsx — exactly like the Android editor.

interface TableMenuProps {
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  close: () => void
  onOpenCaption: () => void
  notify: (text: string) => void
}

export function TableMenu({ viewRef, run, close, onOpenCaption }: TableMenuProps) {
  const view = viewRef.current
  const ctx = view ? findTableContext(view.state) : null

  const act = (cmd: Command, thenClose = true) => {
    run(cmd)
    if (thenClose) close()
  }

  const deleteCurrentRow = () => {
    if (!ctx?.cell) return
    const k = ctx.grid.anchors[ctx.cell.r][ctx.cell.c]
    const rec = k ? ctx.grid.cells.get(k) : undefined
    if (!rec) return
    act(deleteRows(rec.r, rec.r + rec.rowspan - 1))
  }
  const deleteCurrentColumn = () => {
    if (!ctx?.cell) return
    const k = ctx.grid.anchors[ctx.cell.r][ctx.cell.c]
    const rec = k ? ctx.grid.cells.get(k) : undefined
    if (!rec) return
    act(deleteColumns(rec.c, rec.c + rec.colspan - 1))
  }

  if (!ctx) {
    return (
      <Sheet onClose={close} title="Table">
        <div className="sheet-card">
          <div className="px-4 py-3.5 text-[14.5px] text-ios-secondary">
            Put the cursor inside a table to edit it.
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={close} title="Table">
      <div className="sheet-card">
        <Row icon={<Iv name="table_insert_bottom" size={16} />} iconBg="#34C759" label="Add row" keep onClick={() => act(addRow, false)} />
        <Row icon={<Iv name="table_insert_right" size={16} />} iconBg="#34C759" label="Add column" keep onClick={() => act(addColumn, false)} />
        <Row icon={<Iv name="table_remove" size={16} />} iconBg="#FF3B30" label="Delete row" keep onClick={deleteCurrentRow} />
        <Row icon={<Iv name="table_remove" size={16} />} iconBg="#FF3B30" label="Delete column" keep onClick={deleteCurrentColumn} />
      </div>
      <div className="sheet-card">
        <Row icon={<Iv name="table" size={16} />} iconBg="#8E8E93" label="Bordered" active={ctx.attrs.bordered} keep onClick={() => act(toggleBordered, false)} />
        <Row icon={<Iv name="table_highlight" size={16} />} iconBg="#5AC8FA" label="Striped" active={ctx.attrs.striped} keep onClick={() => act(toggleStriped, false)} />
        <Row icon={<Iv name="text" size={16} />} iconBg="#FF9500" label="Caption…" keep onClick={() => { onOpenCaption(); close() }} />
      </div>
      <div className="sheet-card">
        <div className="px-4 py-3.5 text-[13.5px] leading-snug text-ios-secondary">
          Select cells (long-press, Ctrl+click, or the row/column dots) to
          merge, split, highlight, insert or delete — the cell menu opens automatically.
        </div>
      </div>
    </Sheet>
  )
}

// ── math (iv_math / iv_formula) ─────────────────────────────────────────

interface MathMenuProps {
  run: (cmd: Command) => void
  close: () => void
  onOpenInlineMath: () => void
  notify: (text: string) => void
}

export function MathMenu({ run, close, onOpenInlineMath, notify }: MathMenuProps) {
  return (
    <Sheet onClose={close} title="Math">
      <div className="sheet-card">
        <Row
          icon={<Iv name="formula" size={16} />}
          iconBg="#5856D6"
          label="Inline math"
          sub="Inside the current paragraph"
          onClick={() => {
            onOpenInlineMath()
            close()
          }}
        />
        <Row
          icon={<Iv name="math" size={16} />}
          iconBg="#FF2D55"
          label="Math block"
          sub="Standalone centered formula"
          onClick={() => {
            run(insertMathBlock)
            notify('Tap the block to edit the formula')
            close()
          }}
        />
      </div>
    </Sheet>
  )
}

// ── attach grid (Telegram-style colored circles) ────────────────────────
// Photo/Video inserts the SAME media cell Telegram uses: empty at first,
// + button top-right adds items, and from 2 items the collage/slideshow
// switch appears. There are no separate collage/slideshow entries.

interface AttachSheetProps {
  run: (cmd: Command) => void
  close: () => void
  onOpenTableSize: () => void
}

export function AttachSheet({ run, close, onOpenTableSize }: AttachSheetProps) {
  const items: { icon: string; bg: string; label: string; onClick: () => void }[] = [
    { icon: 'media', bg: '#007AFF', label: 'Photo or Video', onClick: () => run(insertGallery('collage')) },
    { icon: 'audio', bg: '#FF2D55', label: 'Audio', onClick: () => run(insertMedia('audio')) },
    { icon: 'location', bg: '#34C759', label: 'Map', onClick: () => run(insertMap) },
    { icon: 'table', bg: '#FF9500', label: 'Table', onClick: onOpenTableSize },
    { icon: 'details', bg: '#AF52DE', label: 'Toggle', onClick: () => run(insertDetails) },
    { icon: 'divider', bg: '#8E8E93', label: 'Divider', onClick: () => run(insertDivider) },
    { icon: 'math', bg: '#FF3B30', label: 'Math Block', onClick: () => run(insertMathBlock) },
  ]
  return (
    <Sheet onClose={close} title="Insert">
      <div className="sheet-card grid grid-cols-3 py-2">
        {items.map((it, i) => (
          <button
            key={it.label}
            type="button"
            onClick={() => {
              // the sheet must close even if an insert command misbehaves,
              // otherwise the modal traps the user
              try {
                it.onClick()
              } finally {
                close()
              }
            }}
            className="press flex flex-col items-center gap-1.5 rounded-[10px] px-1 py-2.5"
            style={{
              animation: `pop-in 260ms var(--spring) ${i * 30}ms backwards`,
            }}
          >
            <span
              className="grid h-[52px] w-[52px] place-items-center rounded-full text-white shadow-sm"
              style={{ background: it.bg }}
            >
              <Iv name={it.icon} size={22} />
            </span>
            <span className="text-center text-[12px] font-medium leading-tight tracking-[-0.1px] text-ios-label">
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

// ── emoji (custom emoji: emoji-id + fallback glyph) ─────────────────────

export function EmojiPanel({
  viewRef,
  close,
}: {
  viewRef: React.MutableRefObject<EditorView | null>
  close: () => void
}) {
  const [emojiId, setEmojiId] = useState('')
  const [emoji, setEmoji] = useState('')

  const apply = () => {
    const id = emojiId.trim()
    const em = emoji.trim()
    if (!id || !em) return
    const view = viewRef.current
    if (!view) return
    view.dispatch(
      view.state.tr
        .replaceSelectionWith(view.state.schema.nodes.custom_emoji.create({ emojiId: id, emoji: em }))
        .scrollIntoView(),
    )
    view.focus()
    close()
  }

  return (
    <Sheet onClose={close} title="Custom Emoji">
      <div className="sheet-card px-3 py-2">
        <div className="form-row">
          <input
            className="form-input left"
            placeholder="Emoji ID"
            value={emojiId}
            autoFocus
            onChange={(e) => setEmojiId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="form-row">
          <input
            className="form-input left"
            placeholder="Emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </div>
      </div>
      <div className="sheet-card">
        <button
          type="button"
          className="sheet-row justify-center"
          disabled={!emojiId.trim() || !emoji.trim()}
          onClick={apply}
        >
          <span className="text-[16px] font-medium text-ios-blue">Insert</span>
        </button>
      </div>
    </Sheet>
  )
}

// ── slash command popup (iv_* icons, 5 rows like Android) ───────────────

interface SlashMenuProps {
  slash: SlashState
  viewRef: React.MutableRefObject<EditorView | null>
  onPick: (def: SlashDef) => void
  onDismiss: () => void
}

export function SlashMenu({ slash, viewRef, onPick, onDismiss }: SlashMenuProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const matches = matchSlash(slash.query).slice(0, 5)

  useEffect(() => {
    if (!slash.active) {
      setPos(null)
      return
    }
    const view = viewRef.current
    if (!view) return
    const coords = view.coordsAtPos(slash.to)
    const host = view.dom.closest('.main-scroll')
    const rect = host?.getBoundingClientRect()
    if (!rect) return
    setPos({
      top: coords.bottom - rect.top + (host as HTMLElement).scrollTop + 8,
      left: Math.max(10, Math.min(coords.left - rect.left, rect.width - 260)),
    })
  }, [slash, viewRef])

  useEffect(() => {
    if (!slash.active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (matches.length) {
          e.preventDefault()
          e.stopPropagation()
          onPick(matches[0])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [slash.active, matches, onPick, onDismiss])

  if (!slash.active || !pos || matches.length === 0) return null

  return (
    <div
      className="popover animate-pop-in absolute z-30 w-[248px]"
      style={{ top: pos.top, left: pos.left }}
    >
      {matches.map((m, i) => (
        <button
          key={m.id + m.label}
          type="button"
          onClick={() => onPick(m)}
          className="popover-row"
        >
          <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-ios-blue/10 text-ios-blue">
            <Iv name={SLASH_ICON[m.id] || 'text'} size={16} />
          </span>
          <span className="truncate">{m.label}</span>
          {i === 0 && <span className="popover-hint">↵</span>}
        </button>
      ))}
    </div>
  )
}

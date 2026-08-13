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
  unmergeCell,
  toggleBordered,
  toggleStriped,
  toggleHeaderRow,
  setCellAlign,
  setCellValign,
  findTableContext,
} from '../editor/tableCommands'
import { EMOJI_SET, SlashDef, matchSlash } from '../lib/util'
import { Iv } from './ivIcons'
import { Check } from './icons'

const keepSelection = (e: React.MouseEvent) => e.preventDefault()

/** slash command id → Telegram drawable key */
const SLASH_ICON: Record<string, string> = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  quote: 'quote', pullquote: 'pullquote', code: 'code', footer: 'footer',
  list: 'list', ordered: 'ordered_list', todo: 'todo', toggle: 'details',
  table: 'table', math: 'math', divider: 'divider',
  image: 'media', video: 'media', audio: 'audio', map: 'location',
}

// ── sheet primitives ────────────────────────────────────────────────────

function Sheet({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div className="ios-sheet" role="dialog" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-scroll">{children}</div>
      </div>
    </>
  )
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
          active={info.block.type === 'paragraph' && !info.block.inQuote && info.block.type !== 'pullquote'}
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

interface TableMenuProps {
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  close: () => void
  onOpenMerge: () => void
  onOpenCaption: () => void
  notify: (text: string) => void
}

export function TableMenu({ viewRef, run, close, onOpenMerge, onOpenCaption }: TableMenuProps) {
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

  const alignBtn = (icon: string, title: string, onClick: () => void) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={keepSelection}
      onClick={onClick}
      className="grid flex-1 place-items-center rounded-[8px] border border-ios-sep bg-white py-2 text-ios-label transition active:scale-95 active:bg-ios-fill"
    >
      <Iv name={icon} size={17} />
    </button>
  )

  return (
    <Sheet onClose={close} title="Table">
      <div className="sheet-card">
        <Row icon={<Iv name="table_insert_bottom" size={16} />} iconBg="#34C759" label="Add row" keep onClick={() => act(addRow)} />
        <Row icon={<Iv name="table_insert_right" size={16} />} iconBg="#34C759" label="Add column" keep onClick={() => act(addColumn)} />
        <Row icon={<Iv name="table_remove" size={16} />} iconBg="#FF3B30" label="Delete row" keep onClick={deleteCurrentRow} />
        <Row icon={<Iv name="table_remove" size={16} />} iconBg="#FF3B30" label="Delete column" keep onClick={deleteCurrentColumn} />
      </div>
      <div className="sheet-card">
        <Row icon={<Iv name="table_merge" size={16} />} iconBg="#5856D6" label="Merge cells…" keep onClick={() => { onOpenMerge(); close() }} />
        <Row icon={<Iv name="table_unmerge" size={16} />} iconBg="#FF9500" label="Unmerge cell" keep onClick={() => act(unmergeCell)} />
      </div>
      <div className="sheet-card">
        <Row icon={<Iv name="h" size={16} />} iconBg="#007AFF" label="Header row" keep onClick={() => act(toggleHeaderRow, false)} />
        <Row icon={<Iv name="table" size={16} />} iconBg="#8E8E93" label="Bordered" active={ctx.attrs.bordered} keep onClick={() => act(toggleBordered, false)} />
        <Row icon={<Iv name="table_highlight" size={16} />} iconBg="#5AC8FA" label="Striped" active={ctx.attrs.striped} keep onClick={() => act(toggleStriped, false)} />
        <Row icon={<Iv name="text" size={16} />} iconBg="#FF9500" label="Caption…" keep onClick={() => { onOpenCaption(); close() }} />
      </div>
      <div className="sheet-card px-3 py-2">
        <div className="flex items-center gap-1.5 py-1">
          <span className="w-14 text-[12px] font-semibold uppercase tracking-wide text-ios-secondary">Align</span>
          {alignBtn('align_horiz_left', 'Align left', () => run(setCellAlign('left')))}
          {alignBtn('align_horiz_middle', 'Align center', () => run(setCellAlign('center')))}
          {alignBtn('align_horiz_right', 'Align right', () => run(setCellAlign('right')))}
        </div>
        <div className="flex items-center gap-1.5 py-1">
          <span className="w-14 text-[12px] font-semibold uppercase tracking-wide text-ios-secondary">Vertical</span>
          {alignBtn('align_vert_top', 'Top', () => run(setCellValign('top')))}
          {alignBtn('align_vert_middle', 'Middle', () => run(setCellValign('middle')))}
          {alignBtn('align_vert_bottom', 'Bottom', () => run(setCellValign('bottom')))}
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

interface AttachSheetProps {
  run: (cmd: Command) => void
  close: () => void
  onOpenTableSize: () => void
  onImportHtml: () => void
}

export function AttachSheet({ run, close, onOpenTableSize }: AttachSheetProps) {
  const items: { icon: string; bg: string; label: string; onClick: () => void }[] = [
    { icon: 'media', bg: '#007AFF', label: 'Photo or Video', onClick: () => run(insertMedia('image')) },
    { icon: 'audio', bg: '#FF2D55', label: 'Audio', onClick: () => run(insertMedia('audio')) },
    { icon: 'media_collage', bg: '#5856D6', label: 'Collage', onClick: () => run(insertGallery('collage')) },
    { icon: 'media_slideshow', bg: '#5AC8FA', label: 'Slideshow', onClick: () => run(insertGallery('slideshow')) },
    { icon: 'location', bg: '#34C759', label: 'Map', onClick: () => run(insertMap) },
    { icon: 'table', bg: '#FF9500', label: 'Table', onClick: onOpenTableSize },
    { icon: 'details', bg: '#AF52DE', label: 'Toggle', onClick: () => run(insertDetails) },
    { icon: 'divider', bg: '#8E8E93', label: 'Divider', onClick: () => run(insertDivider) },
    { icon: 'math', bg: '#FF3B30', label: 'Math Block', onClick: () => run(insertMathBlock) },
    {
      icon: 'code',
      bg: '#007AFF',
      label: 'Import HTML',
      onClick: onImportHtml,
    },
  ]
  return (
    <Sheet onClose={close} title="Insert">
      <div className="sheet-card grid grid-cols-3 py-2">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={() => {
              it.onClick()
              close()
            }}
            className="press flex flex-col items-center gap-1.5 rounded-[10px] px-1 py-2.5"
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

// ── emoji grid ──────────────────────────────────────────────────────────

export function EmojiPanel({
  viewRef,
  close,
}: {
  viewRef: React.MutableRefObject<EditorView | null>
  close: () => void
}) {
  const insert = (emoji: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.text(emoji)))
    view.focus()
  }
  return (
    <Sheet onClose={close} title="Emoji">
      <div className="sheet-card grid grid-cols-8 gap-0.5 p-2">
        {EMOJI_SET.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => insert(e)}
            className="grid h-10 w-10 place-items-center rounded-[9px] text-[23px] transition active:scale-90 active:bg-ios-fill"
          >
            {e}
          </button>
        ))}
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
      left: Math.max(10, Math.min(coords.left - rect.left, rect.width - 236)),
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
      className="absolute z-30 w-[224px] rounded-[10px] border border-black/5 bg-white/95 p-1 shadow-ios-pop backdrop-blur-xl animate-pop-in"
      style={{ top: pos.top, left: pos.left }}
    >
      {matches.map((m) => (
        <button
          key={m.id + m.label}
          type="button"
          onClick={() => onPick(m)}
          className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition active:bg-ios-fill"
        >
          <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[7px] bg-ios-blue/10 text-ios-blue">
            <Iv name={SLASH_ICON[m.id] || 'text'} size={16} />
          </span>
          <span className="text-[15px] font-medium tracking-[-0.2px] text-ios-label">{m.label}</span>
        </button>
      ))}
    </div>
  )
}

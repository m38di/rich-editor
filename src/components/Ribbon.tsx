// src/components/Ribbon.tsx — the desktop toolbar row. Formatting acts on
// the live selection; the grouped pickers reuse the same sheets the mobile
// dock opens, so behaviour stays identical across breakpoints.

import { Command } from 'prosemirror-state'
import { SelectionInfo } from '../editor/plugins'
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleMono,
  toggleSpoiler,
  toggleHighlight,
  clearFormatting,
  setTextType,
  wrapBullet,
  wrapOrdered,
  wrapTask,
} from '../editor/commands'
import { Iv } from './ivIcons'
import { Smiley, ClearFormat } from './icons'
import { MenuId } from './BottomPanel'

interface RibbonProps {
  info: SelectionInfo
  run: (cmd: Command) => void
  openMenu: MenuId | null
  onToggleMenu: (id: MenuId) => void
  onOpenLink: () => void
  onInsertTable: () => void
  blockLabel: string
}

const keepSelection = (e: React.MouseEvent) => e.preventDefault()

interface BtnProps {
  title: string
  glyph: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function Btn({ title, glyph, active, disabled, onClick }: BtnProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onClick}
      className={`tool-btn ${active ? 'on' : ''}`}
    >
      {glyph}
    </button>
  )
}

export function Ribbon({
  info,
  run,
  openMenu,
  onToggleMenu,
  onOpenLink,
  onInsertTable,
  blockLabel,
}: RibbonProps) {
  const inHeading = info.block.type === 'heading'
  const noSelection = info.empty

  return (
    <div className="ribbon">
      <div className="ribbon-inner no-scrollbar">
        <div className="ribbon-group">
          <Btn
            title="Text style"
            glyph={<Iv name="text2" size={20} />}
            active={openMenu === 'text'}
            onClick={() => onToggleMenu('text')}
          />
          {[1, 2, 3].map((l) => (
            <Btn
              key={l}
              title={`Heading ${l}`}
              glyph={<Iv name={`h${l}`} size={19} />}
              active={inHeading && info.block.level === l}
              onClick={() => run(setTextType('heading', l))}
            />
          ))}
        </div>

        <span className="ribbon-sep" aria-hidden />

        <div className="ribbon-group">
          <Btn
            title="Bold (Ctrl+B)"
            glyph={<Iv name="formatting_bold" size={20} />}
            active={info.marks.bold}
            disabled={inHeading}
            onClick={() => run(toggleBold)}
          />
          <Btn
            title="Italic (Ctrl+I)"
            glyph={<Iv name="formatting_italic" size={20} />}
            active={info.marks.italic}
            disabled={inHeading}
            onClick={() => run(toggleItalic)}
          />
          <Btn
            title="Underline (Ctrl+U)"
            glyph={<Iv name="formatting_underline" size={20} />}
            active={info.marks.underline}
            onClick={() => run(toggleUnderline)}
          />
          <Btn
            title="Strikethrough"
            glyph={<Iv name="formatting_strikethrough" size={20} />}
            active={info.marks.strike}
            onClick={() => run(toggleStrike)}
          />
          <Btn
            title="Monospace (Ctrl+E)"
            glyph={<Iv name="formatting_code" size={20} />}
            active={info.marks.code}
            onClick={() => run(toggleMono)}
          />
          <Btn
            title="Highlight"
            glyph={<Iv name="formatting_marked" size={20} />}
            active={info.marks.mark}
            onClick={() => run(toggleHighlight)}
          />
          <Btn
            title="Spoiler"
            glyph={<Iv name="formatting_spoiler" size={20} />}
            active={info.marks.spoiler}
            onClick={() => run(toggleSpoiler)}
          />
          <Btn
            title="Clear formatting"
            glyph={<ClearFormat size={18} />}
            disabled={noSelection}
            onClick={() => run(clearFormatting)}
          />
        </div>

        <span className="ribbon-sep" aria-hidden />

        <div className="ribbon-group">
          <Btn
            title="Link (Ctrl+K)"
            glyph={<Iv name="media_link_24" size={20} />}
            active={!!info.marks.link}
            disabled={noSelection}
            onClick={onOpenLink}
          />
          <Btn
            title={info.block.inQuote ? 'Remove quote' : 'Quote'}
            glyph={<Iv name="quote" size={19} />}
            active={info.block.inQuote}
            onClick={() => run(setTextType(info.block.inQuote ? 'unquote' : 'quote'))}
          />
        </div>

        <span className="ribbon-sep" aria-hidden />

        <div className="ribbon-group">
          <Btn
            title="Bulleted list"
            glyph={<Iv name="list" size={19} />}
            active={info.block.inList === 'bullet'}
            onClick={() => run(wrapBullet)}
          />
          <Btn
            title="Numbered list"
            glyph={<Iv name="ordered_list" size={19} />}
            active={info.block.inList === 'ordered'}
            onClick={() => run(wrapOrdered)}
          />
          <Btn
            title="Checklist"
            glyph={<Iv name="todo" size={19} />}
            active={info.block.inList === 'task'}
            onClick={() => run(wrapTask)}
          />
          <Btn
            title="More list options"
            glyph={<Iv name="lists" size={19} />}
            active={openMenu === 'list'}
            onClick={() => onToggleMenu('list')}
          />
        </div>

        <span className="ribbon-sep" aria-hidden />

        <div className="ribbon-group">
          <Btn
            title="Insert block"
            glyph={<Iv name="outline_poll_attach_24" size={19} />}
            active={openMenu === 'attach'}
            onClick={() => onToggleMenu('attach')}
          />
          <Btn
            title={info.inTable ? 'Table options' : 'Insert 2×2 table'}
            glyph={<Iv name="table" size={19} />}
            active={info.inTable}
            onClick={() => (info.inTable ? onToggleMenu('table') : onInsertTable())}
          />
          <Btn
            title="Math"
            glyph={<Iv name="math" size={19} />}
            active={openMenu === 'math'}
            onClick={() => onToggleMenu('math')}
          />
          <Btn
            title="Custom emoji"
            glyph={<Smiley size={21} />}
            active={openMenu === 'emoji'}
            onClick={() => onToggleMenu('emoji')}
          />
        </div>

        <div className="flex-1" />

        <span className="stat-chip ml-2">{blockLabel}</span>
      </div>
    </div>
  )
}

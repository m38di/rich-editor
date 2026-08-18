// src/components/BottomPanel.tsx — Telegram iOS compose bar with the
// widget's own drawables: outline_poll_attach_24 (+), iv_text2 (Aa),
// iv_lists, iv_table, iv_math — and the classic send_plane_24 as the
// blue Generate button.

import { SelectionInfo } from '../editor/plugins'
import { Iv } from './ivIcons'
import { Smiley } from './icons'

export type MenuId = 'text' | 'list' | 'table' | 'math' | 'attach' | 'emoji'

interface BottomPanelProps {
  info: SelectionInfo
  openMenu: MenuId | null
  onToggleMenu: (id: MenuId) => void
  onGenerate: () => void
  keyboardHeight: number
  /** menus + formatting strip render here, floating above the bar */
  children?: React.ReactNode
}

export function BottomPanel({ info, openMenu, onToggleMenu, onGenerate, keyboardHeight, children }: BottomPanelProps) {
  const item = (id: MenuId, label: string, glyph: React.ReactNode) => (
    <button
      key={id}
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={openMenu === id}
      onClick={() => onToggleMenu(id)}
      className={`tool-btn ${openMenu === id ? 'on' : ''}`}
    >
      {glyph}
    </button>
  )

  return (
    <div className="ios-toolbar ios-vibrancy" style={{ bottom: keyboardHeight }}>
      {/* floating slot above the bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex flex-col items-center gap-2 px-3 pb-2">
        {children}
      </div>

      <div className="mx-auto flex max-w-[720px] items-center gap-0.5">
        <button
          type="button"
          title="Insert block"
          aria-label="Insert block"
          aria-expanded={openMenu === 'attach'}
          onClick={() => onToggleMenu('attach')}
          className="attach-btn mr-1"
        >
          <Iv name="outline_poll_attach_24" size={20} />
        </button>

        {item('emoji', 'Emoji', <Smiley size={23} />)}
        {item('text', 'Text style', <Iv name="text2" size={21} />)}
        {item('list', 'Lists', <Iv name="lists" size={21} />)}
        {item('table', 'Table', <Iv name="table" size={20} />)}
        {item('math', 'Math', <Iv name="math" size={21} />)}

        <div className="flex-1" />

        <span className="mr-2 hidden text-[12px] font-medium text-ios-secondary sm:block">
          {labelFor(info)}
        </span>

        <button
          type="button"
          onClick={onGenerate}
          title="Generate HTML → Preview → Download"
          aria-label="Generate HTML"
          className="send-btn"
        >
          <Iv name="send_plane_24" size={19} />
        </button>
      </div>
    </div>
  )
}

function labelFor(info: SelectionInfo): string {
  if (info.block.inList === 'bullet') return 'List'
  if (info.block.inList === 'ordered') return 'Numbered'
  if (info.block.inList === 'task') return 'Checklist'
  if (info.block.inQuote) return 'Quote'
  if (info.block.inDetails) return 'Toggle'
  switch (info.block.type) {
    case 'heading':
      return `Heading ${info.block.level}`
    case 'code':
      return 'Code'
    case 'footer':
      return 'Footer'
    case 'pullquote':
      return 'Pull quote'
    case 'table':
      return 'Table'
    default:
      return 'Text'
  }
}

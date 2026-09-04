// src/components/BottomPanel.tsx — the compact dock shown on small screens:
// insert, pickers, live block label and the blue Generate button. On desktop
// the Ribbon takes over and this component is hidden.

import { SelectionInfo } from '../editor/plugins'
import { Iv } from './ivIcons'
import { Smiley } from './icons'

export type MenuId = 'text' | 'list' | 'table' | 'math' | 'attach' | 'emoji'

interface BottomPanelProps {
  info: SelectionInfo
  openMenu: MenuId | null
  onToggleMenu: (id: MenuId) => void
  onGenerate: () => void
  onInsertTable: () => void
  keyboardHeight: number
  className?: string
}

export function BottomPanel({
  info,
  openMenu,
  onToggleMenu,
  onGenerate,
  onInsertTable,
  keyboardHeight,
  className = '',
}: BottomPanelProps) {
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
    <div className={`dock ${className}`} style={{ bottom: keyboardHeight }}>
      <div className="dock-row">
        <button
          type="button"
          title="Insert block"
          aria-label="Insert block"
          aria-expanded={openMenu === 'attach'}
          onClick={() => onToggleMenu('attach')}
          className={`attach-btn${openMenu === 'attach' ? ' on' : ''}`}
        >
          <Iv name="outline_poll_attach_24" size={20} />
        </button>

        <div className="dock-pill">
          {item('text', 'Text style', <Iv name="text2" size={20} />)}
          {item('list', 'Lists', <Iv name="lists" size={20} />)}
          <button
            type="button"
            title={info.inTable ? 'Table options' : 'Insert 2×2 table'}
            aria-label="Table"
            onClick={() => (info.inTable ? onToggleMenu('table') : onInsertTable())}
            className={`tool-btn ${info.inTable || openMenu === 'table' ? 'on' : ''}`}
          >
            <Iv name="table" size={19} />
          </button>
          {item('math', 'Math', <Iv name="math" size={20} />)}
          {item('emoji', 'Custom emoji', <Smiley size={21} />)}
        </div>

        <span className="stat-chip">{labelFor(info)}</span>

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

export function labelFor(info: SelectionInfo): string {
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
      return 'Paragraph'
  }
}

// src/lib/util.ts — emoji set, slash-command table (RichCommand.java parity),
// and Telegram-style time formatting for the Date dialog.

export interface SlashDef {
  id: string
  label: string
  icon: string
  /** slash aliases without the leading '/' — mirrors RichCommand triggers */
  aliases: string[]
  group: 'text' | 'list' | 'media' | 'other'
}

/** The 21 commands from RichCommand.java, in the original order. */
export const SLASH_COMMANDS: SlashDef[] = [
  { id: 'h1', label: 'Heading 1', icon: 'H1', aliases: ['h1', 'header', 'title', 'heading'], group: 'text' },
  { id: 'h2', label: 'Heading 2', icon: 'H2', aliases: ['h2'], group: 'text' },
  { id: 'h3', label: 'Heading 3', icon: 'H3', aliases: ['h3'], group: 'text' },
  { id: 'h4', label: 'Heading 4', icon: 'H4', aliases: ['h4'], group: 'text' },
  { id: 'h5', label: 'Heading 5', icon: 'H5', aliases: ['h5'], group: 'text' },
  { id: 'h6', label: 'Heading 6', icon: 'H6', aliases: ['h6'], group: 'text' },
  { id: 'quote', label: 'Quote', icon: '❝', aliases: ['quote', 'blockquote'], group: 'text' },
  { id: 'pullquote', label: 'Pull quote', icon: '❞', aliases: ['pullquote'], group: 'text' },
  { id: 'code', label: 'Code block', icon: '</>', aliases: ['code', 'pre', 'preformatted'], group: 'text' },
  { id: 'footer', label: 'Footer', icon: 'F', aliases: ['footer'], group: 'text' },
  { id: 'list', label: 'List', icon: '•≡', aliases: ['list', 'ul'], group: 'list' },
  { id: 'ordered', label: 'Numbered list', icon: '1.', aliases: ['ordered', 'ol'], group: 'list' },
  { id: 'todo', label: 'Checklist', icon: '☑', aliases: ['todo', 'checklist'], group: 'list' },
  { id: 'toggle', label: 'Toggle', icon: '▸', aliases: ['toggle', 'details'], group: 'list' },
  { id: 'table', label: 'Table', icon: '▦', aliases: ['table'], group: 'other' },
  { id: 'math', label: 'Math', icon: 'ƒx', aliases: ['math', 'latex', 'expression'], group: 'other' },
  { id: 'divider', label: 'Divider', icon: '—', aliases: ['divider', 'hr', 'line'], group: 'other' },
  { id: 'image', label: 'Image', icon: '🖼', aliases: ['image', 'pic', 'picture', 'photo', 'img', 'media'], group: 'media' },
  { id: 'video', label: 'Video', icon: '🎬', aliases: ['video', 'vid', 'media'], group: 'media' },
  { id: 'audio', label: 'Audio', icon: '🎵', aliases: ['audio', 'music', 'media'], group: 'media' },
  { id: 'map', label: 'Map', icon: '📍', aliases: ['map', 'location', 'venue'], group: 'media' },
]

export function matchSlash(query: string): SlashDef[] {
  const q = query.toLowerCase()
  if (!q) return SLASH_COMMANDS.slice(0, 8)
  return SLASH_COMMANDS.filter((c) => c.aliases.some((a) => a.startsWith(q)))
}

// ── emoji panel (curated set, Telegram-style recent-first ordering) ─────

export const EMOJI_SET: string[] = [
  '😀', '😂', '🥲', '😊', '😍', '🤔', '😎', '🙃', '😅', '🥳', '😭', '😡',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '🫡', '❤️', '🔥', '⭐', '💯',
  '🎉', '🎁', '🏆', '⚡', '💡', '📌', '✅', '❌', '⚠️', '❓', '❗', '💬',
  '📢', '🔔', '⏰', '📅', '🌍', '🌙', '☀️', '🌈', '🍕', '☕', '🚀', '✈️',
  '🏠', '💼', '📱', '💻', '📷', '🎵', '🎬', '📚', '✏️', '🧠', '👀', '🤖',
]

// ── time formats (FormattedDate entity: unix + format code + display) ───

export interface TimeFormat {
  code: string
  example: string
}

export const TIME_FORMATS: TimeFormat[] = [
  { code: 'wDT', example: '22:45 tomorrow' },
  { code: 'wD', example: 'tomorrow' },
  { code: 'wT', example: '22:45' },
  { code: 'fD', example: '17.03.2026' },
  { code: 'fDT', example: '17.03.2026 22:45' },
]

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatTime(unixSec: number, code: string): string {
  const d = new Date(unixSec * 1000)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000)
  const dayWord =
    dayDiff === 0 ? 'today' : dayDiff === 1 ? 'tomorrow' : dayDiff === -1 ? 'yesterday' : null
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  switch (code) {
    case 'wD':
      return dayWord ?? date
    case 'wT':
      return time
    case 'fD':
      return date
    case 'fDT':
      return `${date} ${time}`
    case 'wDT':
    default:
      return dayWord ? `${time} ${dayWord}` : `${date} ${time}`
  }
}

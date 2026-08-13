// src/editor/schema.ts
//
// The ProseMirror schema is the web counterpart of the Android PageBlock
// taxonomy: every node type maps 1:1 to a BlockRow kind handled by
// RichEditorListView, and every mark maps to a RichTextStyle flag or entity.
//
//   Android                          Web (this schema)          Export tag
//   ───────────────────────────────  ─────────────────────────  ─────────────────────
//   paragraph                        paragraph                  <p>
//   header (level 1..6)              heading{level}             <h1>…<h6>
//   footer                           footer_block               <footer>
//   blockquote (quoteIds + author)   blockquote{cite}           <blockquote>…<cite>
//   pullquote                        pullquote{cite}            <aside>…<cite>
//   preformatted (language)          code_block{language}       <pre><code class="language-x">
//   list rows (level/num/checkbox)   bullet/ordered/task lists  <ul> <ol start> <li><input …>
//   details + detailsEnd             details{open} + summary    <details open><summary>
//   divider                          horizontal_rule            <hr/>
//   media block (single)             media_figure               <figure><img|video|audio …>
//   media gallery (collage/slideshow) media_group{mode}         <tg-collage> / <tg-slideshow>
//   map                              map_block                  <tg-map lat long zoom/>
//   table (TableModel)               table{bordered,striped}    <table bordered striped>
//   math block / MathSpan            math_block / math_inline   <tg-math-block> / <tg-math>
//   TextStyleSpan flags              marks                      <b> <i> <u> <s> <code>
//   spoiler / marked / sub / sup     marks                      <tg-spoiler> <mark> <sub> <sup>
//   URL entity                       link{href}                 <a href>
//   FormattedDate entity             time_inline                <tg-time unix format>
//   (reference-only)                 anchor{name}               <a name>

import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model'

export type MediaKind = 'image' | 'video' | 'animation' | 'audio'
export type GalleryMode = 'collage' | 'slideshow'
export type Align = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'

export interface MediaItem {
  kind: MediaKind
  src: string
  spoiler: boolean
}

/** TableModel.pageTableCell flags → attrs (align 0/1/2, valign 0/1/2). */
const cellAttrs = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  align: { default: 'left' },
  valign: { default: 'top' },
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  text: { group: 'inline' },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level },
    })),
    toDOM: (node) => [`h${node.attrs.level}`, 0],
  },

  footer_block: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'footer' }],
    toDOM: () => ['footer', 0],
  },

  // A quote wraps whole blocks (Android: a run of rows sharing quoteIds)
  // and carries its author as `cite` (Android: quoteAuthors map).
  blockquote: {
    attrs: { cite: { default: null } },
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [
      {
        tag: 'blockquote',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          const cite = dom.querySelector('cite')
          return { cite: cite && cite.textContent ? cite.textContent : null }
        },
        contentElement: (el) => {
          const dom = el as HTMLElement
          const clone = dom.cloneNode(true) as HTMLElement
          clone.querySelectorAll('cite').forEach((c) => c.remove())
          return clone
        },
      },
    ],
    toDOM: () => ['blockquote', 0],
  },

  // Pull quote (Android: italic centered + mini quote icons + author).
  pullquote: {
    attrs: { cite: { default: null } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      {
        tag: 'aside',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          const cite = dom.querySelector('cite')
          return { cite: cite && cite.textContent ? cite.textContent : null }
        },
        contentElement: (el) => {
          const dom = el as HTMLElement
          const clone = dom.cloneNode(true) as HTMLElement
          clone.querySelectorAll('cite').forEach((c) => c.remove())
          return clone
        },
      },
    ],
    toDOM: () => ['aside', 0],
  },

  code_block: {
    attrs: { language: { default: '' } },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          const code = dom.querySelector('code')
          const match = code?.className.match(/language-([\w+-]+)/)
          return { language: match ? match[1] : '' }
        },
      },
    ],
    toDOM: (node) =>
      node.attrs.language
        ? ['pre', ['code', { class: `language-${node.attrs.language}` }, 0]]
        : ['pre', 0],
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [
      {
        tag: 'ul',
        getAttrs: (el) =>
          (el as HTMLElement).querySelector('li > input[type=checkbox]') ? false : null,
      },
    ],
    toDOM: () => ['ul', 0],
  },

  ordered_list: {
    attrs: {
      start: { default: 1 },
      type: { default: '1' },
    },
  
    content: 'list_item+',
    group: 'block',
  
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (el) => {
          const dom = el as HTMLElement
  
          const startAttr = dom.getAttribute('start')
          const typeAttr = dom.getAttribute('type')
  
          const type =
            typeAttr === 'A' ||
            typeAttr === 'a' ||
            typeAttr === 'I' ||
            typeAttr === 'i'
              ? typeAttr
              : '1'
  
          return {
            start: startAttr ? Number(startAttr) || 1 : 1,
            type,
          }
        },
      },
    ],
  
    toDOM: (node) => {
      const attrs: Record<string, string | number> = {}
    
      if (node.attrs.start !== 1) {
        attrs.start = node.attrs.start
      }
    
      if (node.attrs.type !== '1') {
        attrs.type = node.attrs.type
        attrs['data-list-type'] = node.attrs.type
      }
    
      return Object.keys(attrs).length
        ? ['ol', attrs, 0]
        : ['ol', 0]
    },
  },

  list_item: {
    content: 'paragraph block*',
    parseDOM: [{ tag: 'li' }],
    toDOM: () => ['li', 0],
  },
  
  task_list: {
    content: 'task_item+',
    group: 'block',
    parseDOM: [
      {
        tag: 'ul',
        getAttrs: (el) =>
          (el as HTMLElement).querySelector('li > input[type=checkbox]') ? null : false,
      },
    ],
    toDOM: () => ['ul', { class: 'task-list' }, 0],
  },
  
  task_item: {
    attrs: { checked: { default: false } },
    content: 'paragraph block*',
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (el) => ({
          checked: !!(el as HTMLElement).querySelector('input[type=checkbox]')?.getAttribute('checked'),
        }),
      },
    ],
    toDOM: () => ['li', 0],
  },

  details: {
    attrs: { open: { default: true } },
    content: 'details_summary block+',
    group: 'block',
    defining: true,
    isolating: true,
    parseDOM: [
      {
        tag: 'details',
        getAttrs: (el) => ({ open: (el as HTMLElement).hasAttribute('open') }),
      },
    ],
    toDOM: (node) => (node.attrs.open ? ['details', { open: '' }, 0] : ['details', 0]),
  },

  details_summary: {
    content: 'inline*',
    defining: true,
    parseDOM: [{ tag: 'summary' }],
    toDOM: () => ['summary', 0],
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },

  fig_caption: {
    content: 'inline*',
    defining: true,
    parseDOM: [{ tag: 'figcaption' }],
    toDOM: () => ['figcaption', 0],
  },

  // Single media block (Android: MediaBlock mode=single). `kind` audio uses
  // title/author for the player chrome ("author – title"), editor-only fields.
  media_figure: {
    attrs: {
      kind: { default: 'image' }, // MediaKind
      src: { default: '' },
      spoiler: { default: false },
      title: { default: '' },
      author: { default: '' },
    },
    content: 'fig_caption?',
    group: 'block',
    isolating: true,
    draggable: true,
    toDOM: () => ['figure', 0],
  },

  // Collage / slideshow (Android: mode=collage|slideshow, items with
  // per-item spoiler, single shared caption).
  media_group: {
    attrs: {
      mode: { default: 'collage' }, // GalleryMode
      items: { default: [] }, // MediaItem[]
    },
    content: 'fig_caption?',
    group: 'block',
    isolating: true,
    draggable: true,
    toDOM: () => ['div', { class: 'media-group' }, 0],
  },

  map_block: {
    attrs: {
      lat: { default: 41.9 },
      long: { default: 12.5 },
      zoom: { default: 15 },
    },
    content: 'fig_caption?',
    group: 'block',
    isolating: true,
    draggable: true,
    toDOM: () => ['div', { class: 'map-block' }, 0],
  },

  table: {
    attrs: {
      bordered: { default: true },
      striped: { default: false },
    },
    content: 'table_caption? table_row+',
    group: 'block',
    isolating: true,
    defining: true,
    parseDOM: [
      {
        tag: 'table',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          return {
            bordered:
              dom.hasAttribute('bordered') || dom.getAttribute('border') === '1',
            striped:
              dom.hasAttribute('striped') || /striped/.test(dom.className || ''),
          }
        },
      },
    ],
    toDOM: () => ['table', 0],
  },

  table_caption: {
    content: 'inline*',
    defining: true,
    parseDOM: [{ tag: 'caption' }],
    toDOM: () => ['caption', 0],
  },

  table_row: {
    content: '(table_cell | table_header)+',
    parseDOM: [{ tag: 'tr' }],
    toDOM: () => ['tr', 0],
  },

  table_cell: {
    attrs: cellAttrs,
    content: 'paragraph',
    isolating: true,
    parseDOM: [{ tag: 'td', getAttrs: parseCellAttrs }],
    toDOM: (node) => ['td', cellDomAttrs(node.attrs), 0],
  },

  table_header: {
    attrs: cellAttrs,
    content: 'paragraph',
    isolating: true,
    parseDOM: [{ tag: 'th', getAttrs: parseCellAttrs }],
    toDOM: (node) => ['th', cellDomAttrs(node.attrs), 0],
  },

  math_block: {
    attrs: { tex: { default: '' } },
    group: 'block',
    atom: true,
    draggable: true,
    parseDOM: [{ tag: 'tg-math-block', getAttrs: (el) => ({ tex: (el as HTMLElement).textContent || '' }) }],
    toDOM: (node) => ['tg-math-block', node.attrs.tex],
  },

  math_inline: {
    attrs: { tex: { default: '' } },
    inline: true,
    group: 'inline',
    atom: true,
    parseDOM: [{ tag: 'tg-math', getAttrs: (el) => ({ tex: (el as HTMLElement).textContent || '' }) }],
    toDOM: (node) => ['tg-math', node.attrs.tex],
  },
  // Android custom emoji entity (TLRPC.TL_messageEntityCustomEmoji):
  // document_id (emoji-id) + a fallback unicode emoji for text-only clients.
  custom_emoji: {
    attrs: {
      emojiId: { default: '' },
      emoji: { default: '' },
    },
    inline: true,
    group: 'inline',
    atom: true,
    parseDOM: [
      {
        tag: 'tg-emoji',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          return {
            emojiId: dom.getAttribute('emoji-id') || '',
            emoji: dom.textContent || '',
          }
        },
      },
    ],
    toDOM: (node) => ['tg-emoji', { 'emoji-id': node.attrs.emojiId }, node.attrs.emoji],
  },
  // Android FormattedDate entity: stored unix + format, rendered as text.
  time_inline: {
    attrs: {
      unix: { default: 0 },
      format: { default: 'wDT' },
      display: { default: '' },
    },
    inline: true,
    group: 'inline',
    atom: true,
    parseDOM: [
      {
        tag: 'tg-time',
        getAttrs: (el) => {
          const dom = el as HTMLElement
          return {
            unix: Number(dom.getAttribute('unix')) || 0,
            format: dom.getAttribute('format') || 'wDT',
            display: dom.textContent || '',
          }
        },
      },
    ],
    toDOM: (node) => ['tg-time', node.attrs.display],
  },

  // In-document anchor target: <a name="chapter-1"></a>
  anchor: {
    attrs: { name: { default: '' } },
    inline: true,
    group: 'inline',
    atom: true,
    parseDOM: [
      {
        tag: 'a[name]',
        getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute('name') || '' }),
      },
    ],
    toDOM: (node) => ['a', { name: node.attrs.name }],
  },
}

function parseCellAttrs(el: unknown): Record<string, unknown> {
  const dom = el as HTMLElement
  return {
    colspan: Number(dom.getAttribute('colspan')) || 1,
    rowspan: Number(dom.getAttribute('rowspan')) || 1,
    align: (['left', 'center', 'right'].includes(dom.getAttribute('align') || '')
      ? dom.getAttribute('align')
      : 'left') as string,
    valign: (['top', 'middle', 'bottom'].includes(dom.getAttribute('valign') || '')
      ? dom.getAttribute('valign')
      : 'top') as string,
  }
}

function cellDomAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (attrs.colspan !== 1) out.colspan = attrs.colspan
  if (attrs.rowspan !== 1) out.rowspan = attrs.rowspan
  if (attrs.align !== 'left') out.align = attrs.align
  if (attrs.valign !== 'top') out.valign = attrs.valign
  return out
}

// RichTextStyle flags → marks. Serialization nesting order (outer→inner) is
// preserved by the serializer: spoiler → b → i → u → s → code → sub → sup →
// mark → a[href].
const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (el) => (el as HTMLElement).style.fontWeight !== 'normal' && null },
      {
        style: 'font-weight',
        getAttrs: (value) =>
          typeof value === 'string' && /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
      },
    ],
    toDOM: () => ['b', 0],
  },

  italic: {
    parseDOM: [
      { tag: 'i' },
      { tag: 'em' },
      { style: 'font-style=italic' },
    ],
    toDOM: () => ['i', 0],
  },

  underline: {
    parseDOM: [{ tag: 'u' }, { tag: 'ins' }],
    toDOM: () => ['u', 0],
  },

  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
    toDOM: () => ['s', 0],
  },

  // Mono excludes every other inline style, like Telegram's MONO flag.
  code: {
    excludes: '_',
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },

  spoiler: {
    parseDOM: [{ tag: 'tg-spoiler' }, { tag: 'span', getAttrs: (el) => (el as HTMLElement).hasAttribute('tg-spoiler') && null }],
    toDOM: () => ['tg-spoiler', 0],
  },

  sub: {
    excludes: 'sup',
    parseDOM: [{ tag: 'sub' }],
    toDOM: () => ['sub', 0],
  },

  sup: {
    excludes: 'sub',
    parseDOM: [{ tag: 'sup' }],
    toDOM: () => ['sup', 0],
  },

  mark: {
    parseDOM: [{ tag: 'mark' }],
    toDOM: () => ['mark', 0],
  },

  link: {
    attrs: { href: { default: '' } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute('href') || '' }),
      },
    ],
    toDOM: (mark) => ['a', { href: mark.attrs.href }, 0],
  },
}

export const schema = new Schema({ nodes, marks })

/** Convenience node-type references, checked once at module load. */
export const N = schema.nodes
export const M = schema.marks

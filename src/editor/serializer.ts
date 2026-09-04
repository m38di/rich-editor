// src/editor/serializer.ts
//
// editor doc → HTML, following the provided HTML Tags Reference EXACTLY.
// This is the web replacement for RichHtml.java + the send pipeline:
// no messaging — the document becomes a clean, semantic HTML fragment.
//
// Rules carried over from the Android serializer:
//  · inline nesting order (outer → inner): spoiler → b → i → u → s → code →
//    sub → sup → mark → a[href]   (RichTextStyle serialization order)
//  · text escaping: & < > ; hard breaks become <br>
//  · attribute escaping: & " < >
//  · defaults are omitted (align="left", valign="top", colspan="1", …)
//  · auto-detected entities (hashtags, @mentions, URLs, emails, /commands,
//    $CASHTAGS, phone numbers, card numbers) stay plain text — Telegram
//    clients parse them on render, so we must not wrap them in markup.

import { Node, Mark } from 'prosemirror-model'
import type { MediaItem, RowButton, ButtonParams as ButtonParamsLike } from './schema'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, '&quot;')

/** RichTextStyle outer→inner nest order. */
const MARK_ORDER = [
  'spoiler',
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'sub',
  'sup',
  'mark',
  'link',
]

function wrapMark(inner: string, mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return `<b>${inner}</b>`
    case 'italic':
      return `<i>${inner}</i>`
    case 'underline':
      return `<u>${inner}</u>`
    case 'strike':
      return `<s>${inner}</s>`
    case 'code':
      return `<code>${inner}</code>`
    case 'spoiler':
      return `<tg-spoiler>${inner}</tg-spoiler>`
    case 'sub':
      return `<sub>${inner}</sub>`
    case 'sup':
      return `<sup>${inner}</sup>`
    case 'mark':
      return `<mark>${inner}</mark>`
    case 'link':
      return `<a href="${escapeAttr(mark.attrs.href)}">${inner}</a>`
    default:
      return inner
  }
}

function renderTextWithMarks(text: string, marks: readonly Mark[]): string {
  const active = MARK_ORDER.map((name) => marks.find((m) => m.type.name === name)).filter(
    (m): m is Mark => !!m,
  )
  let html = escapeHtml(text)
  // wrap innermost first
  for (let i = active.length - 1; i >= 0; i--) html = wrapMark(html, active[i])
  return html
}

/** Inline content of a node → HTML string. */
export function renderInline(parent: Node): string {
  let out = ''
  parent.forEach((child) => {
    if (child.isText) {
      out += renderTextWithMarks(child.text ?? '', child.marks)
    } else {
      switch (child.type.name) {
        case 'hard_break':
          out += '<br>'
          break
        case 'math_inline':
          out += `<tg-math>${escapeHtml(child.attrs.tex)}</tg-math>`
          break
        case 'custom_emoji':
          out += `<tg-emoji emoji-id="${escapeAttr(String(child.attrs.emojiId))}">${escapeHtml(
            child.attrs.emoji,
          )}</tg-emoji>`
          break
        case 'time_inline':
          out += `<tg-time unix="${escapeAttr(String(child.attrs.unix))}" format="${escapeAttr(
            child.attrs.format,
          )}">${escapeHtml(child.attrs.display)}</tg-time>`
          break
        case 'anchor':
          out += `<a name="${escapeAttr(child.attrs.name)}"></a>`
          break
        case 'inline_button': {
          // official inline form inside paragraphs
          const a: string[] = [`type="${escapeAttr(child.attrs.type || 'url')}"`]
          if (child.attrs.style && child.attrs.style !== 'default')
            a.push(`style="${escapeAttr(child.attrs.style)}"`)
          if (child.attrs.url) a.push(`url="${escapeAttr(child.attrs.url)}"`)
          if (child.attrs.data) a.push(`data="${escapeAttr(child.attrs.data)}"`)
          if (child.attrs.query) a.push(`query="${escapeAttr(child.attrs.query)}"`)
          if (child.attrs.copyText) a.push(`text="${escapeAttr(child.attrs.copyText)}"`)
          out += `<tg-button ${a.join(' ')}>${escapeHtml(child.attrs.text || 'Button')}</tg-button>`
          break
        }
      }
    }
  })
  return out
}

function mediaTag(item: MediaItem): string {
  const src = escapeAttr(item.src)
  const sp = item.spoiler ? ' tg-spoiler' : ''
  if (item.kind === 'image') return `<img src="${src}"${sp}/>`
  if (item.kind === 'document') return `<tg-document src="${src}"/>`
  if (item.kind === 'audio') return `<audio src="${src}"></audio>`
  // video and animation both serialize as <video> per the reference
  return `<video src="${src}"${sp}></video>`
}

/** First fig_caption child → <figcaption>, else ''. */
function captionHtml(node: Node): string {
  let out = ''
  node.forEach((child) => {
    if (child.type.name === 'fig_caption') out = `<figcaption>${renderInline(child)}</figcaption>`
  })
  return out
}

function itemsOf(node: Node): MediaItem[] {
  const items = node.attrs.items
  return Array.isArray(items) ? (items as MediaItem[]) : []
}

function serializeListItem(item: Node, task = false): string {
  let inner = ''

  item.forEach((child) => {
    if (child.type.name === 'paragraph') {
      inner += renderInline(child)
    } else {
      inner += serializeBlock(child)
    }
  })

  if (task) {
    const checked = item.attrs.checked ? ' checked' : ''
    return `<li><input type="checkbox"${checked}>${inner}</li>`
  }

  return `<li>${inner}</li>`
}

function serializeTableCell(cell: Node): string {
  let cellContent = ''
  let firstParagraph = true
  
  cell.forEach((child) => {
    if (child.type.name === 'paragraph') {
      if (!firstParagraph) {
        cellContent += '<br>'
      }
  
      cellContent += renderInline(child)
      firstParagraph = false
    } else {
      cellContent += serializeBlock(child)
    }
  })

  return cellContent
}

function serializeBlock(node: Node): string {
  switch (node.type.name) {
    case 'paragraph':
      return `<p>${renderInline(node)}</p>`

    case 'heading':
      return `<h${node.attrs.level}>${renderInline(node)}</h${node.attrs.level}>`

    case 'footer_block':
      return `<footer>${renderInline(node)}</footer>`

    case 'blockquote': {
      let inner = ''
      node.forEach((child) => {
        inner += serializeBlock(child)
      })
      const cite = node.attrs.cite ? `<cite>${escapeHtml(node.attrs.cite)}</cite>` : ''
      return `<blockquote>${inner}${cite}</blockquote>`
    }

    case 'pullquote': {
      let inner = ''
      node.forEach((child) => {
        inner += serializeBlock(child)
      })
      const cite = node.attrs.cite ? `<cite>${escapeHtml(node.attrs.cite)}</cite>` : ''
      return `<aside>${inner}${cite}</aside>`
    }

    case 'code_block': {
      let text = ''
      node.forEach((child) => {
        text += child.text ?? ''
      })
      const body = escapeHtml(text)
      const lang = (node.attrs.language || '').trim()
      return lang
        ? `<pre><code class="language-${escapeAttr(lang)}">${body}</code></pre>`
        : `<pre>${body}</pre>`
    }

    case 'bullet_list': {
      let inner = ''
    
      node.forEach((item) => {
        inner += serializeListItem(item)
      })
    
      return `<ul>${inner}</ul>`
    }

    case 'ordered_list': {
      const attrs: string[] = []
    
      if (node.attrs.start !== 1) {
        attrs.push(`start="${node.attrs.start}"`)
      }
    
      if (node.attrs.type !== '1') {
        attrs.push(`type="${escapeAttr(node.attrs.type)}"`)
      }
    
      let inner = ''
    
      node.forEach((item) => {
        inner += serializeListItem(item)
      })
    
      const attrString = attrs.length
        ? ` ${attrs.join(' ')}`
        : ''
    
      return `<ol${attrString}>${inner}</ol>`
    }

    case 'task_list': {
      let inner = ''
    
      node.forEach((item) => {
        inner += serializeListItem(item, true)
      })
    
      return `<ul class="task-list">${inner}</ul>`
    }

    case 'details': {
      const open = node.attrs.open ? ' open' : ''
      let summary = ''
      let body = ''
      node.forEach((child) => {
        if (child.type.name === 'details_summary') summary = renderInline(child)
        else body += serializeBlock(child)
      })
      return `<details${open}><summary>${summary}</summary>${body}</details>`
    }

    case 'horizontal_rule':
      return '<hr/>'

    case 'media_figure': {
      const item: MediaItem = {
        kind: node.attrs.kind,
        src: node.attrs.src,
        spoiler: !!node.attrs.spoiler,
      }
      const caption = captionHtml(node)
      const media = mediaTag(item)
      return caption ? `<figure>${media}${caption}</figure>` : media
    }

    case 'media_group': {
      const tag = node.attrs.mode === 'slideshow' ? 'tg-slideshow' : 'tg-collage'
      const items = itemsOf(node).map(mediaTag).join('')
      return `<${tag}>${items}${captionHtml(node)}</${tag}>`
    }

    case 'map_block': {
      const map = `<tg-map lat="${escapeAttr(String(node.attrs.lat))}" long="${escapeAttr(
        String(node.attrs.long),
      )}" zoom="${escapeAttr(String(node.attrs.zoom))}"/>`
      const caption = captionHtml(node)
      return caption ? `<figure>${map}${caption}</figure>` : map
    }

    case 'button_row': {
      // Official rich-HTML form with the full attribute set per type:
      //   <tg-button type="url" style="success" url="https://t.me">Label</tg-button>
      const buttons: Partial<RowButton>[] = Array.isArray(node.attrs.buttons)
        ? node.attrs.buttons
        : []
      const attrsOf = (b: Partial<RowButton>): string => {
        const p = b.params ?? {}
        const a: string[] = [`type="${escapeAttr(b.type || 'url')}"`]
        if (b.style && b.style !== 'default') a.push(`style="${escapeAttr(b.style)}"`)
        if (p.url) a.push(`url="${escapeAttr(p.url)}"`)
        if (p.data) a.push(`data="${escapeAttr(p.data)}"`)
        if (p.query) a.push(`query="${escapeAttr(p.query)}"`)
        if (p.text) a.push(`text="${escapeAttr(p.text)}"`)
        if (p.forwardText) a.push(`forward-text="${escapeAttr(p.forwardText)}"`)
        if (p.requestWriteAccess) a.push('request-write-access')
        if (p.allowUserChats) a.push('allow-user-chats')
        if (p.allowBotChats) a.push('allow-bot-chats')
        if (p.allowGroupChats) a.push('allow-group-chats')
        if (p.allowChannelChats) a.push('allow-channel-chats')
        return a.join(' ')
      }
      const pills = buttons
        .map((b) => `<tg-button ${attrsOf(b)}>${escapeHtml(b.text || 'Button')}</tg-button>`)
        .join('')
      return `<tg-button-row>${pills}</tg-button-row>`
    }

    case 'table': {
      const flags = `${node.attrs.bordered ? ' bordered' : ''}${node.attrs.compact ? ' compact' : ''}${node.attrs.striped ? ' striped' : ''}`
      let inner = ''
      node.forEach((child) => {
        if (child.type.name === 'table_caption') {
          inner += `<caption>${renderInline(child)}</caption>`
        } else if (child.type.name === 'table_row') {
          let cells = ''
          child.forEach((cell) => {
            const tag = cell.type.name === 'table_header' ? 'th' : 'td'
            const a: string[] = []
            if (cell.attrs.colspan !== 1) a.push(`colspan="${cell.attrs.colspan}"`)
            if (cell.attrs.rowspan !== 1) a.push(`rowspan="${cell.attrs.rowspan}"`)
            if (cell.attrs.align !== 'left') a.push(`align="${cell.attrs.align}"`)
            if (cell.attrs.valign !== 'top') a.push(`valign="${cell.attrs.valign}"`)
            const attrs = a.length ? ' ' + a.join(' ') : ''
            cells += `<${tag}${attrs}>${serializeTableCell(cell)}</${tag}>`
          })
          inner += `<tr>${cells}</tr>`
        }
      })
      return `<table${flags}>${inner}</table>`
    }

    case 'math_block':
      return `<tg-math-block>${escapeHtml(node.attrs.tex)}</tg-math-block>`

    default:
      return ''
  }
}

/** Serialize a full document to an HTML fragment (reference tags only). */
export function serializeRichHtml(doc: Node): string {
  const parts: string[] = []
  doc.forEach((child) => {
    const html = serializeBlock(child)
    if (html) parts.push(html)
  })
  return parts.join('\n')
}

/** Plain-text length of the document (for the limits counter). */
export function docTextLength(doc: Node): number {
  let len = 0
  doc.descendants((node) => {
    if (node.isText) len += node.text?.length ?? 0
  })
  return len
}

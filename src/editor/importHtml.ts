// src/editor/importHtml.ts
//
// The inverse of the Generate → Download pipeline:
//
//     .html file → extract article/body → ProseMirror DOMParser → doc
//
// Files produced by this editor's own Download step round-trip fully —
// headings, marks, lists, details, tables, code blocks, tg-spoiler,
// tg-emoji, tg-time, tg-math(-block), tg-map, galleries, figures, buttons.
// Arbitrary semantic HTML degrades gracefully: unknown tags flatten into
// paragraphs and unknown attributes are ignored by the schema.

import { DOMParser as PMParser, Node } from 'prosemirror-model'
import { schema } from './schema'

/** Elements that never belong in an article body. */
const STRIP_SELECTOR =
  'script, style, link, meta, noscript, template, iframe, object, embed'

/**
 * Full HTML document or fragment → the element whose children get imported.
 * Our own exports wrap the content in <article> (plus a stylesheet and a
 * tiny spoiler script, both stripped here) — prefer the article, fall back
 * to the whole body.
 */
function articleRoot(html: string): HTMLElement {
  const dom = new window.DOMParser().parseFromString(html, 'text/html')
  dom.querySelectorAll(STRIP_SELECTOR).forEach((el) => el.remove())
  return dom.querySelector('article') || dom.body
}

/** Parse an HTML string into a schema document. */
export function htmlToDoc(html: string): Node {
  const root = articleRoot(html)
  return PMParser.fromSchema(schema).parse(root)
}

/** Does the parsed document carry anything worth importing? */
export function docHasContent(doc: Node): boolean {
  let has = false
  doc.forEach((child) => {
    // an empty paragraph is the schema's "blank line" — everything else
    // (any inline content, hr, media, tables, …) counts as real content
    if (child.type.name !== 'paragraph' || child.content.size > 0) has = true
  })
  return has
}

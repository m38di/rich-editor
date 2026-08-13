import { DOMParser as ProseMirrorDOMParser, Node as PMNode } from 'prosemirror-model'
import { schema } from './schema'

const MAX_HTML_SIZE = 5 * 1024 * 1024

export function importHtml(html: string): PMNode {
  if (new Blob([html]).size > MAX_HTML_SIZE) {
    throw new Error('HTML file is larger than 5 MB')
  }

  const dom = new DOMParser().parseFromString(html, 'text/html')

  if (dom.querySelector('parsererror')) {
    throw new Error('Invalid HTML')
  }

  return ProseMirrorDOMParser.fromSchema(schema).parse(dom.body)
}

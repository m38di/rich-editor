import { DOMParser as PMDOMParser, Node as PMNode } from 'prosemirror-model'
import { schema } from './schema'

export function parseHtml(html: string): PMNode {
  const dom = new DOMParser().parseFromString(html, 'text/html')

  return PMDOMParser.fromSchema(schema).parse(dom.body)
}

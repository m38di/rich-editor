// src/editor/orderedListClick.ts

import { EditorView } from 'prosemirror-view'
import { bus } from './bus'

function findOrderedListPos(
  view: EditorView,
  ol: HTMLElement,
): number | null {
  let found: number | null = null

  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false

    if (
      node.type.name === 'ordered_list' &&
      view.nodeDOM(pos) === ol
    ) {
      found = pos
      return false
    }

    return true
  })

  return found
}

export function handleOrderedListMarkerClick(
  view: EditorView,
  event: MouseEvent,
): boolean {
  const target = event.target

  if (!(target instanceof HTMLElement)) return false

  const li = target.closest('li')

  if (!(li instanceof HTMLElement)) return false

  // Only a DIRECT li of an <ol> opens the ordered-list menu — a bullet li
  // nested inside an ordered list must keep its own behavior.
  const ol = li.parentElement

  if (!(ol instanceof HTMLElement) || ol.tagName !== 'OL') return false

  const paragraph = li.querySelector(':scope > p')

  if (!(paragraph instanceof HTMLElement)) return false

  const paragraphRect = paragraph.getBoundingClientRect()

  // The marker is to the LEFT of the actual list-item content.
  const clickedMarker =
    event.clientX < paragraphRect.left

  if (!clickedMarker) return false

  const pos = findOrderedListPos(view, ol)

  if (pos === null) return false

  event.preventDefault()

  bus.emit('dialog:ordered-list', { pos })

  return true
}

// src/editor/bus.ts
//
// A tiny event bus connecting ProseMirror node views (plain DOM classes)
// with the React chrome (dialogs, sheets). Node views cannot call React
// callbacks directly, so they emit typed events here; App subscribes.

export type BusEvents = {
  'dialog:map': { pos: number }
  'dialog:math': { pos: number; inline: boolean }
  'dialog:link': void
  'dialog:media-url': { pos: number }
  'dialog:ordered-list': { pos: number }
  /** create/edit a pill in the button_row at pos (index = slot) */
  'dialog:row-button': { pos: number; index: number }
  /** edit the inline button atom at pos */
  'dialog:inline-button': { pos: number }
  /** selected table-cell doc positions, or null when selection empties */
  'table:menu': number[] | null
  /** every cell-selection change, including the single active cell */
  'table:selection': number[]
  'toast': { text: string }
}

type Handler<T> = (payload: T) => void

const listeners = new Map<string, Set<Handler<unknown>>>()

export const bus = {
  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): () => void {
    let set = listeners.get(event)
    if (!set) {
      set = new Set()
      listeners.set(event, set)
    }
    set.add(handler as Handler<unknown>)
    return () => set!.delete(handler as Handler<unknown>)
  },

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    listeners.get(event)?.forEach((h) => h(payload))
  },
}

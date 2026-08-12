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

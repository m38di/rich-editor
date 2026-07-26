// src/editor/nodeviews.ts
//
// Custom ProseMirror node views — the web counterpart of the Android cells:
//
//   RichMediaCell      → MediaFigureView / MediaGroupView (collage·slideshow)
//   RichMapCell        → MapView
//   RichMathCell       → MathBlockView        MathSpan → MathInlineView
//   RichDetailsCell    → DetailsView (arrow toggle, single content hole)
//   RichQuoteAuthorCell→ QuoteView / PullquoteView (author input = cite attr)
//   todo rows          → TaskItemView (checkbox button)
//   FormattedDate      → TimeChipView
//   (anchors)          → AnchorChipView
//
// Node views talk to React dialogs through the bus (see bus.ts).

import { EditorView, NodeView } from 'prosemirror-view'
import { Node } from 'prosemirror-model'
import katex from 'katex'
import { N, MediaItem } from './schema'
import { bus } from './bus'

type GetPos = () => number

function el(tag: 'button', cls?: string, text?: string): HTMLButtonElement
function el(tag: string, cls?: string, text?: string): HTMLElement
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** DOM node type — the bare name `Node` is taken by prosemirror-model. */
type DomNode = Parameters<HTMLElement['contains']>[0]

/** Shared mutation policy: let PM manage contentDOM only. */
function ignoreMutationFactory(getContentDOM: () => HTMLElement | null) {
  return (mutation: { type: string; target: DomNode }): boolean => {
    if (mutation.type === 'selection') return false
    const contentDOM = getContentDOM()
    if (!contentDOM) return true
    if (mutation.target === contentDOM || contentDOM.contains(mutation.target)) return false
    return true
  }
}

function stopEventOnInputs(event: Event): boolean {
  const t = event.target as HTMLElement
  return !!t.closest?.('input, button, .re-stop')
}

// ── media figure (RichMediaCell, mode=single) ───────────────────────────

class MediaFigureView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private frame: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('figure', 're-media')
    this.frame = el('div', 're-media-frame')
    this.contentDOM = el('figcaption', 're-caption')
    this.contentDOM.setAttribute('data-placeholder', 'Caption…')
    this.dom.append(this.frame, this.contentDOM)
    this.dom.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.re-media-btn')) e.preventDefault()
    })
    this.render()
  }

  private setAttrs(attrs: Record<string, unknown>) {
    const pos = this.getPos()
    if (pos === undefined) return
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs }),
    )
  }

  private pickFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept =
      this.node.attrs.kind === 'audio' ? 'audio/*' : this.node.attrs.kind === 'image' ? 'image/*' : 'video/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const src = URL.createObjectURL(file)
      const kind = file.type.startsWith('audio')
        ? 'audio'
        : file.type.startsWith('video')
          ? file.name.toLowerCase().endsWith('.gif')
            ? 'animation'
            : 'video'
          : 'image'
      this.setAttrs({ src, kind })
    }
    input.click()
  }

  private render() {
    const { kind, src, spoiler } = this.node.attrs
    this.frame.innerHTML = ''
    this.frame.classList.toggle('spoilered', !!spoiler)

    if (!src) {
      const ph = el('button', 're-media-placeholder re-media-btn')
      ph.type = 'button'
      ph.innerHTML = `<span class="re-media-ph-icon">${
        kind === 'audio' ? '🎵' : kind === 'image' ? '🖼' : '🎬'
      }</span><span>Add ${kind === 'animation' ? 'animation' : kind}</span>`
      ph.onclick = () => this.pickFile()
      this.frame.append(ph)
    } else if (kind === 'image') {
      const img = document.createElement('img')
      img.src = src
      img.alt = ''
      this.frame.append(img)
    } else if (kind === 'audio') {
      const audio = document.createElement('audio')
      audio.src = src
      audio.controls = true
      this.frame.append(audio)
    } else {
      const video = document.createElement('video')
      video.src = src
      video.controls = true
      if (kind === 'animation') video.loop = true
      this.frame.append(video)
    }

    // hover controls
    const bar = el('div', 're-media-tools re-stop')
    const spoilerBtn = el('button', 're-media-btn re-tool', spoiler ? '👁 Spoiler on' : '🙈 Spoiler')
    spoilerBtn.type = 'button'
    spoilerBtn.title = 'Toggle spoiler'
    spoilerBtn.onclick = (e) => {
      e.stopPropagation()
      this.setAttrs({ spoiler: !spoiler })
    }
    const replaceBtn = el('button', 're-media-btn re-tool', '↺ Replace')
    replaceBtn.type = 'button'
    replaceBtn.onclick = (e) => {
      e.stopPropagation()
      this.pickFile()
    }
    const deleteBtn = el('button', 're-media-btn re-tool danger', '✕')
    deleteBtn.type = 'button'
    deleteBtn.title = 'Remove block'
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize))
    }
    bar.append(spoilerBtn, replaceBtn, deleteBtn)
    this.frame.append(bar)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    // Skip the rebuild when only the caption changed — recreating the
    // <img>/<video> on every keystroke would restart playback.
    const a = this.node.attrs
    const b = node.attrs
    const same = a.kind === b.kind && a.src === b.src && a.spoiler === b.spoiler
    this.node = node
    if (!same) this.render()
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent = stopEventOnInputs
}

// ── collage / slideshow (RichMediaCell, mode=collage|slideshow) ─────────

class MediaGroupView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private grid: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('div', 're-gallery re-stop')
    this.grid = el('div', 're-gallery-grid')
    this.contentDOM = el('figcaption', 're-caption')
    this.contentDOM.setAttribute('data-placeholder', 'Caption…')
    this.dom.append(this.grid, this.contentDOM)
    this.render()
  }

  private items(): MediaItem[] {
    return Array.isArray(this.node.attrs.items) ? [...(this.node.attrs.items as MediaItem[])] : []
  }

  private setItems(items: MediaItem[]) {
    const pos = this.getPos()
    if (pos === undefined) return
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, items }),
    )
  }

  private addFiles() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*,video/*,audio/*'
    input.onchange = () => {
      const files = Array.from(input.files || [])
      if (!files.length) return
      const items = this.items()
      for (const file of files.slice(0, 10 - items.length)) {
        const kind = file.type.startsWith('video')
          ? file.name.toLowerCase().endsWith('.gif')
            ? 'animation'
            : 'video'
          : file.type.startsWith('audio')
            ? 'audio'
            : 'image'
        items.push({ kind, src: URL.createObjectURL(file), spoiler: false })
      }
      this.setItems(items)
    }
    input.click()
  }

  private render() {
    const items = this.items()
    const mode = this.node.attrs.mode as string
    this.grid.innerHTML = ''
    this.grid.dataset.mode = mode

    items.forEach((item, i) => {
      const tile = el('div', 're-gallery-tile')
      if (item.spoiler) tile.classList.add('spoilered')
      let media: HTMLElement
      if (item.kind === 'audio') {
        media = document.createElement('audio')
        ;(media as HTMLAudioElement).src = item.src
        ;(media as HTMLAudioElement).controls = true
      } else if (item.kind === 'image') {
        media = document.createElement('img')
        ;(media as HTMLImageElement).src = item.src
      } else {
        media = document.createElement('video')
        ;(media as HTMLVideoElement).src = item.src
        ;(media as HTMLVideoElement).controls = mode === 'collage' ? false : true
        if (item.kind === 'animation') {
          (media as HTMLVideoElement).loop = true
        }
      }
      const tools = el('div', 're-tile-tools re-stop')
      const sp = el('button', 're-media-btn re-tool', item.spoiler ? '👁' : '🙈')
      sp.type = 'button'
      sp.title = 'Toggle spoiler'
      sp.onclick = () => {
        const next = this.items()
        next[i] = { ...next[i], spoiler: !next[i].spoiler }
        this.setItems(next)
      }
      const rm = el('button', 're-media-btn re-tool danger', '✕')
      rm.type = 'button'
      rm.onclick = () => this.setItems(this.items().filter((_, j) => j !== i))
      tools.append(sp, rm)
      tile.append(media, tools)
      this.grid.append(tile)
    })

    if (items.length < 10) {
      const add = el('button', 're-gallery-add re-stop', '+')
      add.type = 'button'
      add.title = 'Add media'
      add.onclick = () => this.addFiles()
      this.grid.append(add)
    }

    // mode toggle — Android shows it from 2 items, 320ms transition
    if (items.length >= 2) {
      const toggle = el('div', 're-gallery-mode re-stop')
      for (const m of ['collage', 'slideshow']) {
        const b = el('button', m === mode ? 'on' : '', m === 'collage' ? 'Collage' : 'Slideshow')
        b.type = 'button'
        b.onclick = () => {
          const pos = this.getPos()
          if (pos === undefined) return
          this.view.dispatch(
            this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, mode: m }),
          )
        }
        toggle.append(b)
      }
      this.grid.append(toggle)
    }
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    // Skip the rebuild when only the caption changed (items/mode intact).
    const same =
      node.attrs.mode === this.node.attrs.mode &&
      JSON.stringify(node.attrs.items) === JSON.stringify(this.node.attrs.items)
    this.node = node
    if (!same) this.render()
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent = stopEventOnInputs
}

// ── map (RichMapCell) ───────────────────────────────────────────────────

class MapView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private box: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('figure', 're-map-figure')
    this.box = el('div', 're-map re-stop')
    this.contentDOM = el('figcaption', 're-caption')
    this.contentDOM.setAttribute('data-placeholder', 'Caption…')
    this.dom.append(this.box, this.contentDOM)
    this.box.onclick = () => bus.emit('dialog:map', { pos: this.getPos() })
    this.render()
  }

  private render() {
    const { lat, long, zoom } = this.node.attrs
    this.box.innerHTML = `<span class="re-map-pin">📍</span><span class="re-map-label">${Number(lat).toFixed(
      4,
    )}, ${Number(long).toFixed(4)} · zoom ${zoom}</span><span class="re-map-edit">Edit location</span>`
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent = stopEventOnInputs
}

// ── math (RichMathCell / MathSpan) ──────────────────────────────────────

function renderKatex(target: HTMLElement, tex: string, displayMode: boolean): void {
  target.innerHTML = ''
  if (!tex.trim()) {
    target.append(el('span', 're-math-empty', displayMode ? 'Empty formula — click to edit' : 'ƒx'))
    return
  }
  try {
    katex.render(tex, target, { throwOnError: false, displayMode })
  } catch {
    target.textContent = tex
  }
}

class MathBlockView implements NodeView {
  dom: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('div', 're-math-block re-stop')
    this.dom.onclick = () => bus.emit('dialog:math', { pos: this.getPos(), inline: false })
    this.render()
  }

  private render() {
    renderKatex(this.dom, this.node.attrs.tex, true)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
  stopEvent(): boolean {
    return true
  }
  selectNode(): void {
    this.dom.classList.add('selected')
  }
  deselectNode(): void {
    this.dom.classList.remove('selected')
  }
}

class MathInlineView implements NodeView {
  dom: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('span', 're-math-inline re-stop')
    this.dom.onclick = () => bus.emit('dialog:math', { pos: this.getPos(), inline: true })
    this.render()
  }

  private render() {
    renderKatex(this.dom, this.node.attrs.tex, false)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
}

// ── time chip (FormattedDate entity) ────────────────────────────────────

class TimeChipView implements NodeView {
  dom: HTMLElement

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.dom = el('span', 're-time-chip', `📅 ${node.attrs.display}`)
    this.dom.title = `unix ${node.attrs.unix} · format ${node.attrs.format}`
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.dom.textContent = `📅 ${node.attrs.display}`
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
}

// ── anchor chip ─────────────────────────────────────────────────────────

class AnchorChipView implements NodeView {
  dom: HTMLElement

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.dom = el('span', 're-anchor-chip', `⚑ ${node.attrs.name}`)
    this.dom.title = 'In-document anchor'
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.dom.textContent = `⚑ ${node.attrs.name}`
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
}

// ── details / toggle (RichDetailsCell) ──────────────────────────────────

class DetailsView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private arrow: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('details', 're-details')
    const body = el('div', 're-details-body')
    this.contentDOM = body
    this.arrow = el('button', 're-details-arrow re-stop', '▸')
    this.arrow.type = 'button'
    this.arrow.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          open: !this.node.attrs.open,
        }),
      )
    }
    this.dom.append(this.arrow, body)
    this.sync()
  }

  private sync() {
    const open = !!this.node.attrs.open
    if (open) this.dom.setAttribute('open', '')
    else this.dom.removeAttribute('open')
    this.arrow.textContent = open ? '▾' : '▸'
    this.dom.classList.toggle('collapsed', !open)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync()
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent = stopEventOnInputs
}

// ── quote + author (RichQuoteAuthorCell) ────────────────────────────────

class QuoteView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private input: HTMLInputElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('blockquote', 're-quote')
    this.contentDOM = el('div', 're-quote-body')
    this.input = document.createElement('input')
    this.input.className = 're-quote-author re-stop'
    this.input.placeholder = 'Author'
    this.input.value = node.attrs.cite || ''
    this.input.oninput = () => {
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          cite: this.input.value || null,
        }),
      )
    }
    this.dom.append(this.contentDOM, this.input)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    if (document.activeElement !== this.input) this.input.value = node.attrs.cite || ''
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent(event: Event): boolean {
    return event.target === this.input || stopEventOnInputs(event)
  }
}

class PullquoteView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private input: HTMLInputElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('aside', 're-pullquote')
    this.contentDOM = el('div', 're-pullquote-body')
    this.input = document.createElement('input')
    this.input.className = 're-quote-author re-stop'
    this.input.placeholder = 'Author'
    this.input.value = node.attrs.cite || ''
    this.input.oninput = () => {
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          cite: this.input.value || null,
        }),
      )
    }
    this.dom.append(this.contentDOM, this.input)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    if (document.activeElement !== this.input) this.input.value = node.attrs.cite || ''
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent(event: Event): boolean {
    return event.target === this.input || stopEventOnInputs(event)
  }
}

// ── task item (todo rows) ───────────────────────────────────────────────

class TaskItemView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private checkbox: HTMLElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node
    this.dom = el('li', 're-task')
    this.checkbox = el('button', 're-checkbox re-stop')
    this.checkbox.type = 'button'
    this.checkbox.setAttribute('role', 'checkbox')
    this.checkbox.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          checked: !this.node.attrs.checked,
        }),
      )
    }
    this.contentDOM = el('div', 're-task-body')
    this.dom.append(this.checkbox, this.contentDOM)
    this.sync()
  }

  private sync() {
    const checked = !!this.node.attrs.checked
    this.checkbox.setAttribute('aria-checked', String(checked))
    this.checkbox.textContent = checked ? '✓' : ''
    this.dom.classList.toggle('checked', checked)
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync()
    return true
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent = stopEventOnInputs
}

// ── registry ────────────────────────────────────────────────────────────

export const nodeViews: Record<string, (node: Node, view: EditorView, getPos: () => number | undefined) => NodeView> = {
  media_figure: (node, view, getPos) => new MediaFigureView(node, view, getPos as GetPos),
  media_group: (node, view, getPos) => new MediaGroupView(node, view, getPos as GetPos),
  map_block: (node, view, getPos) => new MapView(node, view, getPos as GetPos),
  math_block: (node, view, getPos) => new MathBlockView(node, view, getPos as GetPos),
  math_inline: (node, view, getPos) => new MathInlineView(node, view, getPos as GetPos),
  time_inline: (node, view, getPos) => new TimeChipView(node, view, getPos as GetPos),
  anchor: (node, view, getPos) => new AnchorChipView(node, view, getPos as GetPos),
  details: (node, view, getPos) => new DetailsView(node, view, getPos as GetPos),
  blockquote: (node, view, getPos) => new QuoteView(node, view, getPos as GetPos),
  pullquote: (node, view, getPos) => new PullquoteView(node, view, getPos as GetPos),
  task_item: (node, view, getPos) => new TaskItemView(node, view, getPos as GetPos),
}

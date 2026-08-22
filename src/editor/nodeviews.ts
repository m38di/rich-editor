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
import { TextSelection } from 'prosemirror-state'
import katex from 'katex'
import { N, MediaItem } from './schema'
import { bus } from './bus'
import { computeGalleryGeometry } from './groupedLayout'
import { ivIconSvg } from '../components/ivIcons'
import { tableToGrid, cellKey } from './tableCommands'
import { tableSelectionKey, clearTableSelection } from './plugins'

type GetPos = () => number

const iconSvg = ivIconSvg

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

/**
 * Mousedown → caret for empty node-view captions (figcaption contentDOM).
 * PM's posAtCoords cannot map a point on an empty inline node view, so the
 * click would fall through to a neighbouring block. Place the caret at the
 * caption start ourselves instead.
 */
function captionCaretHandler(view: EditorView, contentDOM: HTMLElement) {
  return (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest?.('button, input')) return
    e.preventDefault()
    e.stopPropagation()
    try {
      const pos = view.posAtDOM(contentDOM, 0)
      const $pos = view.state.doc.resolve(pos + 1) // inside the fig_caption
      view.focus()
      view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)))
    } catch {
      /* unmapped — let ProseMirror fall back */
    }
  }
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
    this.contentDOM.addEventListener('mousedown', captionCaretHandler(view, this.contentDOM))
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
    const pos = this.getPos()
    if (pos === undefined) return
    bus.emit('dialog:media-url', { pos })
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
//
// Web port of the Android gallery cell:
//   · collage rects from RichMessageLayout.computeGrouped (groupedLayout.ts)
//   · 2px gaps, accent circle buttons (add / switch-mode / per-item ⋯)
//   · slideshow = full-width pager with drag + fling, page dots, 320ms
//     morph between the two geometries (EASE_OUT_QUINT)
//   · per-item ⋯ menu → spoiler toggle / delete (onMenuClicked)

const EASE_OUT_QUINT = (t: number): number => 1 - Math.pow(1 - t, 5)
const GALLERY_MAX_ITEMS = 50

class MediaGroupView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  private node: Node
  private view: EditorView
  private getPos: GetPos

  private stage: HTMLElement
  private dots: HTMLElement
  private addBtn: HTMLButtonElement
  private switchBtn: HTMLButtonElement
  private itemMenu: HTMLElement | null = null
  private itemMenuIndex = -1

  private tiles: HTMLElement[] = []

  // pager state (RichMediaCell currentPage/pageOffset)
  private page = 0
  private pageOffset = 0
  private dragging = false
  private settleRaf = 0
  private downX = 0
  private downY = 0
  private lastX = 0
  private lastT = 0
  private velocity = 0

  private ro: ResizeObserver | null = null
  private detached = false

  constructor(node: Node, view: EditorView, getPos: GetPos) {
    this.node = node
    this.view = view
    this.getPos = getPos

    // NOTE: no `re-stop` on the root — it would make stopEvent swallow
    // mousedowns on the caption too, so the caret could never enter it.
    this.dom = el('div', 're-gallery')
    this.stage = el('div', 're-gallery-stage')
    this.dots = el('div', 're-gallery-pagerdots')
    this.stage.append(this.dots)

    this.contentDOM = el('figcaption', 're-caption')
    this.contentDOM.setAttribute('data-placeholder', 'Caption…')

    this.addBtn = el('button', 're-gal-circle re-gal-add') as HTMLButtonElement
    this.addBtn.type = 'button'
    this.addBtn.title = 'Add media'
    this.addBtn.setAttribute('aria-label', 'Add media')
    this.addBtn.innerHTML = iconSvg('media_add')
    this.addBtn.onclick = () => {
      const pos = this.getPos()
      if (pos !== undefined) bus.emit('dialog:media-url', { pos })
    }

    this.switchBtn = el('button', 're-gal-circle re-gal-switch') as HTMLButtonElement
    this.switchBtn.type = 'button'
    this.switchBtn.title = 'Switch collage/slideshow'
    this.switchBtn.onclick = () => {
      const pos = this.getPos()
      if (pos === undefined) return
      const next = this.node.attrs.mode === 'slideshow' ? 'collage' : 'slideshow'
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, mode: next }),
      )
    }

    this.dom.append(this.stage, this.addBtn, this.switchBtn, this.contentDOM)
    this.contentDOM.addEventListener('mousedown', captionCaretHandler(view, this.contentDOM))

    this.stage.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    this.stage.addEventListener('click', () => {
      // empty gallery tap → pick media (handleTap → onMediaPick)
      if (this.items().length === 0) {
        const pos = this.getPos()
        if (pos !== undefined) bus.emit('dialog:media-url', { pos })
      }
    })

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.relayout())
      this.ro.observe(this.dom)
    }

    this.render()
    requestAnimationFrame(() => this.relayout())
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

  private isSlideshow(): boolean {
    return this.node.attrs.mode === 'slideshow' && this.items().length >= 2
  }

  // ── rendering ─────────────────────────────────────────────────────────

  private render() {
    const items = this.items()
    const mode = this.node.attrs.mode as string
    this.tiles = []
    this.stage.innerHTML = ''
    this.stage.dataset.mode = mode
    this.stage.append(this.dots)
    this.dots.innerHTML = ''

    items.forEach((item, i) => {
      const tile = el('div', 're-gallery-tile')
      if (item.spoiler) tile.classList.add('spoilered')

      let media: HTMLElement
      if (item.kind === 'image') {
        const img = document.createElement('img')
        img.src = item.src
        img.alt = ''
        img.draggable = false
        img.addEventListener('load', () => this.relayout())
        media = img
      } else if (item.kind === 'audio') {
        const audio = document.createElement('audio')
        audio.src = item.src
        audio.controls = true
        media = audio
      } else {
        const video = document.createElement('video')
        video.src = item.src
        video.controls = this.isSlideshow()
        video.addEventListener('loadedmetadata', () => this.relayout())
        if (item.kind === 'animation') video.loop = true
        media = video
      }
      media.classList.add('re-gallery-media')

      // per-item ⋯ circle (menuButtons → onMenuClicked)
      const dots = el('button', 're-gal-circle re-gal-itemmenu') as HTMLButtonElement
      dots.type = 'button'
      dots.title = 'Media options'
      dots.innerHTML = iconSvg('media_dots')
      dots.onclick = (e) => {
        e.stopPropagation()
        this.openItemMenu(i, dots)
      }
      tile.append(media, dots)
      this.stage.append(tile)
      this.tiles.push(tile)
    })

    // page dots (drawDots)
    if (this.isSlideshow()) {
      for (let i = 0; i < items.length; i++) {
        this.dots.append(el('span', 're-gal-dot'))
      }
    }

    // switch button visible from 2 items (updateSwitchButton)
    this.switchBtn.style.display = items.length >= 2 ? '' : 'none'
    this.switchBtn.innerHTML = iconSvg(this.node.attrs.mode === 'slideshow' ? 'media_slideshow' : 'media_collage')

    if (this.page >= items.length) this.page = Math.max(0, items.length - 1)
    this.pageOffset = 0
    this.relayout()
  }

  /** Current visual rect of tile i (buildItemRects + computeGeometry). */
  private relayout() {
    if (this.detached) return
    const items = this.items()
    const w = this.dom.clientWidth
    if (w <= 0) return
    const ratios = this.tiles.map((t) => {
      const m = t.querySelector('.re-gallery-media') as
        | HTMLImageElement
        | HTMLVideoElement
        | HTMLAudioElement
        | null
      if (!m) return 1
      const vw = (m as HTMLImageElement).naturalWidth || (m as HTMLVideoElement).videoWidth || 0
      const vh = (m as HTMLImageElement).naturalHeight || (m as HTMLVideoElement).videoHeight || 0
      return vw > 0 && vh > 0 ? vw / vh : 1
    })

    const maxSide = Math.max(window.innerWidth, window.innerHeight)
    const minSide = Math.min(window.innerWidth, window.innerHeight)
    const geo = computeGalleryGeometry(w, ratios.length ? ratios : [1], maxSide, minSide)

    const slideshow = this.isSlideshow()
    const stageH = items.length === 0
      ? Math.round(Math.min(200, maxSide * 0.55))
      : slideshow
        ? geo.slideH
        : geo.collageH
    this.stage.style.height = `${Math.round(stageH)}px`

    this.tiles.forEach((tile, i) => {
      let left: number, top: number, width: number, height: number
      if (slideshow) {
        width = geo.slideW
        height = geo.slideH
        left = (i - this.page - this.pageOffset) * geo.slideW
        top = 0
      } else {
        const r = geo.collage[i] ?? { left: 0, top: 0, width: 0, height: 0 }
        left = r.left
        top = r.top
        width = r.width
        height = r.height
      }
      tile.style.left = `${Math.round(left)}px`
      tile.style.top = `${Math.round(top)}px`
      tile.style.width = `${Math.round(width)}px`
      tile.style.height = `${Math.round(height)}px`
    })

    this.updateDots(geo)
  }

  private updateDots(geo?: { slideW: number }) {
    const n = this.items().length
    if (!this.isSlideshow() || n < 2) return
    const spans = this.dots.children
    const sel = this.page + this.pageOffset
    for (let a = 0; a < spans.length && a < n; a++) {
      const s = spans[a] as HTMLElement
      const selection = Math.max(0, 1 - Math.abs(a - sel))
      s.classList.toggle('on', selection > 0.5)
      s.style.opacity = String(0.63 + 0.37 * selection)
    }
  }

  // ── pager interaction (RichMediaCell.onTouchEvent/settle) ─────────────

  private onPointerDown(e: PointerEvent) {
    if (!this.isSlideshow()) return
    if (e.button !== undefined && e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, audio, video[controls]')) return
    this.cancelSettle()
    this.downX = this.lastX = e.clientX
    this.downY = e.clientY
    this.lastT = performance.now()
    this.velocity = 0
    this.dragging = false
    this.stage.setPointerCapture(e.pointerId)
    this.stage.onpointermove = (ev) => this.onPointerMove(ev)
    this.stage.onpointerup = (ev) => this.onPointerUp(ev)
    this.stage.onpointercancel = (ev) => this.onPointerUp(ev)
    e.preventDefault()
  }

  private onPointerMove(e: PointerEvent) {
    const ddx = e.clientX - this.downX
    const ddy = e.clientY - this.downY
    if (!this.dragging) {
      if (Math.abs(ddx) > 6 && Math.abs(ddx) > Math.abs(ddy)) {
        this.dragging = true
      } else if (Math.abs(ddy) > 6) {
        this.releasePointer(e)
        return
      } else {
        return
      }
    }
    const now = performance.now()
    const dt = now - this.lastT
    if (dt > 0) {
      this.velocity = (e.clientX - this.lastX) / dt
      this.lastX = e.clientX
      this.lastT = now
    }
    const slideW = this.stage.clientWidth || 1
    let off = -ddx / slideW
    // rubber-band at the edges (0.3× resistance)
    if ((this.page === 0 && off < 0) || (this.page === this.items().length - 1 && off > 0)) {
      off *= 0.3
    }
    this.pageOffset = off
    this.relayout()
    e.preventDefault()
  }

  private onPointerUp(e: PointerEvent) {
    this.releasePointer(e)
    if (!this.dragging) return
    this.dragging = false
    this.settle(this.velocity)
  }

  private releasePointer(e: PointerEvent) {
    try {
      this.stage.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
    this.stage.onpointermove = null
    this.stage.onpointerup = null
    this.stage.onpointercancel = null
  }

  private cancelSettle() {
    if (this.settleRaf) {
      cancelAnimationFrame(this.settleRaf)
      this.settleRaf = 0
    }
  }

  /** 220ms EASE_OUT_QUINT settle (RichMediaCell.settle). */
  private settle(velocityX: number) {
    const n = this.items().length
    let delta = 0
    if (velocityX < -0.5 && this.page < n - 1) delta = 1
    else if (velocityX > 0.5 && this.page > 0) delta = -1
    else if (this.pageOffset > 0.5 && this.page < n - 1) delta = 1
    else if (this.pageOffset < -0.5 && this.page > 0) delta = -1
    const target = this.page + delta
    const from = this.pageOffset
    const to = target - this.page
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 220)
      this.pageOffset = from + (to - from) * EASE_OUT_QUINT(t)
      this.relayout()
      if (t < 1) {
        this.settleRaf = requestAnimationFrame(step)
      } else {
        this.settleRaf = 0
        this.page = target
        this.pageOffset = 0
        this.relayout()
      }
    }
    this.settleRaf = requestAnimationFrame(step)
  }

  // ── per-item menu (onMenuClicked) ─────────────────────────────────────

  private openItemMenu(index: number, anchorBtn: HTMLElement) {
    this.closeItemMenu()
    const items = this.items()
    const item = items[index]
    if (!item) return
    this.itemMenuIndex = index

    const menu = el('div', 're-gal-menu animate-pop-in')
    const spoilerRow = el(
      'button',
      're-gal-menu-row',
      item.spoiler ? 'Disable photo spoiler' : 'Enable photo spoiler',
    ) as HTMLButtonElement
    spoilerRow.type = 'button'
    spoilerRow.innerHTML = `${iconSvg('formatting_spoiler')}<span>${item.spoiler ? 'Disable photo spoiler' : 'Enable photo spoiler'}</span>`
    spoilerRow.onclick = () => {
      const next = this.items()
      if (next[index]) next[index] = { ...next[index], spoiler: !next[index].spoiler }
      this.setItems(next)
      this.closeItemMenu()
    }

    const deleteRow = el('button', 're-gal-menu-row danger') as HTMLButtonElement
    deleteRow.type = 'button'
    deleteRow.innerHTML = `${iconSvg('media_delete')}<span>Delete</span>`
    deleteRow.onclick = () => {
      this.setItems(this.items().filter((_, j) => j !== index))
      this.closeItemMenu()
    }

    menu.append(spoilerRow, deleteRow)

    const hostRect = this.dom.getBoundingClientRect()
    const btnRect = anchorBtn.getBoundingClientRect()
    menu.style.left = `${btnRect.left - hostRect.left}px`
    menu.style.top = `${btnRect.bottom - hostRect.top + 6}px`
    this.dom.append(menu)
    this.itemMenu = menu

    const backdrop = el('div', 're-gal-menu-backdrop')
    backdrop.onclick = () => this.closeItemMenu()
    this.dom.append(backdrop)
    ;(menu as HTMLElement & { _backdrop?: HTMLElement })._backdrop = backdrop
  }

  private closeItemMenu() {
    if (this.itemMenu) {
      const backdrop = (this.itemMenu as HTMLElement & { _backdrop?: HTMLElement })._backdrop
      this.itemMenu.remove()
      backdrop?.remove()
      this.itemMenu = null
      this.itemMenuIndex = -1
    }
  }

  // ── NodeView contract ─────────────────────────────────────────────────

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    const prevMode = this.node.attrs.mode
    const prevItems = JSON.stringify(this.node.attrs.items)
    this.node = node
    const itemsChanged = JSON.stringify(node.attrs.items) !== prevItems
    const modeChanged = node.attrs.mode !== prevMode
    if (itemsChanged || modeChanged) {
      if (modeChanged) {
        // onModeChanged: reset pager, morph between geometries
        this.cancelSettle()
        this.page = 0
        this.pageOffset = 0
        this.stage.classList.add('morphing')
        this.render()
        requestAnimationFrame(() => requestAnimationFrame(() => this.stage.classList.remove('morphing')))
      } else {
        this.render()
      }
    }
    return true
  }

  destroy() {
    this.detached = true
    this.cancelSettle()
    this.ro?.disconnect()
    this.closeItemMenu()
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)

  /** Only the interactive parts belong to the view — the caption must stay
   *  reachable by ProseMirror's caret handling. */
  stopEvent(event: Event): boolean {
    const t = event.target as HTMLElement
    return !!t.closest?.('button, input, .re-gallery-stage, .re-gal-menu, .re-gal-menu-backdrop')
  }
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
    this.contentDOM.addEventListener('mousedown', captionCaretHandler(view, this.contentDOM))
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

  private arrow: HTMLButtonElement
  private node: Node

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.node = node

    this.dom = el('div', 're-details')
    this.contentDOM = el('div', 're-details-body')

    this.arrow = el('button', 're-details-arrow re-stop') as HTMLButtonElement
    this.arrow.type = 'button'
    this.arrow.setAttribute('aria-label', 'Toggle details')

    this.dom.append(this.arrow, this.contentDOM)

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

    this.sync()
  }

  private sync() {
    const open = !!this.node.attrs.open

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
  private checkbox: HTMLButtonElement
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

// ── table host (RichTableCellGrid row/column handles) ───────────────────
//
// Wraps the native <table> with the two 3-dot grab handles from
// RichTableCellGrid: a vertical one in the left gutter (whole-row select)
// and a horizontal one in the bottom gutter (whole-column select). When the
// row/column is fully selected the accent "bulge" pill appears behind the
// dots (drawBulgeFills) and the dots tint (dotOnSelectionColor).

const TH_GUTTER = 26 // px reserved for the handles (HANDLE_PAD_DP ≈ 20 + dots)

class TableView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLTableElement

  private node: Node
  private view: EditorView
  private getPos: GetPos

  private overlay: HTMLElement
  private rowBulge: HTMLElement
  private colBulge: HTMLElement
  private rowDots: HTMLElement
  private colDots: HTMLElement

  private dotRow = -1
  private dotCol = -1
  private offSelection: () => void
  private ro: ResizeObserver | null = null

  constructor(node: Node, view: EditorView, getPos: GetPos) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = el('div', 're-table-host')
    this.contentDOM = document.createElement('table')
    this.applyAttrs()
    this.dom.appendChild(this.contentDOM)

    this.overlay = el('div', 're-table-handles')
    this.rowBulge = el('div', 're-th-bulge row')
    this.colBulge = el('div', 're-th-bulge col')
    this.rowDots = el('div', 're-th-dots row')
    this.rowDots.title = 'Select row'
    this.colDots = el('div', 're-th-dots col')
    this.colDots.title = 'Select column'
    for (let i = 0; i < 3; i++) {
      this.rowDots.append(el('span'))
      this.colDots.append(el('span'))
    }
    this.overlay.append(this.rowBulge, this.colBulge, this.rowDots, this.colDots)
    this.dom.appendChild(this.overlay)

    // The handles own their clicks: never let the editor see them (the
    // table-selection plugin would clear the selection on outside-cell
    // mousedown before the tap toggles).
    const swallow = (handler: () => void) => (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handler()
    }
    this.rowDots.addEventListener('mousedown', swallow(() => this.handleRowTap()))
    this.colDots.addEventListener('mousedown', swallow(() => this.handleColTap()))

    this.offSelection = bus.on('table:selection', () => this.scheduleSync())
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleSync())
      this.ro.observe(this.contentDOM)
    }
    this.dom.addEventListener('focusin', () => this.scheduleSync())
    this.scheduleSync()
  }

  /**
   * Position handles after layout settles. Reading rects synchronously from
   * update() measures the PREVIOUS table geometry (the browser hasn't
   * reflowed yet), which made the dots drift after every table edit.
   */
  private syncRaf = 0
  private scheduleSync(): void {
    if (this.syncRaf) return
    this.syncRaf = requestAnimationFrame(() => {
      this.syncRaf = 0
      this.sync()
    })
  }

  private applyAttrs() {
    const { bordered, striped } = this.node.attrs
    this.contentDOM.className = [
      're-table',
      bordered ? 're-table-bordered' : 're-table-borderless',
      striped ? 're-table-striped' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  /** anchor key "rxc" → cell node doc pos (occupancy walk). */
  private anchorCellPositions(): Map<string, number> | null {
    const pos = this.getPos()
    if (pos === undefined) return null
    const map = new Map<string, number>()
    const occ = new Set<string>()
    let p = pos + 1
    let ri = 0
    this.node.forEach((child) => {
      if (child.type.name !== 'table_row') {
        p += child.nodeSize
        return
      }
      let cellPos = p + 1
      let ci = 0
      child.forEach((cellNode) => {
        while (occ.has(cellKey(ri, ci))) ci++
        map.set(cellKey(ri, ci), cellPos)
        for (let dr = 0; dr < cellNode.attrs.rowspan; dr++) {
          for (let dc = 0; dc < cellNode.attrs.colspan; dc++) {
            occ.add(cellKey(ri + dr, ci + dc))
          }
        }
        cellPos += cellNode.nodeSize
        ci += cellNode.attrs.colspan
      })
      p += child.nodeSize
      ri++
    })
    return map
  }

  /** Selected anchor keys whose cells live inside THIS table. */
  private selectedKeys(): Set<string> | null {
    const state = tableSelectionKey.getState(this.view.state)
    if (!state || state.cells.length === 0) return null
    const tablePos = this.getPos()
    if (tablePos === undefined) return null
    const positions = state.cells
      .map((c) => c.pos)
      .filter((p) => p >= tablePos && p < tablePos + this.node.nodeSize)
    if (positions.length === 0) return null
    const keyToPos = this.anchorCellPositions()
    if (!keyToPos) return null
    const posSet = new Set(positions)
    const keys = new Set<string>()
    for (const [k, p] of keyToPos) {
      if (posSet.has(p)) keys.add(k)
    }
    return keys.size > 0 ? keys : null
  }

  private sync() {
    const keys = this.selectedKeys()
    const grid = tableToGrid(this.node)
    const hostRect = this.dom.getBoundingClientRect()
    const tableRect = this.contentDOM.getBoundingClientRect()

    // active cell: top-left-most selected anchor, else the caret's cell
    let active: { r: number; c: number } | null = null
    if (keys) {
      for (const k of keys) {
        const [r, c] = k.split('x').map(Number)
        if (!active || r < active.r || (r === active.r && c < active.c)) active = { r, c }
      }
    } else {
      const tablePos = this.getPos()
      const { $from } = this.view.state.selection
      if (tablePos !== undefined && $from.pos > tablePos && $from.pos < tablePos + this.node.nodeSize) {
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d)
          if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
            outer: for (let r = 0; r < grid.rows; r++) {
              for (let c = 0; c < grid.cols; c++) {
                const k = grid.anchors[r][c]
                if (k && grid.cells.get(k)?.content === n.firstChild) {
                  active = { r, c }
                  break outer
                }
              }
            }
            break
          }
        }
      }
    }

    const visible = !!keys || !!active
    this.overlay.classList.toggle('on', visible)
    if (!visible || !active) {
      this.rowDots.style.opacity = '0'
      this.colDots.style.opacity = '0'
      this.rowBulge.style.opacity = '0'
      this.colBulge.style.opacity = '0'
      if (!keys) {
        this.dotRow = -1
        this.dotCol = -1
      }
      return
    }

    const rec = grid.cells.get(cellKey(active.r, active.c))

    // row fully selected? (isRowFullySelected)
    let rowFull = false
    if (keys) {
      rowFull = true
      for (let c = 0; c < grid.cols; c++) {
        const k = grid.anchors[active.r][c]
        if (!k || !keys.has(k)) {
          rowFull = false
          break
        }
      }
    }
    let colFull = false
    if (keys) {
      colFull = true
      for (let r = 0; r < grid.rows; r++) {
        const k = grid.anchors[r][active.c]
        if (!k || !keys.has(k)) {
          colFull = false
          break
        }
      }
    }

    // row geometry from the live <tr> elements
    const rows = this.contentDOM.rows
    const tr = rows[Math.min(active.r, rows.length - 1)]
    if (tr) {
      const r = tr.getBoundingClientRect()
      const top = r.top - hostRect.top
      const height = r.height
      this.rowDots.style.opacity = '1'
      this.rowDots.style.top = `${top + height / 2}px`
      this.rowDots.classList.toggle('sel', rowFull)
      this.rowBulge.style.opacity = rowFull ? '1' : '0'
      this.rowBulge.style.top = `${top}px`
      this.rowBulge.style.height = `${height}px`
    }

    // column geometry: fixed layout → equal tracks
    const colCount = grid.cols
    const trackW = tableRect.width / Math.max(1, colCount)
    const span = rec ? rec.colspan : 1
    const colLeft = active.c * trackW
    const colRight = Math.min(active.c + span, colCount) * trackW
    this.colDots.style.opacity = '1'
    this.colDots.style.left = `${(colLeft + colRight) / 2 + (tableRect.left - hostRect.left)}px`
    this.colDots.classList.toggle('sel', colFull)
    this.colBulge.style.opacity = colFull ? '1' : '0'
    this.colBulge.style.left = `${colLeft + (tableRect.left - hostRect.left)}px`
    this.colBulge.style.width = `${colRight - colLeft}px`
  }

  /** handleTableHandleTap — tap again on the same handle to exit. */
  private handleRowTap() {
    const tablePos = this.getPos()
    if (tablePos === undefined) return
    const state = tableSelectionKey.getState(this.view.state)
    const hasSel =
      !!state &&
      state.cells.some((c) => c.pos >= tablePos && c.pos < tablePos + this.node.nodeSize)
    if (hasSel && this.dotRow >= 0) {
      clearTableSelection(this.view)
      this.dotRow = -1
      return
    }
    const grid = tableToGrid(this.node)
    // active row = current dot row if re-tapping selection, else caret row
    let activeRow = -1
    const { $from } = this.view.state.selection
    if ($from.pos > tablePos && $from.pos < tablePos + this.node.nodeSize) {
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d)
        if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
          outer: for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
              const k = grid.anchors[r][c]
              if (k && grid.cells.get(k)?.content === n.firstChild) {
                activeRow = r
                break outer
              }
            }
          }
          break
        }
      }
    }
    if (activeRow < 0 && state && state.cells.length) {
      const keyToPos = this.anchorCellPositions()
      if (keyToPos) {
        for (const [k, p] of keyToPos) {
          if (state.cells.some((c) => c.pos === p)) {
            activeRow = Number(k.split('x')[0])
            break
          }
        }
      }
    }
    if (activeRow < 0) activeRow = 0

    const keyToPos = this.anchorCellPositions()
    if (!keyToPos) return
    const cells: { pos: number }[] = []
    for (let c = 0; c < grid.cols; c++) {
      const k = grid.anchors[activeRow][c]
      const p = k ? keyToPos.get(k) : undefined
      if (p !== undefined && !cells.some((x) => x.pos === p)) cells.push({ pos: p })
    }
    if (!cells.length) return
    this.dotRow = activeRow
    this.view.dispatch(
      this.view.state.tr.setMeta(tableSelectionKey, { cells, multi: true }),
    )
  }

  private handleColTap() {
    const tablePos = this.getPos()
    if (tablePos === undefined) return
    const state = tableSelectionKey.getState(this.view.state)
    const hasSel =
      !!state &&
      state.cells.some((c) => c.pos >= tablePos && c.pos < tablePos + this.node.nodeSize)
    if (hasSel && this.dotCol >= 0) {
      clearTableSelection(this.view)
      this.dotCol = -1
      return
    }
    const grid = tableToGrid(this.node)
    let activeCol = -1
    const { $from } = this.view.state.selection
    if ($from.pos > tablePos && $from.pos < tablePos + this.node.nodeSize) {
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d)
        if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
          outer: for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
              const k = grid.anchors[r][c]
              if (k && grid.cells.get(k)?.content === n.firstChild) {
                activeCol = c
                break outer
              }
            }
          }
          break
        }
      }
    }
    if (activeCol < 0 && state && state.cells.length) {
      const keyToPos = this.anchorCellPositions()
      if (keyToPos) {
        for (const [k, p] of keyToPos) {
          if (state.cells.some((c) => c.pos === p)) {
            activeCol = Number(k.split('x')[1])
            break
          }
        }
      }
    }
    if (activeCol < 0) activeCol = 0

    const keyToPos = this.anchorCellPositions()
    if (!keyToPos) return
    const cells: { pos: number }[] = []
    for (let r = 0; r < grid.rows; r++) {
      const k = grid.anchors[r][activeCol]
      const p = k ? keyToPos.get(k) : undefined
      if (p !== undefined && !cells.some((x) => x.pos === p)) cells.push({ pos: p })
    }
    if (!cells.length) return
    this.dotCol = activeCol
    this.view.dispatch(
      this.view.state.tr.setMeta(tableSelectionKey, { cells, multi: true }),
    )
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.applyAttrs()
    this.scheduleSync()
    return true
  }

  destroy() {
    this.offSelection()
    this.ro?.disconnect()
    if (this.syncRaf) cancelAnimationFrame(this.syncRaf)
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)
  stopEvent(event: Event): boolean {
    const t = event.target as HTMLElement
    return !!t.closest?.('.re-table-handles')
  }
}

// ── registry ────────────────────────────────────────────────────────────

export const nodeViews: Record<string, (node: Node, view: EditorView, getPos: () => number | undefined) => NodeView> = {
  media_figure: (node, view, getPos) => new MediaFigureView(node, view, getPos as GetPos),
  media_group: (node, view, getPos) => new MediaGroupView(node, view, getPos as GetPos),
  table: (node, view, getPos) => new TableView(node, view, getPos as GetPos),
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

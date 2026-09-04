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
import { N, MediaItem, RowButton } from './schema'
import { bus } from './bus'
import { computeGalleryGeometry } from './groupedLayout'
import { ivIconSvg } from '../components/ivIcons'
import { tableToGrid, cellKey } from './tableCommands'
import { tableSelectionKey, clearTableSelection, buildSelection } from './plugins'

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
 * Mousedown → caret inside a media caption.
 *
 * The caption lives in an optional `fig_caption` child, so two things can go
 * wrong: the media node may have no caption node yet (nothing to put a caret
 * in), and PM's posAtCoords cannot map a point inside an empty node view.
 * Create the caption on demand, then place the caret at its start.
 */
function captionCaretHandler(view: EditorView, getPos: GetPos) {
  return (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest?.('button, input')) return
    e.preventDefault()
    e.stopPropagation()
    try {
      const pos = getPos()
      const node = view.state.doc.nodeAt(pos)
      if (!node) return

      let tr = view.state.tr
      const inside = pos + 1
      if (node.childCount === 0) tr = tr.insert(inside, N.fig_caption.create())

      view.focus()
      view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(inside + 1))))
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
    this.contentDOM = el('div', 're-caption-slot')
    this.dom.append(this.frame, this.contentDOM)
    this.contentDOM.addEventListener('mousedown', captionCaretHandler(view, getPos))
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

  /**
   * Custom audio player (Telegram voice-note style): circular play button,
   * seekable progress bar, current/total time. No native controls — the
   * whole bar is ours.
   */
  private buildAudioPlayer(src: string): HTMLElement {
    const wrap = el('div', 're-audio-player re-stop')

    const playBtn = el('button', 're-audio-play') as HTMLButtonElement
    playBtn.type = 'button'
    playBtn.setAttribute('aria-label', 'Play or pause')
    const PLAY_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden><path d="M8 5.14v13.72c0 .94 1.03 1.51 1.83 1.01l10.36-6.86a1.2 1.2 0 0 0 0-2.02L9.83 4.13A1.2 1.2 0 0 0 8 5.14Z"/></svg>'
    const PAUSE_SVG =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/></svg>'
    playBtn.innerHTML = PLAY_SVG

    const title = el('span', 're-audio-title', this.node.attrs.title || 'Audio')
    const time = el('span', 're-audio-time', '…')

    const barWrap = el('div', 're-audio-bar')
    const fill = el('div', 're-audio-fill')
    barWrap.append(fill)

    const audio = document.createElement('audio')
    audio.src = src
    audio.preload = 'metadata'

    const fmt = (s: number) => {
      if (!Number.isFinite(s)) return '…'
      const m = Math.floor(s / 60)
      const ss = Math.floor(s % 60)
      return `${m}:${ss < 10 ? '0' : ''}${ss}`
    }

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && Number.isFinite(audio.duration)) time.textContent = `0:00 / ${fmt(audio.duration)}`
    })
    audio.addEventListener('timeupdate', () => {
      const d = audio.duration
      fill.style.transform = `scaleX(${d && Number.isFinite(d) ? Math.min(1, audio.currentTime / d) : 0})`
      time.textContent = `${fmt(audio.currentTime)} / ${d && Number.isFinite(d) ? fmt(d) : '…'}`
    })
    audio.addEventListener('play', () => {
      playBtn.innerHTML = PAUSE_SVG
      // one playing player at a time across the doc
      document.querySelectorAll('audio').forEach((a) => {
        if (a !== audio) a.pause()
      })
    })
    audio.addEventListener('pause', () => {
      playBtn.innerHTML = PLAY_SVG
    })
    audio.addEventListener('ended', () => {
      audio.currentTime = 0
    })

    playBtn.onclick = (e) => {
      e.stopPropagation()
      if (audio.paused) void audio.play().catch(() => {})
      else audio.pause()
    }
    // click-to-seek
    barWrap.onclick = (e) => {
      e.stopPropagation()
      const r = barWrap.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      if (audio.duration && Number.isFinite(audio.duration)) {
        audio.currentTime = frac * audio.duration
        if (audio.paused) void audio.play().catch(() => {})
      }
    }

    wrap.append(playBtn, barWrap, title, time)
    return wrap
  }

  /** Telegram-style document card: file icon, name, meta line, open action. */
  private buildDocumentCard(src: string): HTMLElement {
    const card = el('div', 're-doc-card re-stop')

    const icon = el('div', 're-doc-icon')
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5Z"/></svg>'

    const name = el('div', 're-doc-name', this.node.attrs.title || decodeURIComponent(src.split('/').pop()?.split('?')[0] || 'Document'))
    const meta = el('div', 're-doc-meta', this.node.attrs.author || new URL(src, location.href).hostname)

    const openBtn = el('button', 're-doc-open re-media-btn') as HTMLButtonElement
    openBtn.type = 'button'
    openBtn.title = 'Open in new tab'
    openBtn.setAttribute('aria-label', 'Open document')
    openBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden><path d="M14 4h6v6M20 4l-9 9M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></svg>'
    openBtn.onclick = (e) => {
      e.stopPropagation()
      window.open(src, '_blank', 'noopener')
    }

    const textCol = el('div', 're-doc-text')
    textCol.append(name, meta)
    card.append(icon, textCol, openBtn)

    // clicking the card opens the source (except on the hover tools)
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.re-media-tools')) return
      window.open(src, '_blank', 'noopener')
    })

    return card
  }

  private render() {
    const { kind, src, spoiler } = this.node.attrs
    this.frame.innerHTML = ''
    this.frame.classList.toggle('spoilered', !!spoiler && kind !== 'document')

    const kindIcon = (k: string) => (k === 'audio' ? '🎵' : k === 'document' ? '📄' : k === 'image' ? '🖼' : '🎬')

    if (!src) {
      const ph = el('button', 're-media-placeholder re-media-btn')
      ph.type = 'button'
      ph.innerHTML = `<span class="re-media-ph-icon">${kindIcon(kind)}</span><span>Add ${kind === 'animation' ? 'animation' : kind}</span>`
      ph.onclick = () => this.pickFile()
      this.frame.append(ph)
    } else if (kind === 'image') {
      const img = document.createElement('img')
      img.src = src
      img.alt = ''
      this.frame.append(img)
    } else if (kind === 'audio') {
      // custom Telegram-style audio player: play button + seek bar + time
      this.frame.append(this.buildAudioPlayer(src))
    } else if (kind === 'document') {
      // Telegram-style file card: icon, name, size/label, open action
      this.frame.append(this.buildDocumentCard(src))
    } else {
      const video = document.createElement('video')
      video.src = src
      video.controls = true
      video.playsInline = true
      video.preload = 'metadata'
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
  /** All tiles live here; the pager moves ONE layer (translate3d) instead
   *  of writing left/top/width/height on every tile every frame — that
   *  layout thrash was the source of the swipe lag. */
  private track: HTMLElement
  private dots: HTMLElement
  private addBtn: HTMLButtonElement
  private switchBtn: HTMLButtonElement
  private itemMenu: HTMLElement | null = null
  private itemMenuIndex = -1

  private tiles: HTMLElement[] = []
  private slideVideos: HTMLVideoElement[] = []

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

  // geometry cache: recompute only when width, mode or media sizes change,
  // never per drag frame
  private geoKey = ''
  private geo: ReturnType<typeof computeGalleryGeometry> | null = null
  private relayoutRaf = 0
  private morphTimer = 0

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
    this.track = el('div', 're-gallery-track')
    this.dots = el('div', 're-gallery-pagerdots')
    this.stage.append(this.track, this.dots)

    this.contentDOM = el('div', 're-caption-slot')

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
    this.contentDOM.addEventListener('mousedown', captionCaretHandler(view, getPos))

    this.stage.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    this.stage.addEventListener('click', () => {
      // empty gallery tap → pick media (handleTap → onMediaPick)
      if (this.items().length === 0) {
        const pos = this.getPos()
        if (pos !== undefined) bus.emit('dialog:media-url', { pos })
      }
    })

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleRelayout())
      this.ro.observe(this.dom)
    }

    this.render()
    requestAnimationFrame(() => this.scheduleRelayout())
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
    this.slideVideos = []
    this.track.innerHTML = ''
    this.stage.dataset.mode = mode
    this.dots.innerHTML = ''
    if (this.morphTimer) {
      clearTimeout(this.morphTimer)
      this.morphTimer = 0
      this.stage.classList.remove('morphing')
    }

    const slideCtrls: HTMLElement[] = []
    items.forEach((item, i) => {
      const tile = el('div', 're-gallery-tile')
      if (item.spoiler) tile.classList.add('spoilered')

      let media: HTMLElement
      if (item.kind === 'image') {
        const img = document.createElement('img')
        img.src = item.src
        img.alt = ''
        img.draggable = false
        img.loading = 'lazy'
        img.decoding = 'async'
        img.addEventListener('load', () => this.invalidateGeometry())
        media = img
      } else if (item.kind === 'audio') {
        const audio = document.createElement('audio')
        audio.src = item.src
        audio.controls = true
        media = audio
      } else {
        const video = document.createElement('video')
        video.src = item.src
        video.playsInline = true
        video.preload = 'metadata'
        video.addEventListener('loadedmetadata', () => this.invalidateGeometry())
        if (item.kind === 'animation') video.loop = true
        if (this.isSlideshow()) {
          // Slides use the custom overlay controller: native controls would
          // swallow the horizontal swipes (pointerdown never reaches the
          // stage over a <video controls>), so they are off here.
          slideCtrls.push(this.buildSlideController(video, i))
          this.slideVideos.push(video)
        } else {
          // Collage tiles are not swipeable — give videos their native UI.
          video.controls = true
        }
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
      // the slide controller was built before append: video had no parent
      // yet, so it must be placed into the tile explicitly here
      const ctrl = slideCtrls.find((c) => c.dataset.for === String(i))
      if (ctrl) tile.append(ctrl)
      this.track.append(tile)
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
    this.invalidateGeometry()
  }

  /**
   * Custom slide controller: play/pause button, progress bar and mute toggle
   * in a small overlay. Native <video controls> would swallow horizontal
   * swipes — pointerdown over it never reaches the stage — so slides use
   * this instead and swiping works everywhere on the slide.
   * Returns the wrapper element; the caller appends it to the tile.
   */
  private buildSlideController(video: HTMLVideoElement, index: number): HTMLElement {
    video.removeAttribute('controls')

    const wrap = el('div', 're-slide-ctrl-wrap re-stop')
    wrap.dataset.for = String(index)
    const ctrl = el('div', 're-slide-ctrl')

    const PLAY_SVG =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden><path d="M8 5.14v13.72c0 .94 1.03 1.51 1.83 1.01l10.36-6.86a1.2 1.2 0 0 0 0-2.02L9.83 4.13A1.2 1.2 0 0 0 8 5.14Z"/></svg>'
    const PAUSE_SVG =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/></svg>'
    const VOL_SVG =
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden><path d="M4 9v6h3.8L13 19.5v-15L7.8 9H4Z"/><path d="M16.2 8.2a5.4 5.4 0 0 1 0 7.6l-1.3-1.3a3.6 3.6 0 0 0 0-5l1.3-1.3Z"/></svg>'
    const MUTED_SVG =
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden><path d="M4 9v6h3.8L13 19.5v-15L7.8 9H4Z"/><path d="m15.5 9.3 1.3-1.3 2 2 2-2L22 9.3l-2 2 2 2-1.2 1.3-2-2-2 2L15.5 13.3l2-2-2-2Z"/></svg>'

    const playBtn = el('button', 're-slide-play') as HTMLButtonElement
    playBtn.type = 'button'
    playBtn.setAttribute('aria-label', 'Play or pause')
    playBtn.innerHTML = PLAY_SVG

    const bar = el('div', 're-slide-bar')
    const fill = el('div', 're-slide-fill')
    bar.append(fill)

    const muteBtn = el('button', 're-slide-mute') as HTMLButtonElement
    muteBtn.type = 'button'
    muteBtn.setAttribute('aria-label', 'Mute or unmute')
    muteBtn.innerHTML = VOL_SVG

    ctrl.append(playBtn, bar, muteBtn)
    wrap.append(ctrl)

    // progress via scaleX transform — no layout, no repaint of the page
    const sync = () => {
      const d = video.duration
      fill.style.transform = `scaleX(${
        d && Number.isFinite(d) ? Math.min(1, video.currentTime / d) : 0
      })`
      playBtn.innerHTML = video.paused ? PLAY_SVG : PAUSE_SVG
      muteBtn.innerHTML = video.muted ? MUTED_SVG : VOL_SVG
    }
    video.addEventListener('timeupdate', sync)
    video.addEventListener('play', sync)
    video.addEventListener('pause', sync)

    playBtn.onclick = (e) => {
      e.stopPropagation()
      if (video.paused) {
        // one playing slide at a time feels right inside a pager
        for (const v of this.slideVideos) if (v !== video) v.pause()
        void video.play().catch(() => {})
      } else video.pause()
      sync()
    }
    muteBtn.onclick = (e) => {
      e.stopPropagation()
      video.muted = !video.muted
      sync()
    }
    return wrap
  }

  /** Pause every playable video in this gallery. */
  private pauseAllVideos() {
    this.track.querySelectorAll('video').forEach((v) => v.pause())
  }

  private invalidateGeometry() {
    this.geoKey = ''
    this.scheduleRelayout()
  }

  /** Coalesce relayout bursts (ResizeObserver + load events) to one per frame. */
  private scheduleRelayout() {
    if (this.detached || this.relayoutRaf) return
    this.relayoutRaf = requestAnimationFrame(() => {
      this.relayoutRaf = 0
      this.relayout()
    })
  }

  /**
   * Current visual rect of tile i (buildItemRects + computeGeometry).
   * Geometry is cached against width/mode/media-ratios; during drags only
   * ONE compositor write happens — translate3d on the track.
   */
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

    // Recompute layout only when something that affects it changed.
    const key = [w, this.node.attrs.mode, ratios.map((r) => r.toFixed(3)).join(',')]
      .join('|')
    let geo = this.geo
    if (!geo || this.geoKey !== key) {
      const maxSide = Math.max(window.innerWidth, window.innerHeight)
      const minSide = Math.min(window.innerWidth, window.innerHeight)
      geo = computeGalleryGeometry(w, ratios.length ? ratios : [1], maxSide, minSide)
      this.geo = geo
      this.geoKey = key
    }

    const slideshow = this.isSlideshow()
    const stageH = items.length === 0
      ? Math.round(Math.min(200, Math.max(window.innerWidth, window.innerHeight) * 0.55))
      : slideshow
        ? geo.slideH
        : geo.collageH
    this.stage.style.height = `${Math.round(stageH)}px`

    if (slideshow) {
      // Slides are laid out once along the track; paging moves the track.
      this.tiles.forEach((tile, i) => {
        tile.style.left = `${i * geo.slideW}px`
        tile.style.top = '0'
        tile.style.width = `${geo.slideW}px`
        tile.style.height = `${geo.slideH}px`
      })
      this.track.style.width = `${items.length * geo.slideW}px`
      this.applyPagerTransform()
    } else {
      this.track.style.width = '100%'
      this.track.style.transform = ''
      this.tiles.forEach((tile, i) => {
        const r = geo.collage[i] ?? { left: 0, top: 0, width: 0, height: 0 }
        tile.style.left = `${Math.round(r.left)}px`
        tile.style.top = `${Math.round(r.top)}px`
        tile.style.width = `${Math.round(r.width)}px`
        tile.style.height = `${Math.round(r.height)}px`
      })
    }

    this.updateDots(geo)
  }

  /** The single compositor write while swiping/settling. */
  private applyPagerTransform() {
    const w = this.geo?.slideW || this.stage.clientWidth || 1
    this.track.style.transform = `translate3d(${(-(this.page + this.pageOffset) * w).toFixed(2)}px, 0, 0)`
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
    const target = e.target as HTMLElement
    // The slide controller's buttons keep their clicks; everything else —
    // including the video surface itself — participates in swiping. Native
    // <video controls> used to swallow this event entirely.
    if (target.closest('.re-slide-ctrl')) return
    this.cancelSettle()
    this.downX = this.lastX = e.clientX
    this.downY = e.clientY
    this.lastT = performance.now()
    this.velocity = 0
    this.dragging = false
    try {
      this.stage.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already gone */
    }
    this.stage.onpointermove = (ev) => this.onPointerMove(ev)
    this.stage.onpointerup = (ev) => this.onPointerUp(ev)
    this.stage.onpointercancel = (ev) => this.onPointerUp(ev)
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
    let off = -ddx / (this.geo?.slideW || this.stage.clientWidth || 1)
    // rubber-band at the edges (0.3× resistance)
    if ((this.page === 0 && off < 0) || (this.page === this.items().length - 1 && off > 0)) {
      off *= 0.3
    }
    this.pageOffset = off
    // compositor-only writes while dragging — no layout, no per-tile work
    this.applyPagerTransform()
    this.updateDots(this.geo ?? undefined)
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
      // compositor-only during the animation too
      this.applyPagerTransform()
      this.updateDots(this.geo ?? undefined)
      if (t < 1) {
        this.settleRaf = requestAnimationFrame(step)
      } else {
        this.settleRaf = 0
        this.page = target
        this.pageOffset = 0
        this.applyPagerTransform()
        this.updateDots(this.geo ?? undefined)
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
        // onModeChanged: reset pager, morph between geometries (320ms)
        this.cancelSettle()
        this.page = 0
        this.pageOffset = 0
        this.stage.classList.add('morphing')
        this.render()
        if (this.morphTimer) clearTimeout(this.morphTimer)
        this.morphTimer = window.setTimeout(() => {
          this.morphTimer = 0
          this.stage.classList.remove('morphing')
        }, 340)
      } else {
        this.render()
      }
    }
    return true
  }

  destroy() {
    this.detached = true
    this.cancelSettle()
    if (this.morphTimer) {
      clearTimeout(this.morphTimer)
      this.morphTimer = 0
    }
    if (this.relayoutRaf) {
      cancelAnimationFrame(this.relayoutRaf)
      this.relayoutRaf = 0
    }
    this.ro?.disconnect()
    this.closeItemMenu()
  }

  ignoreMutation = ignoreMutationFactory(() => this.contentDOM)

  /** Only the interactive parts belong to the view — the caption must stay
   *  reachable by ProseMirror's caret handling. */
  stopEvent(event: Event): boolean {
    const t = event.target as HTMLElement
    return !!t.closest?.(
      'button, input, .re-gallery-stage, .re-slide-ctrl-wrap, .re-gal-menu, .re-gal-menu-backdrop',
    )
  }
}

// ── button row (pageBlockButtonRow / RichButtonRowCell, MAX_BUTTONS=8) ───
//
// Telegram spec (RichMessageLayout.RichButton + ThemeColors):
//   · pill = fully-rounded (radius = height/2), bold label
//   · styles cycle on tap: default → primary → danger → success → default
//   · primary  #229AF0 solid, near-white text
//   · danger   red text #CC5049 on its 14% tint
//   · success  green text #40A920 on its 12% tint
//   · default  transparent: text @ 8% background (dark: white-ish,
//     light: black-ish)

const BUTTON_ROW_MAX = 8

class ButtonRowView implements NodeView {
  dom: HTMLElement
  private node: Node
  private view: EditorView
  private getPos: GetPos
  private pillsHost: HTMLElement
  private fadeLeft: HTMLElement
  private fadeRight: HTMLElement
  private addBtn: HTMLButtonElement
  private btnRo: ResizeObserver | null = null

  constructor(node: Node, view: EditorView, getPos: GetPos) {
    this.node = node
    this.view = view
    this.getPos = getPos

    // The row itself is the horizontal scroller; fades sit inside it as
    // sticky overlays so they track the visible edges while pills slide.
    this.dom = el('div', 're-button-row re-stop')
    this.pillsHost = el('div', 're-button-row-pills')
    this.fadeLeft = el('div', 're-btn-fade left')
    this.fadeRight = el('div', 're-btn-fade right')

    this.dom.addEventListener('scroll', () => this.updateFades(), { passive: true })
    // re-evaluate fades whenever the row or its container resizes — the
    // initial rAF alone races font/layout settling and misses the overflow
    if (typeof ResizeObserver !== 'undefined') {
      this.btnRo = new ResizeObserver(() => {
        requestAnimationFrame(() => this.updateFades())
      })
      this.btnRo.observe(this.dom)
    }

    // "+ button" — RichButtonRowCell's add affordance; hidden at MAX_BUTTONS.
    // Lives INLINE after the last pill (Telegram adds beside the row).
    this.addBtn = el('button', 're-btn-add') as HTMLButtonElement
    this.addBtn.type = 'button'
    this.addBtn.title = 'Add button'
    this.addBtn.setAttribute('aria-label', 'Add button')
    this.addBtn.innerHTML = iconSvg('media_add')
    this.addBtn.onclick = (e) => {
      e.stopPropagation()
      const buttons = this.buttons()
      if (buttons.length >= BUTTON_ROW_MAX) return
      bus.emit('dialog:row-button', { pos: this.getPos(), index: buttons.length })
    }

    this.render()
  }

  /** Show/hide the edge fades from horizontal scroll position. */
  private updateFades(): void {
    const el = this.dom
    const max = el.scrollWidth - el.clientWidth
    const x = el.scrollLeft
    el.classList.toggle('can-left', x > 1 && max > 1)
    el.classList.toggle('can-right', x < max - 1 && max > 1)
  }

  /** Normalize legacy rows that predate type/params bookkeeping. */
  private buttons(): RowButton[] {
    if (!Array.isArray(this.node.attrs.buttons)) return []
    return (this.node.attrs.buttons as Partial<RowButton>[]).map((b) => ({
      text: b.text ?? 'Button',
      style: b.style ?? 'default',
      type: b.type ?? 'url',
      params: b.params ?? {},
    }))
  }

  private setButtons(buttons: RowButton[]) {
    const pos = this.getPos()
    if (pos === undefined) return
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, buttons }),
    )
  }

  /**
   * cycleButtonStyle: default → primary(1) → danger(2) → success(3) →
   * default. `link` is NOT in the cycle — it's a callback_data-only look,
   * set from the editor dialog; tapping a link-styled pill re-enters the
   * cycle at default.
   */
  private static readonly NEXT_STYLE: Record<string, string> = {
    default: 'primary',
    primary: 'danger',
    danger: 'success',
    success: 'default',
    link: 'default',
  }

  private render() {
    const buttons = this.buttons()
    this.pillsHost.innerHTML = ''
    this.pillsHost.append(this.fadeLeft)

    buttons.forEach((b, i) => {
      const isLink = b.style === 'link'
      const pill = el('button', isLink ? 're-btn-inline-link' : `re-btn-pill style-${b.style}`) as HTMLButtonElement
      pill.type = 'button'
      pill.textContent = b.text
      pill.title = isLink
        ? `${b.type} · tap to change · long-press to edit`
        : `${b.type} · tap to cycle color · long-press to edit`
      // tap → cycle style (Telegram behavior); link falls back into the cycle
      pill.onclick = (e) => {
        e.stopPropagation()
        const next = this.buttons()
        if (!next[i]) return
        next[i] = { ...next[i], style: ButtonRowView.NEXT_STYLE[next[i].style] as RowButton['style'] }
        this.setButtons(next)
      }
      // contextmenu / long-press → edit & delete menu
      pill.oncontextmenu = (e) => {
        e.preventDefault()
        e.stopPropagation()
        bus.emit('dialog:row-button', { pos: this.getPos(), index: i })
      }
      this.pillsHost.append(pill)
    })

    // the "+" affordance sits right of the LAST pill, inline in the row
    if (buttons.length < BUTTON_ROW_MAX && buttons.length > 0) {
      this.pillsHost.append(this.addBtn)
    }

    this.pillsHost.append(this.fadeRight)
    this.dom.replaceChildren(this.pillsHost)

    if (buttons.length === 0) {
      // empty state: a single ghost pill invites creating the first button
      const empty = el('button', 're-btn-pill style-default empty') as HTMLButtonElement
      empty.type = 'button'
      empty.textContent = 'Add a button'
      empty.onclick = (e) => {
        e.stopPropagation()
        bus.emit('dialog:row-button', { pos: this.getPos(), index: 0 })
      }
      this.dom.replaceChildren(empty)
    }

    requestAnimationFrame(() => this.updateFades())
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    const prev = JSON.stringify(this.node.attrs.buttons)
    this.node = node
    if (JSON.stringify(node.attrs.buttons) !== prev) this.render()
    else this.node = node
    return true
  }

  destroy(): void {
    this.btnRo?.disconnect()
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
    this.contentDOM = el('div', 're-caption-slot')
    this.dom.append(this.box, this.contentDOM)
    this.contentDOM.addEventListener('mousedown', captionCaretHandler(view, getPos))
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

// ── inline button (small pill atom inside text, like custom emoji) ──────

class InlineButtonView implements NodeView {
  dom: HTMLElement

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: GetPos,
  ) {
    this.dom = document.createElement('span')
    this.dom.contentEditable = 'false'
    this.render()
    // tap → open the editor dialog for this inline button
    this.dom.addEventListener('click', (e) => {
      e.stopPropagation()
      const pos = this.getPos()
      if (pos !== undefined) bus.emit('dialog:inline-button', { pos })
    })
  }

  private render() {
    const { text, style, type } = this.node.attrs
    this.dom.className =
      style === 'link' ? 're-inline-btn link re-stop' : `re-inline-btn style-${style || 'default'} re-stop`
    this.dom.textContent = text || 'Button'
    this.dom.title = `${type} · click to edit`
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
}

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
  /** merged accent ring around the whole selected block (selectedStrokePaint) */
  private selRing: HTMLElement
  private rowBulge: HTMLElement
  private colBulge: HTMLElement
  private rowDots: HTMLElement
  private colDots: HTMLElement
  /** inner horizontal scroller for wide tables */
  private scroller: HTMLElement
  private fadeLeft: HTMLElement
  private fadeRight: HTMLElement

  private dotRow = -1
  private dotCol = -1
  private offSelection: () => void
  private ro: ResizeObserver | null = null

  constructor(node: Node, view: EditorView, getPos: GetPos) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = el('div', 're-table-host')
    // inner scroller: wide tables slide inside it while the handle overlay
    // above stays anchored to the visible area
    this.scroller = el('div', 're-table-scroll')
    this.contentDOM = document.createElement('table')
    this.applyAttrs()
    this.scroller.appendChild(this.contentDOM)
    this.dom.appendChild(this.scroller)
    this.fadeLeft = el('div', 're-tfade left')
    this.fadeRight = el('div', 're-tfade right')
    this.dom.append(this.fadeLeft, this.fadeRight)
    this.scroller.addEventListener('scroll', () => this.updateFades(), { passive: true })

    this.overlay = el('div', 're-table-handles')
    this.selRing = el('div', 're-th-selring')
    this.rowBulge = el('div', 're-th-bulge row')
    this.colBulge = el('div', 're-th-bulge col')
    this.rowDots = el('div', 're-th-dots row')
    this.rowDots.title = 'Select row'
    this.colDots = el('div', 're-th-dots col')
    this.colDots.title = 'Select column'
    for (const handle of [this.rowDots, this.colDots]) {
      const triplet = el('div', 'dot-triplet')
      for (let i = 0; i < 3; i++) triplet.append(el('span'))
      handle.append(triplet)
    }
    this.overlay.append(this.selRing, this.rowBulge, this.colBulge, this.rowDots, this.colDots)
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
      this.ro = new ResizeObserver(() => {
        this.updateFades()
        this.scheduleSync()
      })
      this.ro.observe(this.contentDOM)
      this.ro.observe(this.scroller)
    }
    this.dom.addEventListener('focusin', () => this.scheduleSync())
    this.scheduleSync()
  }

  /** Show/hide the edge fades from horizontal scroll position. */
  private updateFades(): void {
    const el = this.scroller
    const max = el.scrollWidth - el.clientWidth
    const x = el.scrollLeft
    this.dom.classList.toggle('can-left', x > 1 && max > 1)
    this.dom.classList.toggle('can-right', x < max - 1 && max > 1)
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
    const { bordered, compact, striped } = this.node.attrs
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

  /** Host-relative rects of the selected cells, from their live DOM. */
  private cellRectsForKeys(keys: Set<string>): { left: number; top: number; right: number; bottom: number }[] {
    const keyToPos = this.anchorCellPositions()
    if (!keyToPos) return []
    const hostRect = this.dom.getBoundingClientRect()
    const rects: { left: number; top: number; right: number; bottom: number }[] = []
    for (const [k, p] of keyToPos) {
      if (!keys.has(k)) continue
      const dom = this.view.nodeDOM(p)
      if (!(dom instanceof HTMLElement)) continue
      const r = dom.getBoundingClientRect()
      rects.push({
        left: r.left - hostRect.left,
        top: r.top - hostRect.top,
        right: r.right - hostRect.left,
        bottom: r.bottom - hostRect.top,
      })
    }
    return rects
  }

  /**
   * The merged accent outline around the whole selected block
   * (RichTableCellGrid.selectedStrokePaint): one continuous 2px ring with
   * rounded outer corners drawn around the selection's bounding box,
   * instead of per-cell boxes. Row/column/drag selections are rectangular,
   * so this matches Android exactly; scattered Ctrl+click picks get one
   * clean ring around everything.
   */
  private syncSelRing(rects: { left: number; top: number; right: number; bottom: number }[] | null) {
    const el = this.selRing
    el.innerHTML = ''
    if (!rects || rects.length === 0) {
      el.style.opacity = '0'
      return
    }
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const r of rects) {
      left = Math.min(left, r.left)
      top = Math.min(top, r.top)
      right = Math.max(right, r.right)
      bottom = Math.max(bottom, r.bottom)
    }
    const seg = document.createElement('div')
    seg.className = 're-th-selring-seg'
    const R = Math.min(10, (bottom - top) / 2, (right - left) / 2)
    seg.style.cssText =
      `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;` +
      `border-radius:${R}px`
    el.append(seg)
    el.style.opacity = '1'
  }

  private sync() {
    const keys = this.selectedKeys()
    const grid = tableToGrid(this.node)
    const hostRect = this.dom.getBoundingClientRect()
    const tableRect = this.contentDOM.getBoundingClientRect()

    // refresh edge fades (content width may have changed)
    this.updateFades()

    // Mark the HOST (never the contentDOM!) so caret-focus styling can yield
    // to the selection. Writing classes on contentDOM makes PM re-parse it
    // (ignoreMutation reports contentDOM mutations) while applyAttrs()
    // resets className — together they caused an infinite rebuild loop that
    // made the table flicker and vanish.
    this.dom.classList.toggle('has-cell-selection', !!keys && keys.size > 1)
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
    // the merged selection ring shows only for real multi-selections
    this.syncSelRing(keys && keys.size > 1 ? this.cellRectsForKeys(keys) : null)
    if (!visible || !active) {
      this.rowDots.style.opacity = '0'
      this.colDots.style.opacity = '0'
      this.rowBulge.classList.remove('on')
      this.colBulge.classList.remove('on')
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

    // row geometry from the live <tr> elements; overlay origin = host outer
    // edge, so table-relative coords need no extra offset here because the
    // rects are already host-relative via getBoundingClientRect deltas.
    const rows = this.contentDOM.rows
    const tr = rows[Math.min(active.r, rows.length - 1)]
    if (tr) {
      const r = tr.getBoundingClientRect()
      const top = r.top - hostRect.top
      const height = r.height
      this.rowDots.style.opacity = '1'
      this.rowDots.style.top = `${top + height / 2}px`
      this.rowDots.classList.toggle('sel', rowFull)
      // bulge hugs the selected row, extending into the left gutter
      // (RichTableCellGrid: BULGE_DP=16 protruding past the grid edge)
      this.rowBulge.classList.toggle('on', rowFull)
      this.rowBulge.style.top = `${top - 1}px`
      this.rowBulge.style.height = `${height + 2}px`
    }

    // column geometry: fixed layout → equal tracks; bulge extends below the
    // grid into the bottom gutter
    const colCount = grid.cols
    const trackW = tableRect.width / Math.max(1, colCount)
    const span = rec ? rec.colspan : 1
    const colLeft = active.c * trackW
    const colRight = Math.min(active.c + span, colCount) * trackW
    this.colDots.style.opacity = '1'
    this.colDots.style.left = `${(colLeft + colRight) / 2 + (tableRect.left - hostRect.left)}px`
    this.colDots.classList.toggle('sel', colFull)
    this.colBulge.classList.toggle('on', colFull)
    this.colBulge.style.left = `${colLeft + (tableRect.left - hostRect.left) - 1}px`
    this.colBulge.style.width = `${colRight - colLeft + 2}px`
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
    // anchor keys let this selection survive the table rebuilds that menu
    // actions perform (replaceTable → replaceWith); table pos is already
    // resolved at the top of this method
    this.view.dispatch(
      this.view.state.tr.setMeta(tableSelectionKey, {
        ...buildSelection(this.view.state, cells, true, true),
        table: tablePos,
        keys: cells.map((c) => {
          for (const [k, p] of keyToPos) if (p === c.pos) return k
          return '0x0'
        }),
      }),
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
      this.view.state.tr.setMeta(tableSelectionKey, {
        ...buildSelection(this.view.state, cells, true, true),
        table: tablePos,
        keys: cells.map((c) => {
          for (const [k, p] of keyToPos) if (p === c.pos) return k
          return '0x0'
        }),
      }),
    )
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.applyAttrs()
    // When PM recreates the host DOM (e.g. after a caret move that redraws
    // the table while a selection is active), this may be a FRESH instance
    // whose overlay was built before the current selection existed. Sync on
    // the next two frames so the handles/ring land on the new DOM with the
    // live plugin state.
    this.scheduleSync()
    requestAnimationFrame(() => this.scheduleSync())
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
  button_row: (node, view, getPos) => new ButtonRowView(node, view, getPos as GetPos),
  math_block: (node, view, getPos) => new MathBlockView(node, view, getPos as GetPos),
  math_inline: (node, view, getPos) => new MathInlineView(node, view, getPos as GetPos),
  time_inline: (node, view, getPos) => new TimeChipView(node, view, getPos as GetPos),
  anchor: (node, view, getPos) => new AnchorChipView(node, view, getPos as GetPos),
  inline_button: (node, view, getPos) => new InlineButtonView(node, view, getPos as GetPos),
  details: (node, view, getPos) => new DetailsView(node, view, getPos as GetPos),
  blockquote: (node, view, getPos) => new QuoteView(node, view, getPos as GetPos),
  pullquote: (node, view, getPos) => new PullquoteView(node, view, getPos as GetPos),
  task_item: (node, view, getPos) => new TaskItemView(node, view, getPos as GetPos),
}

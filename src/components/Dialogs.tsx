// src/components/Dialogs.tsx
//
// iOS grabber-sheets with grouped forms (Cancel · title · Done header),
// replacing the Android dialogs: link/anchor, date (tg-time), LaTeX with
// live preview, location, table size, merge range and caption.

import { useEffect, useState } from 'react'
import { Command, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import katex from 'katex'
import { N } from '../editor/schema'
import { setLink, removeLink, insertAnchor, insertTime, insertCustomEmoji, collectAnchors } from '../editor/commands'
import { mergeCells, setTableCaption, insertTableCmd, Rect } from '../editor/tableCommands'
import { OrderedListType, setOrderedListAttrs } from '../editor/commands'
import { TIME_FORMATS, formatTime } from '../lib/util'
import { Minus, Plus } from './icons'
import { Iv } from './ivIcons'
import { Sheet } from './Sheet'

// ── sheet shell with Cancel / title / Done header ───────────────────────

interface SheetDialogProps {
  title: string
  onClose: () => void
  onDone: () => void
  doneLabel?: string
  doneDisabled?: boolean
  children: React.ReactNode
}

function SheetDialog({ title, onClose, onDone, doneLabel = 'Done', doneDisabled, children }: SheetDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div className="ios-sheet" role="dialog" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-header">
          <button type="button" className="sheet-action" onClick={onClose}>
            Cancel
          </button>
          <div className="sheet-title">{title}</div>
          <button
            type="button"
            className="sheet-action bold"
            onClick={onDone}
            disabled={doneDisabled}
          >
            {doneLabel}
          </button>
        </div>
        <div className="sheet-scroll">{children}</div>
      </div>
    </>
  )
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-[12.5px] font-medium transition active:scale-95 ${
    active
      ? 'border-ios-blue bg-ios-blue/10 text-ios-blue'
      : 'border-ios-sep bg-white text-ios-secondary'
  }`

// ── custom emoji dialog (Android: custom emoji entity → tg-emoji) ───────

interface EmojiDialogProps {
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  pos: number | null
  initialEmojiId?: string
  initialEmoji?: string
  onClose: () => void
  notify: (t: string) => void
}

export function EmojiDialog({
  viewRef,
  run,
  pos,
  initialEmojiId = '',
  initialEmoji = '',
  onClose,
  notify,
}: EmojiDialogProps) {
  const [emojiId, setEmojiId] = useState(initialEmojiId)
  const [emoji, setEmoji] = useState(initialEmoji)

  const apply = () => {
    const id = emojiId.trim()
    const em = emoji.trim()
    if (!id || !em) return

    const view = viewRef.current
    if (pos !== null && view) {
      const node = view.state.doc.nodeAt(pos)
      if (node) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { emojiId: id, emoji: em }))
        view.focus()
        onClose()
        return
      }
    }

    run(insertCustomEmoji(id, em))
    notify('Custom emoji inserted')
    onClose()
  }

  return (
    <SheetDialog
      title="Custom Emoji"
      onClose={onClose}
      onDone={apply}
      doneLabel={pos !== null ? 'Save' : 'Insert'}
      doneDisabled={!emojiId.trim() || !emoji.trim()}
    >
      <div className="px-2 pb-2">
        <div className="ios-form">
          <div className="form-row">
            <span className="form-label">Emoji ID</span>
            <input
              className="form-input tabular-nums"
              value={emojiId}
              autoFocus
              onChange={(e) => setEmojiId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder="5445241975471103753"
              aria-label="Custom emoji ID"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="form-row">
            <span className="form-label">Emoji</span>
            <input
              className="form-input"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder="🗒"
              aria-label="Fallback emoji"
            />
          </div>
        </div>
        <p className="form-hint">
          Emoji ID is the Telegram document_id of the custom emoji. Exported as
          &lt;tg-emoji emoji-id&gt; with the fallback emoji as its text content.
        </p>
      </div>
    </SheetDialog>
  )
}

//

interface OrderedListDialogProps {
  viewRef: React.MutableRefObject<EditorView | null>
  pos: number
  onClose: () => void
}

export function OrderedListDialog({
  viewRef,
  pos,
  onClose,
}: OrderedListDialogProps) {
  const node = viewRef.current?.state.doc.nodeAt(pos)

  const [type, setType] = useState<OrderedListType>(
    node?.attrs.type ?? '1',
  )

  const [start, setStart] = useState(
    String(node?.attrs.start ?? 1),
  )

  const apply = () => {
    const view = viewRef.current

    if (!view) return

    const value = Math.max(
      1,
      Number.parseInt(start, 10) || 1,
    )

    setOrderedListAttrs(pos, value, type)(
      view.state,
      (tr) => view.dispatch(tr),
    )

    view.focus()
    onClose()
  }

  return (
    <Sheet onClose={onClose} title="Ordered List">
      <div className="sheet-card">
        <div className="px-4 py-3">
          <div className="mb-2 text-[13px] font-semibold text-ios-secondary">
            Type
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {(['1', 'A', 'a', 'I', 'i'] as OrderedListType[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={[
                  'grid h-10 place-items-center rounded-[9px]',
                  'text-[15px] font-semibold transition',
                  type === value
                    ? 'bg-ios-blue text-white'
                    : 'bg-ios-fill text-ios-label',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sheet-card">
        <label className="block px-4 py-3">
          <span className="mb-1.5 block text-[13px] font-semibold text-ios-secondary">
            Start
          </span>

          <input
            type="number"
            min={1}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-[10px] bg-ios-fill px-3 py-2.5 text-[16px] text-ios-label outline-none"
          />
        </label>
      </div>

      <div className="sheet-card">
        <button
          type="button"
          onClick={apply}
          className="w-full px-4 py-3 text-[16px] font-semibold text-ios-blue"
        >
          Done
        </button>
      </div>
    </Sheet>
  )
}

//

interface MediaUrlDialogProps {
  onClose: () => void
  onAdd: (urls: string[]) => void
}

export function MediaUrlDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (media: {
    url: string
    kind: 'image' | 'video' | 'audio'
  }) => void
}) {
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<'image' | 'video' | 'audio' | null>(null)
  const [checked, setChecked] = useState(false)

  const checkUrl = () => {
    const value = url.trim()
    if (!value) return
  
    // Replace this later with real detection.
    const detectedKind: 'image' | 'video' | 'audio' | null = null
  
    setKind(detectedKind)
    setChecked(true)
  }

  const apply = () => {
    const value = url.trim()
  
    if (!value || !checked || !kind) return
  
    onAdd({
      url: value,
      kind,
    })
  
    onClose()
  }

  const onUrlChange = (value: string) => {
    setUrl(value)
    setChecked(false)
    setKind(null)
  }

  return (
    <SheetDialog
      title="Add Media"
      onClose={onClose}
      onDone={apply}
      doneLabel="Add"
      doneDisabled={!checked || !kind}
    >
      <div className="px-2 pb-2">
        <div className="ios-form">
          <div className="form-row flex items-center gap-2">
            <input
              className="form-input left flex-1"
              type="url"
              value={url}
              autoFocus
              placeholder="https://example.com/image.jpg"
              onChange={(e) => onUrlChange(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          
            <button
              type="button"
              disabled={!url.trim()}
              onClick={checkUrl}
              className="
                shrink-0
                rounded-[10px]
                px-3
                py-2
                text-[15px]
                font-semibold
                text-ios-blue
                disabled:opacity-40
              "
            >
              Check
            </button>
          </div>
        </div>

        <p className="form-hint">
          Check the URL before adding media.
        </p>
        {checked && kind === null && (
          <div className="mt-3 px-2">
            <div className="mb-2 text-[13px] font-semibold text-ios-secondary">
              Select media type
            </div>
        
            <div className="grid grid-cols-3 gap-1.5">
              {(['image', 'video', 'audio'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={[
                    'grid h-10 place-items-center rounded-[9px]',
                    'text-[15px] font-semibold transition',
                    kind === value
                      ? 'bg-ios-blue text-white'
                      : 'bg-ios-fill text-ios-label',
                  ].join(' ')}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </SheetDialog>
  )
}

// ── link dialog ─────────────────────────────────────────────────────────

interface LinkDialogProps {
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  initialHref: string | null
  onClose: () => void
  notify: (t: string) => void
}

export function LinkDialog({ viewRef, run, initialHref, onClose, notify }: LinkDialogProps) {
  const [tab, setTab] = useState<'link' | 'anchor'>('link')
  const [href, setHref] = useState(initialHref || 'https://')
  const [name, setName] = useState('')
  const anchors = viewRef.current ? collectAnchors(viewRef.current.state) : []

  const apply = () => {
    if (tab === 'link') {
      const value = href.trim()
      if (!value || value === 'https://') return
      if (viewRef.current?.state.selection.empty) {
        notify('Select some text first')
        return
      }
      run(setLink(value))
      notify('Link applied')
      onClose()
    } else {
      const n = name.trim().replace(/\s+/g, '-')
      if (!n) return
      run(insertAnchor(n))
      notify(`Anchor “${n}” inserted`)
      onClose()
    }
  }

  return (
    <SheetDialog title="Link" onClose={onClose} onDone={apply} doneLabel={tab === 'link' ? 'Apply' : 'Insert'}>
      <div className="px-2 pb-2">
        <div className="ios-seg mx-auto mb-3 flex w-full">
          <button type="button" className={tab === 'link' ? 'on flex-1' : 'flex-1'} onClick={() => setTab('link')}>
            Insert link
          </button>
          <button type="button" className={tab === 'anchor' ? 'on flex-1' : 'flex-1'} onClick={() => setTab('anchor')}>
            Chapter anchor
          </button>
        </div>

        {tab === 'link' ? (
          <>
            <div className="ios-form">
              <div className="form-row">
                <input
                  className="form-input left"
                  value={href}
                  autoFocus
                  onChange={(e) => setHref(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && apply()}
                  placeholder="https://, mailto:, tel:, tg://user?id=…, #anchor"
                  aria-label="Link URL"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
              {['https://', 'mailto:', 'tel:', 'tg://user?id='].map((p) => (
                <button key={p} type="button" className={chip(false)} onClick={() => setHref(p)}>
                  {p}
                </button>
              ))}
              {anchors.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={chip(false)}
                  title="In-document link"
                  onClick={() => setHref(`#${a}`)}
                >
                  #{a}
                </button>
              ))}
            </div>
            {initialHref && (
              <div className="ios-form">
                <button
                  type="button"
                  className="sheet-row justify-center"
                  onClick={() => {
                    run(removeLink)
                    onClose()
                  }}
                >
                  <span className="text-[16px] font-medium text-ios-red">Remove link</span>
                </button>
              </div>
            )}
            <p className="form-hint">Select text in the editor, then Apply.</p>
          </>
        ) : (
          <>
            <div className="ios-form">
              <div className="form-row">
                <input
                  className="form-input left"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && apply()}
                  placeholder="chapter-1"
                  aria-label="Anchor name"
                  autoCapitalize="off"
                />
              </div>
            </div>
            <p className="form-hint">
              Inserts &lt;a name="…"&gt;&lt;/a&gt; at the cursor — link to it anywhere with #name.
            </p>
          </>
        )}
      </div>
    </SheetDialog>
  )
}

// ── date dialog (FormattedDate → tg-time) ───────────────────────────────

interface DateDialogProps {
  run: (cmd: Command) => void
  onClose: () => void
  notify: (t: string) => void
}

function toLocalInputValue(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function DateDialog({ run, onClose, notify }: DateDialogProps) {
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 3600_000)))
  const [code, setCode] = useState('wDT')
  const unix = Math.floor(new Date(when).getTime() / 1000) || 0
  const display = formatTime(unix, code)

  return (
    <SheetDialog
      title="Date & Time"
      onClose={onClose}
      onDone={() => {
        run(insertTime(unix, code, display))
        notify('Date inserted')
        onClose()
      }}
      doneLabel="Insert"
    >
      <div className="px-2 pb-2">
        <div className="ios-form">
          <div className="form-row">
            <input
              type="datetime-local"
              className="form-input left"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label="Date and time"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 px-2 py-2">
          {TIME_FORMATS.map((f) => (
            <button key={f.code} type="button" className={chip(code === f.code)} title={f.example} onClick={() => setCode(f.code)}>
              {f.code}
            </button>
          ))}
        </div>
        <div className="ios-form">
          <div className="form-row">
            <span className="form-label text-ios-secondary">Preview</span>
            <span className="flex-1 text-right text-[16px] font-semibold text-ios-blue">📅 {display}</span>
          </div>
        </div>
      </div>
    </SheetDialog>
  )
}

// ── math dialog (live KaTeX preview) ────────────────────────────────────

interface MathDialogProps {
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  pos: number | null
  inline: boolean
  initialTex: string
  onClose: () => void
  notify: (t: string) => void
}

function insertMathBlockWith(tex: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const { $from } = state.selection
      const after = $from.after(1)
      const node = N.math_block.create({ tex })
      let tr = state.tr.insert(after, node)
      tr = tr.insert(after + node.nodeSize, N.paragraph.create())
      tr = tr.setSelection(TextSelection.create(tr.doc, after + node.nodeSize + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export function MathDialog({ viewRef, run, pos, inline, initialTex, onClose, notify }: MathDialogProps) {
  const [tex, setTex] = useState(initialTex)
  const [previewEl, setPreviewEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!previewEl) return
    try {
      katex.render(tex || '\\;', previewEl, { throwOnError: false, displayMode: !inline })
    } catch {
      previewEl.textContent = tex
    }
  }, [tex, inline, previewEl])

  const apply = () => {
    const view = viewRef.current
    if (pos !== null && view) {
      const node = view.state.doc.nodeAt(pos)
      if (node) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, tex }))
        view.focus()
        onClose()
        return
      }
    }
    if (inline) {
      run((state, dispatch) => {
        if (dispatch) dispatch(state.tr.replaceSelectionWith(N.math_inline.create({ tex })))
        return true
      })
    } else {
      run(insertMathBlockWith(tex))
    }
    notify('Formula inserted')
    onClose()
  }

  return (
    <SheetDialog
      title={inline ? 'Inline Math' : 'Math Block'}
      onClose={onClose}
      onDone={apply}
      doneLabel={pos !== null ? 'Save' : 'Insert'}
      doneDisabled={!tex.trim()}
    >
      <div className="px-2 pb-2">
        <div className="ios-form">
          <div className="form-row">
            <textarea
              className="form-input font-mono text-[14.5px]"
              rows={3}
              value={tex}
              autoFocus
              onChange={(e) => setTex(e.target.value)}
              placeholder="E = mc^2"
              aria-label="LaTeX source"
            />
          </div>
        </div>
        <div
          ref={setPreviewEl}
          className="ios-form grid min-h-[64px] place-items-center overflow-x-auto px-4 py-3"
          aria-label="Formula preview"
        />
        <p className="form-hint">
          Live preview · exported as &lt;tg-math{inline ? '' : '-block'}&gt;
        </p>
      </div>
    </SheetDialog>
  )
}

// ── map dialog ──────────────────────────────────────────────────────────

interface MapDialogProps {
  viewRef: React.MutableRefObject<EditorView | null>
  run: (cmd: Command) => void
  pos: number | null
  initial: { lat: number; long: number; zoom: number }
  onClose: () => void
  notify: (t: string) => void
}

function insertMapWith(lat: number, long: number, zoom: number): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const { $from } = state.selection
      const after = $from.after(1)
      const node = N.map_block.create({ lat, long, zoom })
      let tr = state.tr.insert(after, node)
      tr = tr.insert(after + node.nodeSize, N.paragraph.create())
      tr = tr.setSelection(TextSelection.create(tr.doc, after + node.nodeSize + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export function MapDialog({ viewRef, run, pos, initial, onClose, notify }: MapDialogProps) {
  const [lat, setLat] = useState(String(initial.lat))
  const [long, setLong] = useState(String(initial.long))
  const [zoom, setZoom] = useState(String(initial.zoom))

  const geolocate = () => {
    if (!navigator.geolocation) {
      notify('Geolocation is not available in this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(5))
        setLong(p.coords.longitude.toFixed(5))
        notify('Location captured')
      },
      () => notify('Could not get location'),
    )
  }

  const apply = () => {
    const la = Number(lat)
    const lo = Number(long)
    const z = Math.max(1, Math.min(20, Number(zoom) || 15))
    if (Number.isNaN(la) || Number.isNaN(lo)) return
    const view = viewRef.current
    if (pos !== null && view) {
      const node = view.state.doc.nodeAt(pos)
      if (node) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { lat: la, long: lo, zoom: z }))
        view.focus()
        onClose()
        return
      }
    }
    run(insertMapWith(la, lo, z))
    notify('Map inserted')
    onClose()
  }

  return (
    <SheetDialog title="Location" onClose={onClose} onDone={apply} doneLabel={pos !== null ? 'Save' : 'Insert'}>
      <div className="px-2 pb-2">
        <div className="ios-form">
          <div className="form-row">
            <span className="form-label">Latitude</span>
            <input className="form-input tabular-nums" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          </div>
          <div className="form-row">
            <span className="form-label">Longitude</span>
            <input className="form-input tabular-nums" value={long} onChange={(e) => setLong(e.target.value)} inputMode="decimal" />
          </div>
          <div className="form-row gap-3">
            <span className="form-label">Zoom</span>
            <input
              type="range"
              min={1}
              max={20}
              value={Number(zoom) || 15}
              onChange={(e) => setZoom(e.target.value)}
              className="flex-1"
              style={{ accentColor: '#007AFF' }}
            />
            <span className="w-7 text-right text-[16px] font-semibold tabular-nums text-ios-blue">{zoom}</span>
          </div>
        </div>
        <div className="ios-form">
          <button type="button" className="sheet-row" onClick={geolocate}>
            <span className="row-icon" style={{ background: '#34C759' }}>
              <Iv name="location" size={17} />
            </span>
            <span className="row-label text-ios-blue">Use My Location</span>
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}

// ── table size dialog ───────────────────────────────────────────────────

interface TableSizeDialogProps {
  run: (cmd: Command) => void
  onClose: () => void
}

export function TableSizeDialog({ run, onClose }: TableSizeDialogProps) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  const stepper = (value: number, set: (n: number) => void, min: number, max: number, label: string) => (
    <div className="form-row">
      <span className="form-label">{label}</span>
      <div className="flex flex-1 items-center justify-end gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-ios-blue text-ios-blue transition active:scale-90 disabled:opacity-30"
          disabled={value <= min}
          onClick={() => set(Math.max(min, value - 1))}
        >
          <Minus size={14} />
        </button>
        <span className="w-6 text-center text-[17px] font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-ios-blue text-ios-blue transition active:scale-90 disabled:opacity-30"
          disabled={value >= max}
          onClick={() => set(Math.min(max, value + 1))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )

  return (
    <SheetDialog
      title="Insert Table"
      onClose={onClose}
      onDone={() => {
        run(insertTableCmd(rows, cols))
        onClose()
      }}
      doneLabel={`Insert ${rows}×${cols}`}
    >
      <div className="px-2 pb-2">
        <div className="ios-form">
          {stepper(rows, setRows, 1, 20, 'Rows')}
          {stepper(cols, setCols, 1, 10, 'Columns')}
        </div>
        <p className="form-hint">The first row becomes a header row.</p>
      </div>
    </SheetDialog>
  )
}

// ── merge range dialog ──────────────────────────────────────────────────

interface MergeDialogProps {
  viewRef: React.MutableRefObject<EditorView | null>
  onClose: () => void
  notify: (t: string) => void
}

export function MergeDialog({ viewRef, onClose, notify }: MergeDialogProps) {
  const [r1, setR1] = useState(1)
  const [c1, setC1] = useState(1)
  const [r2, setR2] = useState(2)
  const [c2, setC2] = useState(2)

  const apply = () => {
    const view = viewRef.current
    if (!view) return
    const rect: Rect = { r1: r1 - 1, c1: c1 - 1, r2: r2 - 1, c2: c2 - 1 }
    if (rect.r2 < rect.r1 || rect.c2 < rect.c1) {
      notify('Invalid range')
      return
    }
    let applied = false
    mergeCells(rect)(view.state, (tr) => {
      view.dispatch(tr)
      applied = true
    })
    if (applied) {
      notify('Cells merged')
      view.focus()
    } else {
      notify('Range must be a clean rectangle of whole cells')
    }
    onClose()
  }

  const num = (v: number, set: (n: number) => void, label: string) => (
    <div className="form-row">
      <span className="form-label">{label}</span>
      <input
        type="number"
        min={1}
        className="form-input tabular-nums"
        value={v}
        onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))}
      />
    </div>
  )

  return (
    <SheetDialog title="Merge Cells" onClose={onClose} onDone={apply} doneLabel="Merge">
      <div className="px-2 pb-2">
        <div className="ios-form">
          {num(r1, setR1, 'First row')}
          {num(c1, setC1, 'First column')}
          {num(r2, setR2, 'Last row')}
          {num(c2, setC2, 'Last column')}
        </div>
        <p className="form-hint">
          1-based coordinates. The range must be exactly covered by whole cells; their texts are
          joined into the top-left cell.
        </p>
      </div>
    </SheetDialog>
  )
}

// ── caption dialog ──────────────────────────────────────────────────────

interface CaptionDialogProps {
  run: (cmd: Command) => void
  onClose: () => void
  notify: (t: string) => void
}

export function CaptionDialog({ run, onClose, notify }: CaptionDialogProps) {
  const [text, setText] = useState('')
  return (
    <SheetDialog
      title="Table Caption"
      onClose={onClose}
      onDone={() => {
        run(setTableCaption(text))
        notify(text.trim() ? 'Caption set' : 'Caption removed')
        onClose()
      }}
      doneLabel="Save"
    >
      <div className="px-2 pb-2">
        <div className="ios-form">
          <div className="form-row">
            <input
              className="form-input left"
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              placeholder="Leave empty to remove"
              aria-label="Table caption"
            />
          </div>
        </div>
      </div>
    </SheetDialog>
  )
}

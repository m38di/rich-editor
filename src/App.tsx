// src/App.tsx — the shell: app bar, desktop ribbon, the paper document
// canvas, the mobile dock, and every sheet/dialog/overlay on top.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { undo, redo } from 'prosemirror-history'
import { TextSelection } from 'prosemirror-state'
import { useEditorBridge } from './hooks/useEditorBridge'
import { useKeyboardViewport } from './hooks/useKeyboardViewport.ts'
import { useTheme } from './hooks/useTheme'
import { TopBar } from './components/TopBar'
import { Ribbon } from './components/Ribbon'
import { BottomPanel, MenuId, labelFor } from './components/BottomPanel'
import { SelectionBar } from './components/SelectionBar'
import {
  TextTypeMenu,
  ListMenu,
  TableMenu,
  MathMenu,
  AttachSheet,
  EmojiPanel,
  SlashMenu,
} from './components/Menus'
import {
  LinkDialog,
  DateDialog,
  MathDialog,
  MapDialog,
  MediaUrlDialog,
  TableSizeDialog,
  CaptionDialog,
  OrderedListDialog,
  RowButtonDialog,
  InlineButtonDialog,
} from './components/Dialogs'
import { TableCellMenu } from './components/TableCellMenu'
import { PreviewSheet } from './components/PreviewSheet'
import { bus } from './editor/bus'
import { serializeRichHtml } from './editor/serializer'
import { buildStandaloneHtml, docTitle } from './editor/exportHtml'
import { htmlToDoc, docHasContent } from './editor/importHtml'
import { SlashDef } from './lib/util'
import {
  setTextType,
  wrapBullet,
  wrapOrdered,
  wrapTask,
  insertDetails,
  insertDivider,
  insertGallery,
  insertMedia,
  insertMap,
} from './editor/commands'
import { insertTableCmd } from './editor/tableCommands'

type DialogState =
  | { type: 'link' }
  | { type: 'date' }
  | { type: 'math'; pos: number | null; inline: boolean; tex: string }
  | { type: 'map'; pos: number | null; lat: number; long: number; zoom: number }
  | { type: 'media-url'; pos: number }
  | { type: 'ordered-list'; pos: number }
  | { type: 'table' }
  | { type: 'caption' }
  | { type: 'row-button'; pos: number; index: number }
  | { type: 'inline-button'; pos: number | null; initialText?: string }
  | null

interface PreviewState {
  title: string
  fragment: string
  standalone: string
}

const DOCK_HEIGHT = 74

export default function App() {
  const [dialog, setDialog] = useState<DialogState>(null)
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [toastLeaving, setToastLeaving] = useState(false)
  const [slashMuted, setSlashMuted] = useState(false)
  const [cellMenu, setCellMenu] = useState<number[] | null>(null)
  const { keyboardHeight } = useKeyboardViewport()
  const { choice: themeChoice, cycle: cycleTheme } = useTheme()
  const toastTimer = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const notify = useCallback((text: string) => {
    setToast(text)
    setToastLeaving(false)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    // start the exit animation slightly before unmount
    toastTimer.current = window.setTimeout(() => setToastLeaving(true), 2200)
  }, [])
  const clearToast = useCallback(() => setToast(null), [])

  const onOpenLink = useCallback(() => setDialog({ type: 'link' }), [])
  const { mountRef, viewRef, selection, slash, run } = useEditorBridge(onOpenLink)

  // unmute the slash popup whenever the query changes again
  useEffect(() => {
    setSlashMuted(false)
  }, [slash.query, slash.active])

  // node views → dialogs (map / math) + toasts
  useEffect(() => {
    const offMap = bus.on('dialog:map', ({ pos }) => {
      const node = viewRef.current?.state.doc.nodeAt(pos)
      setDialog({
        type: 'map',
        pos,
        lat: node?.attrs.lat ?? 41.9,
        long: node?.attrs.long ?? 12.5,
        zoom: node?.attrs.zoom ?? 15,
      })
    })
    const offMath = bus.on('dialog:math', ({ pos, inline }) => {
      const node = viewRef.current?.state.doc.nodeAt(pos)
      setDialog({ type: 'math', pos, inline, tex: node?.attrs.tex ?? '' })
    })
    const offMediaUrl = bus.on('dialog:media-url', ({ pos }) => {
      setDialog({ type: 'media-url', pos })
    })
    const offToast = bus.on('toast', ({ text }) => notify(text))
    const offCellMenu = bus.on('table:menu', (cells) => setCellMenu(cells))
    const offOrderedList = bus.on('dialog:ordered-list', ({ pos }) => {
      const node = viewRef.current?.state.doc.nodeAt(pos)
      if (!node || node.type.name !== 'ordered_list') return
      setDialog({ type: 'ordered-list', pos })
    })
    const offRowButton = bus.on('dialog:row-button', ({ pos, index }) => {
      setDialog({ type: 'row-button', pos, index })
    })
    const offInlineButton = bus.on('dialog:inline-button', ({ pos }) => {
      setDialog({ type: 'inline-button', pos })
    })
    return () => {
      offMap()
      offMath()
      offMediaUrl()
      offOrderedList()
      offRowButton()
      offInlineButton()
      offToast()
      offCellMenu()
    }
  }, [viewRef, notify])

  const toggleMenu = useCallback((id: MenuId) => {
    setOpenMenu((cur) => (cur === id ? null : id))
  }, [])

  // ── slash command dispatch (mirrors RichCommand actions) ──────────────
  const onSlashPick = useCallback(
    (def: SlashDef) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.tr.delete(slash.from, slash.to))
      switch (def.id) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          run(setTextType('heading', Number(def.id[1])))
          break
        case 'quote': run(setTextType('quote')); break
        case 'pullquote': run(setTextType('pullquote')); break
        case 'code': run(setTextType('code')); break
        case 'footer': run(setTextType('footer')); break
        case 'list': run(wrapBullet); break
        case 'ordered': run(wrapOrdered); break
        case 'todo': run(wrapTask); break
        case 'toggle': run(insertDetails); break
        case 'divider': run(insertDivider); break
        case 'image': run(insertGallery('collage')); break
        case 'video': run(insertGallery('collage')); break
        case 'audio': run(insertMedia('audio')); break
        case 'map': run(insertMap); break
        case 'table': setDialog({ type: 'table' }); break
        case 'math': setDialog({ type: 'math', pos: null, inline: false, tex: '' }); break
      }
    },
    [slash, run, viewRef],
  )

  // ── Generate → Preview → Download ──────────────────────────────────────
  const onGenerate = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const doc = view.state.doc
    const fragment = serializeRichHtml(doc)
    const title = docTitle(doc)
    setPreview({ title, fragment, standalone: buildStandaloneHtml(title, fragment) })
    setOpenMenu(null)
  }, [viewRef])

  // ── Import .html → editor doc ──────────────────────────────────────────
  // Replaces the current document in ONE undoable step (Ctrl+Z restores
  // the previous article), so no confirmation dialog is needed.
  const onImportFile = useCallback(
    async (file: File) => {
      const view = viewRef.current
      if (!view) return
      try {
        const html = await file.text()
        const doc = htmlToDoc(html)
        if (!docHasContent(doc)) {
          notify(`No importable content in “${file.name}”`)
          return
        }
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)
        tr.setSelection(TextSelection.near(tr.doc.resolve(1)))
        tr.scrollIntoView()
        view.dispatch(tr)
        view.focus()
        notify(`Imported ${file.name}`)
      } catch (err) {
        console.error('HTML import failed', err)
        notify('Import failed — could not parse that file')
      }
    },
    [viewRef, notify],
  )

  const closeMenu = useCallback(() => setOpenMenu(null), [])
  const showFormatting = !selection.empty && !openMenu && !dialog && !preview

  // the editor view only exists after the first commit, so the stats below
  // need one extra pass before they can read the document
  const [viewReady, setViewReady] = useState(false)
  useEffect(() => setViewReady(true), [])

  // Whole-document scans (title, word/char counts) run at most twice a
  // second — recomputing them on every keystroke made typing feel laggy.
  const [statsTick, setStatsTick] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setStatsTick((n) => n + 1), 500)
    return () => window.clearTimeout(t)
  }, [selection, viewReady])

  const docHeading = useMemo(() => {
    void statsTick
    const view = viewRef.current
    return view ? docTitle(view.state.doc) : 'Untitled article'
  }, [viewRef, selection, statsTick, viewReady])

  const words = useMemo(() => {
    void statsTick
    const view = viewRef.current
    if (!view) return 0
    const text = view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' ')
    const matched = text.trim().match(/\S+/g)
    return matched ? matched.length : 0
  }, [viewRef, selection, statsTick, viewReady])

  const chars = useMemo(() => {
    void statsTick
    const view = viewRef.current
    if (!view) return selection.chars
    return view.state.doc.textBetween(0, view.state.doc.content.size, '', '').length
  }, [viewRef, selection, statsTick, viewReady])

  return (
    <div className="app-shell">
      <TopBar
        title={docHeading}
        canUndo={selection.canUndo}
        canRedo={selection.canRedo}
        chars={chars}
        words={words}
        theme={themeChoice}
        onCycleTheme={cycleTheme}
        onUndo={() => run(undo)}
        onRedo={() => run(redo)}
        onImport={() => fileInputRef.current?.click()}
        onGenerate={onGenerate}
      />

      {/* Import file picker — value reset after each pick so selecting the
          same file twice still fires onChange */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onImportFile(file)
          e.target.value = ''
        }}
      />

      <div className="hidden md:block">
        <Ribbon
          info={selection}
          run={run}
          openMenu={openMenu}
          onToggleMenu={toggleMenu}
          onOpenLink={onOpenLink}
          onInsertTable={() => run(insertTableCmd(2, 2))}
          blockLabel={labelFor(selection)}
        />
      </div>

      <main className="main-scroll relative">
        <div className="paper">
          <div ref={mountRef} />
        </div>

        <p className="doc-hint">
          <span>
            Select text to format · type <kbd className="kbd">/</kbd> for commands
          </span>
          <span className="hidden sm:inline">
            <kbd className="kbd">#</kbd> heading · <kbd className="kbd">-</kbd> list ·{' '}
            <kbd className="kbd">[]</kbd> checklist · <kbd className="kbd">|</kbd> quote
          </span>
        </p>

        <SlashMenu
          slash={slashMuted ? { ...slash, active: false } : slash}
          viewRef={viewRef}
          onPick={onSlashPick}
          onDismiss={() => setSlashMuted(true)}
        />
      </main>

      {/* selection formatting — REPLACES the dock on phones, exactly like
          RichEditor's BOTTOM_PANEL_TOOLBAR ⇄ BOTTOM_PANEL_FORMATTING swap */}
      {showFormatting && (
        <SelectionBar
          info={selection}
          viewRef={viewRef}
          run={run}
          onOpenLink={onOpenLink}
          onOpenDate={() => setDialog({ type: 'date' })}
          onOpenMath={() => setDialog({ type: 'math', pos: null, inline: true, tex: '' })}
          onOpenInlineButtons={() => {
            // default the label to the current selection, if any
            const view = viewRef.current
            const sel = window.getSelection()
            const selected = view && !view.state.selection.empty
              ? view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, ' ')
              : (sel?.toString() ?? '')
            setDialog({ type: 'inline-button', pos: null, initialText: selected.trim() })
          }}
          dockBottom={keyboardHeight}
          bottomInset={DOCK_HEIGHT + keyboardHeight}
        />
      )}

      <BottomPanel
        className={showFormatting ? 'hidden' : ''}
        info={selection}
        openMenu={openMenu}
        onToggleMenu={toggleMenu}
        onGenerate={onGenerate}
        onInsertTable={() => run(insertTableCmd(2, 2))}
        keyboardHeight={keyboardHeight}
      />

      {/* sheets */}
      {openMenu === 'text' && <TextTypeMenu info={selection} run={run} close={closeMenu} />}
      {openMenu === 'list' && <ListMenu info={selection} run={run} close={closeMenu} />}
      {openMenu === 'table' && (
        <TableMenu
          viewRef={viewRef}
          run={run}
          close={closeMenu}
          onOpenCaption={() => setDialog({ type: 'caption' })}
          notify={notify}
        />
      )}
      {openMenu === 'math' && (
        <MathMenu
          run={run}
          close={closeMenu}
          onOpenInlineMath={() => setDialog({ type: 'math', pos: null, inline: true, tex: '' })}
          notify={notify}
        />
      )}
      {openMenu === 'attach' && (
        <AttachSheet
          run={run}
          close={closeMenu}
          onOpenTableSize={() => setDialog({ type: 'table' })}
        />
      )}
      {openMenu === 'emoji' && <EmojiPanel viewRef={viewRef} close={closeMenu} />}

      {/* dialogs */}
      {dialog?.type === 'link' && (
        <LinkDialog
          viewRef={viewRef}
          run={run}
          initialHref={selection.linkHref}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {dialog?.type === 'date' && (
        <DateDialog run={run} onClose={() => setDialog(null)} notify={notify} />
      )}
      {dialog?.type === 'math' && (
        <MathDialog
          viewRef={viewRef}
          run={run}
          pos={dialog.pos}
          inline={dialog.inline}
          initialTex={dialog.tex}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {dialog?.type === 'map' && (
        <MapDialog
          viewRef={viewRef}
          run={run}
          pos={dialog.pos}
          initial={{ lat: dialog.lat, long: dialog.long, zoom: dialog.zoom }}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {dialog?.type === 'media-url' && (
        <MediaUrlDialog
          onClose={() => setDialog(null)}
          onAdd={({ url, kind }) => {
            const view = viewRef.current
            if (!view) return

            const node = view.state.doc.nodeAt(dialog.pos)
            if (!node) return

            if (node.type.name === 'media_figure') {
              view.dispatch(
                view.state.tr.setNodeMarkup(dialog.pos, undefined, {
                  ...node.attrs,
                  src: url,
                  kind,
                }),
              )
              return
            }

            if (node.type.name !== 'media_group') return

            const items = Array.isArray(node.attrs.items) ? [...node.attrs.items] : []
            if (items.length >= 50) {
              notify('Maximum 50 media items')
              return
            }
            items.push({ kind, src: url, spoiler: false })
            view.dispatch(
              view.state.tr.setNodeMarkup(dialog.pos, undefined, { ...node.attrs, items }),
            )
          }}
        />
      )}
      {dialog?.type === 'ordered-list' && (
        <OrderedListDialog viewRef={viewRef} pos={dialog.pos} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'table' && (
        <TableSizeDialog run={run} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'caption' && (
        <CaptionDialog run={run} onClose={() => setDialog(null)} notify={notify} />
      )}
      {dialog?.type === 'row-button' && (
        <RowButtonDialog
          viewRef={viewRef}
          pos={dialog.pos}
          index={dialog.index}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
      {dialog?.type === 'inline-button' && (
        <InlineButtonDialog
          viewRef={viewRef}
          pos={dialog.pos}
          initialText={dialog.initialText ?? ''}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}

      {/* table cell-selection context menu (auto + right-click) */}
      {cellMenu && cellMenu.length > 0 && (
        <TableCellMenu viewRef={viewRef} cellPos={cellMenu} onClose={() => setCellMenu(null)} />
      )}

      {/* generate → preview → download */}
      {preview && (
        <PreviewSheet
          title={preview.title}
          fragment={preview.fragment}
          standalone={preview.standalone}
          onClose={() => setPreview(null)}
          notify={notify}
        />
      )}

      {toast && (
        <div
          className={`toast${toastLeaving ? ' leaving' : ''}`}
          role="status"
          onAnimationEnd={(e) => {
            if (e.animationName === 'toast-out') clearToast()
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

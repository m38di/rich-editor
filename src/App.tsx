// src/App.tsx — the Telegram iOS shell: vibrancy nav bar, scrolling white
// page, compose bar with the blue send (Generate) button, iOS sheets for
// every menu/dialog, and the full-screen Preview sheet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { undo, redo } from 'prosemirror-history'
import { useEditorBridge } from './hooks/useEditorBridge'
import { TopBar } from './components/TopBar'
import { BottomPanel, MenuId } from './components/BottomPanel'
import { FormattingPanel } from './components/FormattingPanel'
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
  MergeDialog,
  CaptionDialog,
} from './components/Dialogs'
import { PreviewSheet } from './components/PreviewSheet'
import { bus } from './editor/bus'
import { serializeRichHtml } from './editor/serializer'
import { buildStandaloneHtml, docTitle } from './editor/exportHtml'
import { SlashDef } from './lib/util'
import {
  setTextType,
  wrapBullet,
  wrapOrdered,
  wrapTask,
  insertDetails,
  insertDivider,
  insertMedia,
  insertMap,
} from './editor/commands'

type DialogState =
  | { type: 'link' }
  | { type: 'date' }
  | { type: 'math'; pos: number | null; inline: boolean; tex: string }
  | { type: 'map'; pos: number | null; lat: number; long: number; zoom: number }
  | { type: 'media-url'; pos: number }
  | { type: 'table' }
  | { type: 'merge' }
  | { type: 'caption' }
  | null

interface PreviewState {
  title: string
  fragment: string
  standalone: string
}

export default function App() {
  const [dialog, setDialog] = useState<DialogState>(null)
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [slashMuted, setSlashMuted] = useState(false)
  const toastTimer = useRef<number | null>(null)

  const notify = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

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
      setDialog({
        type: 'media-url',
        pos,
      })
    })
    const offToast = bus.on('toast', ({ text }) => notify(text))
    return () => {
      offMap()
      offMath()
      offMediaUrl()
      offToast()
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
        case 'image': run(insertMedia('image')); break
        case 'video': run(insertMedia('video')); break
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

  const closeMenu = useCallback(() => setOpenMenu(null), [])
  const showFormatting = !selection.empty && !openMenu && !dialog && !preview

  return (
    <div className="app-shell">
      <TopBar
        canUndo={selection.canUndo}
        canRedo={selection.canRedo}
        chars={selection.chars}
        onUndo={() => run(undo)}
        onRedo={() => run(redo)}
      />

      {/* scrolling page beneath the vibrancy bars */}
      <main className="main-scroll relative">
        <div ref={mountRef} />
        <p className="mx-auto max-w-[720px] px-5 pb-4 text-center text-[11.5px] font-medium text-ios-tertiary">
          Telegram-style rich article · select text to format · type / for commands
        </p>

        <SlashMenu
          slash={slashMuted ? { ...slash, active: false } : slash}
          viewRef={viewRef}
          onPick={onSlashPick}
          onDismiss={() => setSlashMuted(true)}
        />
      </main>

      {/* compose bar + floating format strip */}
      <BottomPanel info={selection} openMenu={openMenu} onToggleMenu={toggleMenu} onGenerate={onGenerate}>
        {showFormatting && (
          <FormattingPanel
            info={selection}
            run={run}
            onOpenLink={onOpenLink}
            onOpenDate={() => setDialog({ type: 'date' })}
            onOpenMath={() => setDialog({ type: 'math', pos: null, inline: true, tex: '' })}
          />
        )}
      </BottomPanel>

      {/* iOS sheets (each carries its own dimmed backdrop) */}
      {openMenu === 'text' && <TextTypeMenu info={selection} run={run} close={closeMenu} />}
      {openMenu === 'list' && <ListMenu info={selection} run={run} close={closeMenu} />}
      {openMenu === 'table' && (
        <TableMenu
          viewRef={viewRef}
          run={run}
          close={closeMenu}
          onOpenMerge={() => setDialog({ type: 'merge' })}
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
        <AttachSheet run={run} close={closeMenu} onOpenTableSize={() => setDialog({ type: 'table' })} />
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
      {dialog?.type === 'date' && <DateDialog run={run} onClose={() => setDialog(null)} notify={notify} />}
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
      {dialog?.type === 'table' && <TableSizeDialog run={run} onClose={() => setDialog(null)} />}
      {dialog?.type === 'merge' && (
        <MergeDialog viewRef={viewRef} onClose={() => setDialog(null)} notify={notify} />
      )}
      {dialog?.type === 'caption' && (
        <CaptionDialog run={run} onClose={() => setDialog(null)} notify={notify} />
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

      {/* iOS notification banner */}
      {toast && (
        <div className="ios-banner" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

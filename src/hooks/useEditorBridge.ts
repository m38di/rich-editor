// src/hooks/useEditorBridge.ts
//
// Bridges the ProseMirror view (plain TS, owns the document) with React
// (owns the chrome). Mirrors the Android wiring where RichEditText.Listener
// events flow up through the list view into RichEditor.Delegate callbacks.

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView } from 'prosemirror-view'
import { Command } from 'prosemirror-state'
import { createEditor } from '../editor/createEditor'
import { SelectionInfo, SlashState } from '../editor/plugins'

const DEFAULT_INFO: SelectionInfo = {
  empty: true,
  marks: {},
  block: {
    type: 'paragraph',
    level: 0,
    inQuote: false,
    inList: 'none',
    inDetails: false,
    checked: false,
    language: '',
  },
  canUndo: false,
  canRedo: false,
  chars: 0,
  linkHref: null,
  inTable: false,
}

const DEFAULT_SLASH: SlashState = { active: false, from: 0, to: 0, query: '' }

export function useEditorBridge(onOpenLink: () => void) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const linkCb = useRef(onOpenLink)
  linkCb.current = onOpenLink

  const [selection, setSelection] = useState<SelectionInfo>(DEFAULT_INFO)
  const [slash, setSlash] = useState<SlashState>(DEFAULT_SLASH)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const view = createEditor(mount, {
      onSlash: setSlash,
      onSelection: setSelection,
      onOpenLink: () => linkCb.current(),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  /** Run a ProseMirror command against the live view and refocus. */
  const run = useCallback((cmd: Command) => {
    const view = viewRef.current
    if (!view) return
    cmd(view.state, (tr) => view.dispatch(tr))
    view.focus()
  }, [])

  return { mountRef, viewRef, selection, slash, run }
}

export type EditorBridge = ReturnType<typeof useEditorBridge>

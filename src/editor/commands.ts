// src/editor/commands.ts
//
// Editor commands — the web counterpart of the dispatch paths that on
// Android run through RichEditorToolbar → RichEditor.Delegate →
// RichEditorListView (turnInto / applyQuote / transformRow / indent…).
//
// Naming follows the Android action surface:
//   formatting panel  → toggle* mark commands
//   text-type menu    → setTextType('heading' | 'quote' | 'pullquote' | …)
//   list menu         → wrapBullet / wrapOrdered / wrapTask / indent / outdent
//   insert paths      → insertDivider / insertMedia / insertMap / insertMath…

import { Command, EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands'
import { wrapInList, liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import { Node, NodeType, MarkType } from 'prosemirror-model'
import { N, M, MediaKind } from './schema'

// ── Marks (formatting panel) ────────────────────────────────────────────

export const toggleBold: Command = (s, d) => toggleMark(M.bold)(s, d)
export const toggleItalic: Command = (s, d) => toggleMark(M.italic)(s, d)
export const toggleUnderline: Command = (s, d) => toggleMark(M.underline)(s, d)
export const toggleStrike: Command = (s, d) => toggleMark(M.strike)(s, d)
export const toggleMono: Command = (s, d) => toggleMark(M.code)(s, d)
export const toggleSpoiler: Command = (s, d) => toggleMark(M.spoiler)(s, d)
export const toggleSub: Command = (s, d) => toggleMark(M.sub)(s, d)
export const toggleSup: Command = (s, d) => toggleMark(M.sup)(s, d)
export const toggleHighlight: Command = (s, d) => toggleMark(M.mark)(s, d)

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

/** Strip every mark from the selection (toolbar "clear formatting"). */
export const clearFormatting: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection
  if (empty) return false
  if (dispatch) {
    let tr = state.tr
    for (const name of Object.keys(state.schema.marks)) {
      tr = tr.removeMark(from, to, state.schema.marks[name])
    }
    dispatch(tr)
  }
  return true
}

export function setLink(href: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    if (dispatch) {
      const mark = M.link.create({ href })
      dispatch(state.tr.addMark(from, to, mark))
    }
    return true
  }
}

export const removeLink: Command = (state, dispatch) => {
  const { from, to } = state.selection
  if (dispatch) dispatch(state.tr.removeMark(from, to, M.link))
  return true
}

export function linkHrefAt(state: EditorState): string | null {
  const { $from, empty } = state.selection
  if (!empty) {
    // first link mark inside the selection
    let href: string | null = null
    state.doc.nodesBetween($from.pos, state.selection.to, (node) => {
      if (href) return false
      const mark = node.marks.find((m) => m.type.name === 'link')
      if (mark) href = mark.attrs.href
      return true
    })
    return href
  }
  const mark = M.link.isInSet($from.marks())
  return mark ? mark.attrs.href : null
}

// ── Block introspection (drives toolbar state, like RichEditor's setters) ──

export interface BlockInfo {
  type:
    | 'paragraph'
    | 'heading'
    | 'footer'
    | 'code'
    | 'pullquote'
    | 'table'
    | 'media'
    | 'map'
    | 'math'
    | 'details'
    | 'divider'
  level: number
  inQuote: boolean
  inList: 'none' | 'bullet' | 'ordered' | 'task'
  inDetails: boolean
  checked: boolean
  language: string
}

export function getBlockInfo(state: EditorState): BlockInfo {
  const info: BlockInfo = {
    type: 'paragraph',
    level: 0,
    inQuote: false,
    inList: 'none',
    inDetails: false,
    checked: false,
    language: '',
  }
  const { $from } = state.selection
  let typeSet = false
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    switch (node.type.name) {
      case 'heading':
        if (!typeSet) {
          info.type = 'heading'
          info.level = node.attrs.level
          typeSet = true
        }
        break
      case 'footer_block':
        if (!typeSet) {
          info.type = 'footer'
          typeSet = true
        }
        break
      case 'code_block':
        if (!typeSet) {
          info.type = 'code'
          info.language = node.attrs.language
          typeSet = true
        }
        break
      case 'pullquote':
        if (!typeSet) {
          info.type = 'pullquote'
          typeSet = true
        }
        break
      case 'blockquote':
        info.inQuote = true
        break
      case 'bullet_list':
        info.inList = 'bullet'
        break
      case 'ordered_list':
        info.inList = 'ordered'
        break
      case 'task_list':
        info.inList = 'task'
        break
      case 'task_item':
        info.checked = !!node.attrs.checked
        break
      case 'details':
        info.inDetails = true
        break
      case 'table':
        if (!typeSet) {
          info.type = 'table'
          typeSet = true
        }
        break
      case 'media_figure':
      case 'media_group':
        if (!typeSet) {
          info.type = 'media'
          typeSet = true
        }
        break
      case 'map_block':
        if (!typeSet) {
          info.type = 'map'
          typeSet = true
        }
        break
      case 'math_block':
        if (!typeSet) {
          info.type = 'math'
          typeSet = true
        }
        break
    }
  }
  return info
}

// ── Text-type menu (Android: turnInto / text type menu) ─────────────────

export type TextTypeTarget =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'unquote'
  | 'pullquote'
  | 'code'
  | 'footer'

export function setTextType(target: TextTypeTarget, level = 1): Command {
  return (state, dispatch) => {
    switch (target) {
      case 'paragraph':
        return setBlockType(N.paragraph)(state, dispatch)
      case 'heading':
        return setBlockType(N.heading, { level })(state, dispatch)
      case 'code':
        return setBlockType(N.code_block, { language: '' })(state, dispatch)
      case 'footer':
        return setBlockType(N.footer_block)(state, dispatch)
      case 'pullquote': {
        // paragraph → pullquote; a second invocation turns it back
        const info = getBlockInfo(state)
        if (info.type === 'pullquote') return setBlockType(N.paragraph)(state, dispatch)
        return setBlockType(N.pullquote, { cite: null })(state, dispatch)
      }
      case 'quote':
        return wrapIn(N.blockquote)(state, dispatch)
      case 'unquote':
        return lift(state, dispatch)
    }
  }
}

export function setCodeLanguage(language: string): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'code_block') {
        if (dispatch) {
          dispatch(state.tr.setNodeMarkup($from.before(d), undefined, { language }))
        }
        return true
      }
    }
    return false
  }
}

// ── Quote author (Android: quoteAuthors map / RichQuoteAuthorCell) ──────

export function setQuoteCite(cite: string | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type.name === 'blockquote' || node.type.name === 'pullquote') {
        if (dispatch) {
          dispatch(state.tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, cite }))
        }
        return true
      }
    }
    return false
  }
}

// ── Lists (Android: list runs with level/num, indent/outdent/renumber) ──

export const wrapBullet: Command = (s, d) => wrapInList(N.bullet_list)(s, d)
export const wrapOrdered: Command = (s, d) => wrapInList(N.ordered_list)(s, d)
export const wrapTask: Command = (s, d) => wrapInList(N.task_list)(s, d)

export const splitListItemAny: Command = (s, d) =>
  splitListItem(N.list_item)(s, d) || splitListItem(N.task_item)(s, d)

export const indentList: Command = (s, d) =>
  sinkListItem(N.list_item)(s, d) || sinkListItem(N.task_item)(s, d)

export const outdentList: Command = (s, d) =>
  liftListItem(N.list_item)(s, d) || liftListItem(N.task_item)(s, d)

export const toggleTaskChecked: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'task_item') {
      if (dispatch) {
        dispatch(
          state.tr.setNodeMarkup($from.before(d), undefined, {
            ...node.attrs,
            checked: !node.attrs.checked,
          }),
        )
      }
      return true
    }
  }
  return false
}

/** Remove list wrapping entirely (list menu → "None"). */
export const unwrapList: Command = (s, d) => lift(s, d)

// ── Details / toggle ────────────────────────────────────────────────────

export const toggleDetailsOpen: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'details') {
      if (dispatch) {
        dispatch(
          state.tr.setNodeMarkup($from.before(d), undefined, {
            ...node.attrs,
            open: !node.attrs.open,
          }),
        )
      }
      return true
    }
  }
  return false
}

// ── Block insertion (attach sheet / slash commands) ─────────────────────

/** Insert a standalone block after the current top-level block and put the
 *  caret in a fresh paragraph below it — mirrors Android's "insert row". */
function insertBlockNode(makeNode: () => Node | null, focusAfter = true): Command {
  return (state, dispatch) => {
    const node = makeNode()
    if (!node) return false
    if (dispatch) {
      const { $from } = state.selection
      const after = $from.after(1)
      let tr = state.tr.insert(after, node)
      const para = N.paragraph.create()
      tr = tr.insert(after + node.nodeSize, para)
      if (focusAfter) {
        tr = tr.setSelection(TextSelection.create(tr.doc, after + node.nodeSize + 1))
      } else {
        tr = tr.setSelection(TextSelection.create(tr.doc, after + 1))
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export const insertDivider: Command = insertBlockNode(() => N.horizontal_rule.create())

export function insertMedia(kind: MediaKind = 'image'): Command {
  return insertBlockNode(() =>
    N.media_figure.create({ kind, src: '', spoiler: false }),
  )
}

export function insertGallery(mode: 'collage' | 'slideshow'): Command {
  return insertBlockNode(() => N.media_group.create({ mode, items: [] }))
}

export const insertMap: Command = insertBlockNode(() =>
  N.map_block.create({ lat: 41.9, long: 12.5, zoom: 15 }),
)

export const insertMathBlock: Command = insertBlockNode(() => N.math_block.create({ tex: '' }))

export const insertDetails: Command = insertBlockNode(() => {
  const summary = N.details_summary.createAndFill()
  const para = N.paragraph.create()
  if (!summary) return null
  return N.details.create({ open: true }, [summary, para])
})

// ── Inline atoms (math / date / anchor) ─────────────────────────────────

export function insertInlineMath(tex: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(N.math_inline.create({ tex })).scrollIntoView())
    }
    return true
  }
}

export function insertCustomEmoji(emojiId: string, emoji: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(
        state.tr
          .replaceSelectionWith(N.custom_emoji.create({ emojiId, emoji }))
          .scrollIntoView(),
      )
    }
    return true
  }
}

export function insertTime(unix: number, format: string, display: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(
        state.tr
          .replaceSelectionWith(N.time_inline.create({ unix, format, display }))
          .scrollIntoView(),
      )
    }
    return true
  }
}

export function insertAnchor(name: string): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(N.anchor.create({ name })).scrollIntoView())
    }
    return true
  }
}

/** All anchor names in the document — feeds the link dialog's #anchor picker. */
export function collectAnchors(state: EditorState): string[] {
  const names: string[] = []
  state.doc.descendants((node) => {
    if (node.type.name === 'anchor' && node.attrs.name) names.push(node.attrs.name)
    if (node.type.name === 'heading') {
      // headings are linkable via their text slug, Telegram-style chapters
    }
  })
  return names
}

// ── Node-view helpers (attr updates dispatched from custom views) ───────

export function updateAttrsAt(
  view: EditorView,
  pos: number,
  attrs: Record<string, unknown>,
): void {
  const node = view.state.doc.nodeAt(pos)
  if (!node) return
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
}

export function selectNodeAt(view: EditorView, pos: number): void {
  const { state } = view
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + 1)))
  view.focus()
}

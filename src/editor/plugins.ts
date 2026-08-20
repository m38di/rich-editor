// src/editor/plugins.ts
//
// Keyboard + typing behaviour:
//  · keymap — Telegram/web shortcuts (Mod-b/i/u, Mod-e mono, Mod-k link,
//    Mod-Alt-1…6 headings, Tab cell/indent navigation)
//  · markdown input rules — the RichTextCell line-start shortcuts:
//      #…######  → headings        ```lang → code block     |  → quote
//      - * +     → bulleted list   1.      → numbered list  [] → checklist
//      ---       → divider         >       → toggle/details
//  · slash-command detection — the RichCommandSuggestions popup feed
//  · selection reporter — drives the formatting panel state, exactly like
//    RichEditor's toolbar setters on Android.

import {
  Plugin,
  PluginKey,
  EditorState,
  Transaction,
  TextSelection,
  Command,
} from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, chainCommands, wrapIn } from 'prosemirror-commands'
import { undo, redo, undoDepth, redoDepth } from 'prosemirror-history'
import { InputRule, inputRules, undoInputRule } from 'prosemirror-inputrules'
import { wrapInList } from 'prosemirror-schema-list'
import { N } from './schema'
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  toggleMono,
  toggleHighlight,
  toggleSpoiler,
  splitListItemAny,
  indentList,
  outdentList,
  setTextType,
  wrapOrdered,
  wrapBullet,
  getBlockInfo,
  BlockInfo,
  isMarkActive,
} from './commands'
import { nextCell, isInTable } from './tableCommands'
import { M } from './schema'
import { docTextLength } from './serializer'

// ── markdown line-start shortcuts ───────────────────────────────────────

/** Run a wrapping command as the continuation of an input-rule deletion. */
function wrapRule(re: RegExp, cmd: Command): InputRule {
  return new InputRule(re, (state, _match, start, end) => {
    const tr = state.tr.delete(start, end)
    const tempState = EditorState.create({
      schema: state.schema,
      doc: tr.doc,
      selection: state.selection.map(tr.doc, tr.mapping),
      storedMarks: state.storedMarks,
    })
    let inner: Transaction | undefined
    cmd(tempState, (t) => {
      inner = t
    })
    if (inner) inner.steps.forEach((step) => tr.step(step))
    return tr
  })
}

export function markdownRules(): Plugin {
  const rules: InputRule[] = [
    // headings: "# " … "###### "
    new InputRule(/^(#{1,6})\s$/, (state, match, start, end) => {
      const level = match[1].length
      return state.tr.delete(start, end).setBlockType(start, start, N.heading, { level })
    }),

    // code block: ```lang
    new InputRule(/^```([\w+-]*)?\s$/, (state, match, start, end) =>
      state.tr
        .delete(start, end)
        .setBlockType(start, start, N.code_block, { language: match[1] || '' }),
    ),

    // quote: "| "
    wrapRule(/^\|\s$/, wrapIn(N.blockquote)),

    // lists: "- ", "* ", "+ "
    wrapRule(/^\s*[-*+]\s$/, wrapInList(N.bullet_list)),

    // numbered: "1. "
    new InputRule(/^(\d+)\.\s$/, (state, match, start, end) => {
      const tr = state.tr.delete(start, end)
      const tempState = EditorState.create({
        schema: state.schema,
        doc: tr.doc,
        selection: state.selection.map(tr.doc, tr.mapping),
        storedMarks: state.storedMarks,
      })
      let inner: Transaction | undefined
      wrapInList(N.ordered_list, { start: Number(match[1]) || 1 })(tempState, (t) => {
        inner = t
      })
      if (inner) inner.steps.forEach((step) => tr.step(step))
      return tr
    }),

    // checklist: "[] "
    wrapRule(/^\[\]\s$/, wrapInList(N.task_list)),

    // divider: ---
    new InputRule(/^---$/, (state, _match, start, end) => {
      let tr = state.tr.delete(start, end)
      const blockFrom = tr.doc.resolve(start).before()
      const block = tr.doc.nodeAt(blockFrom)
      if (!block || block.type.name !== 'paragraph' || block.nodeSize !== 2) return null
      tr = tr.replaceWith(blockFrom, blockFrom + block.nodeSize, N.horizontal_rule.create())
      if (blockFrom + 2 >= tr.doc.content.size) {
        tr = tr.insert(tr.doc.content.size, N.paragraph.create())
      }
      tr = tr.setSelection(
        TextSelection.create(tr.doc, Math.min(blockFrom + 3, tr.doc.content.size - 1)),
      )
      return tr
    }),

    // toggle/details: "> "
    new InputRule(/^>\s$/, (state, _match, start, end) => {
      let tr = state.tr.delete(start, end)
      const blockFrom = tr.doc.resolve(start).before()
      const block = tr.doc.nodeAt(blockFrom)
      if (!block || block.type.name !== 'paragraph' || block.nodeSize !== 2) return null
      const summary = N.details_summary.createAndFill()
      if (!summary) return null
      const details = N.details.create({ open: true }, [summary, N.paragraph.create()])
      tr = tr.replaceWith(blockFrom, blockFrom + block.nodeSize, details)
      tr = tr.setSelection(TextSelection.create(tr.doc, blockFrom + 2))
      return tr
    }),
  ]
  return inputRules({ rules })
}

// ── slash commands (RichCommandSuggestions feed) ────────────────────────

export interface SlashState {
  active: boolean
  /** position of the '/' */
  from: number
  /** cursor position */
  to: number
  /** text after the '/', lowercased */
  query: string
}

const slashKey = new PluginKey<SlashState>('slashCommands')

function computeSlash(state: EditorState): SlashState {
  const off: SlashState = { active: false, from: 0, to: 0, query: '' }
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return off
  const { $from } = selection
  if ($from.parent.type.name !== 'paragraph') return off
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const m = /^\/([A-Za-z0-9_]*)$/.exec(text)
  if (!m) return off
  return { active: true, from: $from.start(), to: $from.pos, query: m[1].toLowerCase() }
}

export function slashCommandPlugin(onChange: (s: SlashState) => void): Plugin {
  let last = ''
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => computeSlash(EditorState.create({ schema: N.paragraph.schema })),
      apply: (_tr, _prev, _old, newState) => computeSlash(newState),
    },
    view: () => ({
      update: (view) => {
        const s = slashKey.getState(view.state)
        if (!s) return
        const sig = `${s.active}|${s.from}|${s.to}|${s.query}`
        if (sig !== last) {
          last = sig
          onChange(s)
        }
      },
    }),
  })
}

export function getSlashState(state: EditorState): SlashState | undefined {
  return slashKey.getState(state)
}

// table

function getCellElement(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos)

  if (!(dom instanceof HTMLElement)) return null

  if (
    dom.tagName === 'TD' ||
    dom.tagName === 'TH'
  ) {
    return dom
  }

  return null
}

export interface TableCellSelection {
  pos: number
}

export interface TableSelectionState {
  cells: TableCellSelection[]
  multi: boolean
}

export const tableSelectionKey =
  new PluginKey<TableSelectionState>('tableSelection')

function getCurrentTableCell(
  state: EditorState,
): TableCellSelection | null {
  const { $from } = state.selection

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)

    if (
      node.type.name === 'table_cell' ||
      node.type.name === 'table_header'
    ) {
      return {
        pos: $from.before(depth),
      }
    }
  }

  return null
}

export const tableSelectionPlugin = () =>
  new Plugin<TableSelectionState>({
    key: tableSelectionKey,

    state: {
      init() {
        return {
          cells: [],
          multi: false,
        }
      },

      apply(tr, old, _oldState, newState) {
        const meta = tr.getMeta(tableSelectionKey)
      
        if (meta) {
          return meta
        }
      
        if (tr.selectionSet) {
          const cell = getCurrentTableCell(newState)
      
          if (!cell) {
            return {
              cells: [],
              multi: false,
            }
          }
      
          // If we're already in multi-select mode,
          // don't destroy the selected cells just because
          // ProseMirror moved its text cursor.
          if (old.multi) {
            return old
          }
      
          return {
            cells: [cell],
            multi: false,
          }
        }
      
        return old
      },
    },

    props: {
      decorations(state) {
        const selection = tableSelectionKey.getState(state)
    
        if (!selection || selection.cells.length === 0) {
          return DecorationSet.empty
        }
    
        const decorations: Decoration[] = []
    
        for (const cell of selection.cells) {
          const node = state.doc.nodeAt(cell.pos)
    
          if (!node) continue
    
          decorations.push(
            Decoration.node(
              cell.pos,
              cell.pos + node.nodeSize,
              {
                class: 're-table-cell-active',
              },
            ),
          )
        }
    
        return DecorationSet.create(
          state.doc,
          decorations,
        )
      },
    
      handleClick(view, pos, event) {
        const mouse = event as MouseEvent
    
        if (!mouse.ctrlKey && !mouse.metaKey) {
          return false
        }
    
        const $pos = view.state.doc.resolve(pos)
    
        let cellPos: number | null = null
    
        for (
          let depth = $pos.depth;
          depth > 0;
          depth--
        ) {
          const node = $pos.node(depth)
    
          if (
            node.type.name === 'table_cell' ||
            node.type.name === 'table_header'
          ) {
            cellPos = $pos.before(depth)
            break
          }
        }
    
        if (cellPos == null) {
          return false
        }
    
        const current =
          tableSelectionKey.getState(view.state)
    
        if (!current) {
          return true
        }
    
        const exists = current.cells.some(
          cell => cell.pos === cellPos,
        )
    
        const cells = exists
          ? current.cells.filter(
              cell => cell.pos !== cellPos,
            )
          : [
              ...current.cells,
              { pos: cellPos },
            ]
    
        view.dispatch(
          view.state.tr.setMeta(
            tableSelectionKey,
            {
              cells,
              multi: cells.length > 1,
            },
          ),
        )
    
        return true
      },
    },
  })

// ── selection reporter (toolbar state) ──────────────────────────────────

export interface SelectionInfo {
  empty: boolean
  marks: Record<string, boolean>
  block: BlockInfo
  canUndo: boolean
  canRedo: boolean
  chars: number
  linkHref: string | null
  inTable: boolean
}

export function selectionReporter(onChange: (info: SelectionInfo) => void): Plugin {
  let last = ''
  return new Plugin({
    view: () => ({
      update: (view) => {
        const state = view.state
        const { empty, $from } = state.selection as TextSelection & { $from: any }
        const marks: Record<string, boolean> = {}
        for (const name of [
          'bold',
          'italic',
          'underline',
          'strike',
          'code',
          'spoiler',
          'sub',
          'sup',
          'mark',
          'link',
        ]) {
          marks[name] = isMarkActive(state, state.schema.marks[name])
        }
        const linkMark = state.schema.marks.link.isInSet(
          state.selection.empty ? state.storedMarks || $from.marks() : [],
        )
        const info: SelectionInfo = {
          empty: state.selection.empty,
          marks,
          block: getBlockInfo(state),
          canUndo: undoDepth(state) > 0,
          canRedo: redoDepth(state) > 0,
          chars: docTextLength(state.doc),
          linkHref: linkMark ? linkMark.attrs.href : null,
        }
        const sig = JSON.stringify([
          info.empty,
          info.marks,
          info.block,
          info.canUndo,
          info.canRedo,
          info.chars,
          info.linkHref,
          info.inTable,
        ])
        if (sig !== last) {
          last = sig
          onChange(info)
        }
      },
    }),
  })
}

// ── keymap ──────────────────────────────────────────────────────────────

export function buildKeymap(opts: { onOpenLink: () => void }): Plugin[] {
  const bindings: Record<string, Command> = {
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
    'Mod-b': toggleBold,
    'Mod-i': toggleItalic,
    'Mod-u': toggleUnderline,
    'Mod-Shift-x': toggleStrike,
    'Mod-e': toggleMono,
    'Mod-Shift-h': toggleHighlight,
    'Mod-Shift-s': toggleSpoiler,
    'Mod-k': () => {
      opts.onOpenLink()
      return true
    },
    'Tab': chainCommands(nextCell(1), indentList),
    'Shift-Tab': chainCommands(nextCell(-1), outdentList),
    'Mod-Alt-1': setTextType('heading', 1),
    'Mod-Alt-2': setTextType('heading', 2),
    'Mod-Alt-3': setTextType('heading', 3),
    'Mod-Alt-4': setTextType('heading', 4),
    'Mod-Alt-5': setTextType('heading', 5),
    'Mod-Alt-6': setTextType('heading', 6),
    'Mod-Alt-0': setTextType('paragraph'),
    'Mod-Shift-7': wrapOrdered,
    'Mod-Shift-8': wrapBullet,
  }
  return [
    keymap(bindings),
    keymap({
      Enter: chainCommands(splitListItemAny, baseKeymap.Enter),
      Backspace: chainCommands(undoInputRule, baseKeymap.Backspace),
    }),
    keymap(baseKeymap),
  ]
}

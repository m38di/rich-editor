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
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
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

// ── table cell selection ────────────────────────────────────────────────
// ── table cell selection ────────────────────────────────────────────────

export interface TableCellSelection {
  pos: number
}

export interface TableSelectionState {
  cells: TableCellSelection[]
  multi: boolean
}

export const tableSelectionKey =
  new PluginKey<TableSelectionState>('tableSelection')

function getTableCellAtDOM(
  view: EditorView,
  target: EventTarget | null,
): TableCellSelection | null {
  if (!(target instanceof Element)) {
    return null
  }

  const cell = target.closest('td, th')

  if (!cell) {
    return null
  }

  try {
    const pos = view.posAtDOM(cell, 0)
    const $pos = view.state.doc.resolve(pos)

    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth)

      if (
        node.type.name === 'table_cell' ||
        node.type.name === 'table_header'
      ) {
        return {
          pos: $pos.before(depth),
        }
      }
    }
  } catch {
    return null
  }

  return null
}

function getTableCellAtPoint(
  view: EditorView,
  x: number,
  y: number,
): TableCellSelection | null {
  return getTableCellAtDOM(
    view,
    document.elementFromPoint(x, y),
  )
}

function getTableCellFromSelection(
  state: EditorState,
): TableCellSelection | null {
  const { $from } = state.selection

  for (
    let depth = $from.depth;
    depth > 0;
    depth--
  ) {
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

function containsCell(
  cells: TableCellSelection[],
  pos: number,
): boolean {
  return cells.some(cell => cell.pos === pos)
}

function toggleCell(
  cells: TableCellSelection[],
  cell: TableCellSelection,
): TableCellSelection[] {
  if (containsCell(cells, cell.pos)) {
    return cells.filter(item => item.pos !== cell.pos)
  }

  return [...cells, cell]
}

function clearNativeTextSelection() {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) {
    selection.removeAllRanges()
  }
}

// ── mobile long press state ────────────────────────────────────────────

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressTriggered = false
let suppressTableContextMenu = false

let touchStartX = 0
let touchStartY = 0

function clearLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// ── plugin ─────────────────────────────────────────────────────────────

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

      apply(tr, old, oldState, newState) {
        const meta = tr.getMeta(tableSelectionKey)
      
        // Explicit cell-selection operation.
        if (meta) {
          return meta
        }
      
        // If we're currently doing multi-cell selection,
        // don't let normal cursor movement destroy it.
        if (old.multi) {
          return old
        }
      
        /*
         * Normal editing.
         *
         * Follow ProseMirror's actual cursor.
         *
         * This is what makes Enter, arrow keys, etc.
         * update the highlighted active cell correctly.
         */
        // if (tr.selectionSet) {
        //   const cell = getTableCellFromSelection(newState)
      
        //   if (cell) {
        //     return {
        //       cells: [cell],
        //       multi: false,
        //     }
        //   }
      
        //   return {
        //     cells: [],
        //     multi: false,
        //   }
        // }
      
        return old
      },
    },

    props: {
      // ── visual selection ─────────────────────────────────────────────    
      decorations(state) {
        const selection =
          tableSelectionKey.getState(state)

        if (
          !selection ||
          selection.cells.length === 0
        ) {
          return DecorationSet.empty
        }

        const decorations: Decoration[] = []

        for (const cell of selection.cells) {
          const node = state.doc.nodeAt(cell.pos)

          if (!node) continue

          if (
            node.type.name !== 'table_cell' &&
            node.type.name !== 'table_header'
          ) {
            continue
          }

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
      handleKeyDown(view, event) {
          const state = tableSelectionKey.getState(view.state)
        
          if (!state?.cells.length) {
            return false
          }
        
          // Normal typing/editing exits multi-cell selection.
          if (
            event.key === 'Enter' ||
            event.key === 'Backspace' ||
            event.key === 'Delete' ||
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowRight' ||
            event.key === 'ArrowUp' ||
            event.key === 'ArrowDown'
          ) {
            view.dispatch(
              view.state.tr.setMeta(tableSelectionKey, {
                cells: [],
                multi: false,
              }),
            )
        
            return false
          }
        
          return false
        },
      // ── mouse + touch ────────────────────────────────────────────────

      handleDOMEvents: {
        mousedown(view, event) {
          const e = event as MouseEvent

          /*
           * RIGHT CLICK
           *
           * Select the cell under the pointer, but DON'T
           * preventDefault. This allows the contextmenu
           * event to happen normally.
           */
          if (e.button === 2) {
            const cell = getTableCellAtDOM(
              view,
              e.target,
            )

            if (!cell) {
              return false
            }

            const current =
              tableSelectionKey.getState(view.state)

            /*
             * If the right-clicked cell is already part
             * of a multi-selection, preserve the selection.
             */
            if (
              current?.multi &&
              containsCell(
                current.cells,
                cell.pos,
              )
            ) {
              return false
            }

            view.dispatch(
              view.state.tr.setMeta(
                tableSelectionKey,
                {
                  cells: [cell],
                  multi: false,
                },
              ),
            )

            return false
          }

          /*
           * We only care about left mouse button.
           */
          if (e.button !== 0) {
            return false
          }

          const cell = getTableCellAtDOM(
            view,
            e.target,
          )

          const current =
            tableSelectionKey.getState(view.state)

          /*
           * LEFT CLICK OUTSIDE TABLE
           *
           * Clear cell selection.
           *
           * Don't preventDefault — ProseMirror should
           * still handle the click normally.
           */
          if (!cell) {
            if (
              current &&
              current.cells.length > 0
            ) {
              view.dispatch(
                view.state.tr.setMeta(
                  tableSelectionKey,
                  {
                    cells: [],
                    multi: false,
                  },
                ),
              )
            }

            return false
          }

          /*
           * CTRL / CMD + LEFT CLICK
           *
           * Toggle this cell without allowing the browser
           * to select text.
           */
          if (
            e.ctrlKey ||
            e.metaKey
          ) {
            e.preventDefault()
            e.stopPropagation()

            const cells = toggleCell(
              current?.cells ?? [],
              cell,
            )

            view.dispatch(
              view.state.tr.setMeta(
                tableSelectionKey,
                {
                  cells,
                  multi: cells.length > 0,
                },
              ),
            )

            return true
          }

          /*
           * NORMAL LEFT CLICK ON A CELL
           *
           * Always reduce the table selection to exactly
           * this cell.
           *
           * Then return false so ProseMirror can put the
           * text cursor exactly where the user clicked.
           */
          view.dispatch(
            view.state.tr.setMeta(tableSelectionKey, {
              cells: [cell],
              multi: false,
            }),
          )
          
          return false
        },

        // ── mobile ────────────────────────────────────────────────────

        touchstart(view, event) {
          const e = event as TouchEvent
        
          if (e.touches.length !== 1) {
            clearLongPress()
            return false
          }
        
          const touch = e.touches[0]
        
          const cell = getTableCellAtPoint(
            view,
            touch.clientX,
            touch.clientY,
          )
        
          if (!cell) {
            clearLongPress()
            return false
          }
        
          clearLongPress()
        
          longPressTriggered = false
          suppressTableContextMenu = false
        
          touchStartX = touch.clientX
          touchStartY = touch.clientY
        
          longPressTimer = setTimeout(() => {
            longPressTriggered = true
            suppressTableContextMenu = true
        
            // Stop the browser from owning the selection.
            const selection = window.getSelection()
            selection?.removeAllRanges()
        
            view.dom.classList.add('re-table-selecting')
        
            const current =
              tableSelectionKey.getState(view.state)
        
            const cells = current?.cells ?? []
        
            const next = containsCell(cells, cell.pos)
              ? cells
              : [...cells, cell]
        
            view.dispatch(
              view.state.tr.setMeta(
                tableSelectionKey,
                {
                  cells: next,
                  multi: true,
                },
              ),
            )
          }, 500)
        
          return false
        },
        
        touchmove(view, event) {
          const e = event as TouchEvent
        
          if (e.touches.length !== 1) {
            clearLongPress()
            return false
          }
        
          const touch = e.touches[0]
        
          const dx = touch.clientX - touchStartX
          const dy = touch.clientY - touchStartY
        
          if (!longPressTriggered) {
            if (
              Math.abs(dx) > 10 ||
              Math.abs(dy) > 10
            ) {
              clearLongPress()
            }
        
            return false
          }
        
          // Our table-selection gesture owns the touch now.
          event.preventDefault()
        
          // Continuously kill native text selection while selecting cells.
          window.getSelection()?.removeAllRanges()
        
          const cell = getTableCellAtPoint(
            view,
            touch.clientX,
            touch.clientY,
          )
        
          if (!cell) {
            return true
          }
        
          const current =
            tableSelectionKey.getState(view.state)
        
          if (
            current &&
            !containsCell(current.cells, cell.pos)
          ) {
            view.dispatch(
              view.state.tr.setMeta(
                tableSelectionKey,
                {
                  cells: [
                    ...current.cells,
                    cell,
                  ],
                  multi: true,
                },
              ),
            )
          }
        
          return true
        },
        
        touchend(view) {
          clearLongPress()
        
          if (!longPressTriggered) {
            suppressTableContextMenu = false
            return false
          }
        
          // Keep the cell selection.
          longPressTriggered = false
        
          view.dom.classList.remove(
            're-table-selecting',
          )
        
          // Do NOT immediately clear this.
          // iOS can fire contextmenu shortly after touchend.
          setTimeout(() => {
            suppressTableContextMenu = false
          }, 400)
        
          return true
        },
        
        touchcancel(view) {
          clearLongPress()
        
          longPressTriggered = false
        
          view.dom.classList.remove(
            're-table-selecting',
          )
        
          suppressTableContextMenu = false
        
          return false
        },
        
        contextmenu(view, event) {
          if (suppressTableContextMenu || longPressTriggered) {
            event.preventDefault()
            event.stopPropagation()
            return true
          }
        
          return false
        },
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

    'Tab': chainCommands(
      nextCell(1),
      indentList,
    ),

    'Shift-Tab': chainCommands(
      nextCell(-1),
      outdentList,
    ),

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
      Backspace: chainCommands(
        undoInputRule,
        baseKeymap.Backspace,
      ),
    }),
  
    keymap(baseKeymap),
  ]
}

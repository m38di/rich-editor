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
import { bus } from './bus'

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

export interface TableCellSelection {
  pos: number
}

export interface TableSelectionState {
  cells: TableCellSelection[]
  multi: boolean
  /**
   * Whether this selection should open the cell menu. Only deliberate
   * "show me the options" gestures set it — right-click, long-press, the
   * row/column handles and the end of a drag selection. Ctrl+click keeps
   * building the selection silently, so dismissing the menu can never wipe
   * what the user just selected.
   */
  menu?: boolean
}

export const tableSelectionKey =
  new PluginKey<TableSelectionState>('tableSelection')

/** Leave cell-selection mode (Android: exitCellSelectionMode). */
export function clearTableSelection(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(tableSelectionKey, {
      cells: [],
      multi: false,
    }),
  )
}

/**
 * Close the cell menu but keep the cells selected — dismissing the menu is
 * not the same as abandoning the selection.
 */
export function dismissTableMenu(view: EditorView): void {
  const current = tableSelectionKey.getState(view.state)
  if (!current || !current.menu) return
  view.dispatch(
    view.state.tr.setMeta(tableSelectionKey, { ...current, menu: false }),
  )
}

/** Set cell selection with anchor-key bookkeeping (survives table rebuilds). */
function setSelection(
  view: EditorView,
  cells: TableCellSelection[],
  multi: boolean,
  menu?: boolean,
): void {
  view.dispatch(
    view.state.tr.setMeta(
      tableSelectionKey,
      buildSelection(view.state, cells, multi, menu),
    ),
  )
}

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
/** the synthetic mousedown right after a long-press must not toggle */
let suppressNextTapToggle = false

/** Cell the current touch started on — the drag-selection anchor. */
let dragAnchor: TableCellSelection | null = null
/** True once a touch drag has crossed into a second cell. */
let dragSelecting = false

let touchStartX = 0
let touchStartY = 0

function clearLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// ── anchor-key bookkeeping ──────────────────────────────────────────────
//
// Table menu actions (align/header/insert…) REBUILD the whole <table> via
// replaceWith, so raw doc positions of selected cells die on every action.
// Selections therefore also carry the containing table's position plus the
// selected anchor keys ("rxc"); after any doc change we re-resolve keys to
// fresh positions in the rebuilt table. This is what keeps the selection —
// and therefore the menu — alive while menu actions run.

export interface TableSelectionState {
  cells: TableCellSelection[]
  multi: boolean
  menu?: boolean
  /** doc pos of the containing <table> */
  table?: number
  /** selected anchor keys "rxc" inside that table */
  keys?: string[]
}

/** Walk a table node → anchor key "rxc" → cell doc pos (occupancy walk). */
function walkTableKeys(doc: EditorState['doc'], tablePos: number): Map<string, number> | null {
  const table = doc.nodeAt(tablePos)
  if (!table || table.type.name !== 'table') return null
  const map = new Map<string, number>()
  const occ = new Set<string>()
  let p = tablePos + 1
  let ri = 0
  table.forEach((child) => {
    if (child.type.name !== 'table_row') {
      p += child.nodeSize
      return
    }
    let cp = p + 1
    let ci = 0
    child.forEach((cellNode) => {
      while (occ.has(`${ri}x${ci}`)) ci++
      map.set(`${ri}x${ci}`, cp)
      const rs = cellNode.attrs.rowspan ?? 1
      const cs = cellNode.attrs.colspan ?? 1
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) occ.add(`${ri + dr}x${ci + dc}`)
      }
      cp += cellNode.nodeSize
      ci += cs
    })
    p += child.nodeSize
    ri++
  })
  return map
}

/**
 * Build a full selection-state payload for `cells`: resolves the containing
 * table and the selected anchor keys so the selection survives rebuilds.
 */
export function buildSelection(
  state: EditorState,
  cells: TableCellSelection[],
  multi: boolean,
  menu?: boolean,
): TableSelectionState {
  if (!cells.length) return { cells: [], multi: false }
  const base: TableSelectionState = { cells, multi, ...(menu !== undefined ? { menu } : {}) }
  const first = Math.max(0, Math.min(cells[0].pos, state.doc.content.size))
  const $pos = state.doc.resolve(first)
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d)
    if (n.type.name === 'table') {
      const tablePos = $pos.before(d)
      const keyToPos = walkTableKeys(state.doc, tablePos)
      if (!keyToPos) break
      const posToKey = new Map(Array.from(keyToPos, ([k, p]) => [p, k]))
      const keys = cells.map((c) => posToKey.get(c.pos)).filter((k): k is string => !!k)
      return { ...base, table: tablePos, keys }
    }
  }
  return base
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

      apply(tr, old) {
        const meta = tr.getMeta(tableSelectionKey)

        // Explicit cell-selection operation.
        if (meta) {
          return meta
        }

        if (!old.cells.length) {
          return old
        }

        if (!tr.docChanged) {
          // Plain caret moves NEVER touch the selection here. Mobile
          // browsers fire native selection-sync transactions constantly
          // during touch gestures; reacting to them wiped selections
          // mid-drag and closed the context menu the moment it appeared.
          return old
        }

        // Doc edits: menu actions REBUILD the whole <table> (replaceWith),
        // so mapped positions die even though the cells still exist at new
        // positions. Re-resolve via the recorded anchor keys in the rebuilt
        // table first — only fall back to plain position mapping when there
        // is no key bookkeeping.
        const tryKeys =
          old.table !== undefined &&
          old.keys &&
          old.keys.length > 0
        if (tryKeys) {
          const mappedTable = tr.mapping.map(old.table!)
          const keyToPos = walkTableKeys(tr.doc, mappedTable)
          if (keyToPos) {
            const cells: TableCellSelection[] = []
            for (const k of old.keys!) {
              const p = keyToPos.get(k)
              if (p !== undefined) cells.push({ pos: p })
            }
            if (cells.length) {
              return { ...old, table: mappedTable, cells }
            }
          }
          // keys unresolvable → table genuinely gone; clear below
          return { cells: [], multi: false }
        }

        // No key bookkeeping (e.g. external edits): map and keep whatever
        // still points at a cell.
        const cells: TableCellSelection[] = []
        for (const c of old.cells) {
          const pos = tr.mapping.map(c.pos, -1)
          const node = tr.doc.nodeAt(pos)
          if (
            node &&
            (node.type.name === 'table_cell' || node.type.name === 'table_header')
          ) {
            cells.push({ pos })
          }
        }
        if (!cells.length) {
          return { cells: [], multi: false }
        }
        return { ...old, cells }
      },
    },

    view: () => {
      let lastSig = ''
      let lastMenuSig = ''
      return {
        update: (view) => {
          const s = tableSelectionKey.getState(view.state)
          const positions = s ? s.cells.map((c) => c.pos) : []
          const sig = positions.join(',')
          // Also re-emit when keys change without position changes: menu
          // actions REBUILD the table, so the same "0x0,0x1" selection gets
          // entirely NEW positions — the sig alone would skip the emit and
          // the handles/ring would never reposition onto the rebuilt DOM.
          const keySig = s?.keys?.join(',') ?? ''
          const combined = `${sig}|${keySig}|${s?.table ?? ''}`
          if (combined !== lastSig) {
            lastSig = combined
            // Fine-grained: every selection change (single active cell too) —
            // drives the TableView row/column dot handles.
            bus.emit('table:selection', positions)
          }

          // The menu only follows deliberate gestures, so building a
          // selection with Ctrl+click never pops it up and dismissing it
          // never destroys the selection.
          const wantsMenu = !!(s && s.multi && s.menu && positions.length > 0)
          const menuSig = wantsMenu ? `${combined}|menu` : ''
          if (menuSig !== lastMenuSig && wantsMenu) {
            lastMenuSig = menuSig
            bus.emit('table:menu', positions)
          } else if (!wantsMenu && lastMenuSig !== '') {
            lastMenuSig = ''
            bus.emit('table:menu', null)
          }
        },
      }
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
           * ROW/COLUMN HANDLE TAPS
           *
           * The handle buttons stopPropagation in the bubble phase, but PM's
           * own handler still sees the event first (it is registered on the
           * editor root). Treating a dots-tap as a normal cell click reduced
           * the fresh row/column selection to a single cell a frame later —
           * the "active state strips itself" bug. Handles are overlay UI,
           * never cell targets: ignore them here entirely.
           */
          if (
            e.target instanceof Element &&
            e.target.closest('.re-th-dots, .re-th-bulge')
          ) {
            return false
          }

          /*
           * RIGHT CLICK
           *
           * Select the cell under the pointer in menu mode —
           * the auto-shown context menu replaces the native one
           * (see the contextmenu handler below).
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

            setSelection(view, [cell], true, true)

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

            // building a selection by hand reveals the cell menu, exactly
            // like the drag/long-press gestures
            setSelection(view, cells, cells.length > 0, cells.length > 0)

            return true
          }

          /*
           * TAP WITH AN ACTIVE MULTI-SELECTION
           *
           * Mobile has no Ctrl key — Telegram builds selections by
           * long-pressing the first cell, then TAPPING further cells to
           * add/remove them. Tapping an already-selected cell removes it;
           * removing the last one drops back to plain caret mode.
           */
          if (suppressNextTapToggle) {
            suppressNextTapToggle = false
          } else if (current && current.multi && current.cells.length > 0) {
            const alreadyIn = containsCell(current.cells, cell.pos)
            if (!(alreadyIn && current.cells.length === 1)) {
              const next = alreadyIn
                ? current.cells.filter((c) => c.pos !== cell.pos)
                : [...current.cells, cell]
              setSelection(view, next, next.length > 0, next.length > 0)
              e.preventDefault()
              e.stopPropagation()
              return true
            }
            // sole selected cell tapped again → fall through to caret
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
          setSelection(view, [cell], false)

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
            dragAnchor = null

            // Tap outside any table dismisses an active cell selection
            // (mobile has no reliable synthesized mousedown for this).
            const current = tableSelectionKey.getState(view.state)
            if (current && current.cells.length > 0) {
              // don't kill a long-press that is about to start inside a menu
              const t = e.target as HTMLElement
              if (!t.closest?.('.re-ctx-menu, .re-ctx-backdrop')) {
                view.dispatch(
                  view.state.tr.setMeta(tableSelectionKey, { cells: [], multi: false }),
                )
              }
            }
            return false
          }

          clearLongPress()

          longPressTriggered = false
          dragSelecting = false
          dragAnchor = cell
          suppressTableContextMenu = false

          touchStartX = touch.clientX
          touchStartY = touch.clientY

          longPressTimer = setTimeout(() => {
            longPressTriggered = true
            suppressTableContextMenu = true
            // the synthetic mousedown after this long-press must not run the
            // tap-to-toggle logic and undo the cell we just added
            suppressNextTapToggle = true

            view.dom.classList.add('re-table-selecting')

            const current =
              tableSelectionKey.getState(view.state)

            const cells = current?.cells ?? []

            const next = containsCell(cells, cell.pos)
              ? cells
              : [...cells, cell]

            setSelection(view, next, true, true)
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
          const moved = Math.abs(dx) > 12 || Math.abs(dy) > 12

          const cell = getTableCellAtPoint(
            view,
            touch.clientX,
            touch.clientY,
          )

          /*
           * DRAG SELECTION (mobile)
           *
           * Dragging from one cell into another starts cell selection right
           * away — no long-press needed. A drag that stays inside the anchor
           * cell is left alone so ordinary scrolling and text selection keep
           * working.
           */
          if (!longPressTriggered && !dragSelecting) {
            if (!moved) return false

            if (
              !dragAnchor ||
              !cell ||
              cell.pos === dragAnchor.pos
            ) {
              // scrolling, or still inside the starting cell
              clearLongPress()
              return false
            }

            clearLongPress()
            dragSelecting = true
            view.dom.classList.add('re-table-selecting')
            window.getSelection()?.removeAllRanges()

            setSelection(view, [dragAnchor, cell], true, true)

            event.preventDefault()
            return true
          }

          // Our table-selection gesture owns the touch now.
          event.preventDefault()

          // Continuously kill native text selection while selecting cells.
          window.getSelection()?.removeAllRanges()

          if (!cell) {
            return true
          }

          const current =
            tableSelectionKey.getState(view.state)

          if (
            current &&
            !containsCell(current.cells, cell.pos)
          ) {
            setSelection(view, [...current.cells, cell], true, true)
          }

          return true
        },

        touchend(view) {
          clearLongPress()

          /*
           * A drag selection is finished — reveal the cell menu once, and
           * keep the cells selected while it is open.
           */
          if (dragSelecting) {
            dragSelecting = false
            dragAnchor = null
            suppressTableContextMenu = true
            view.dom.classList.remove('re-table-selecting')

            const current = tableSelectionKey.getState(view.state)
            if (current && current.cells.length > 0) {
              view.dispatch(
                view.state.tr.setMeta(tableSelectionKey, {
                  ...current,
                  multi: true,
                  menu: true,
                }),
              )
            }

            setTimeout(() => {
              suppressTableContextMenu = false
            }, 400)

            return true
          }

          dragAnchor = null

          if (!longPressTriggered) {
            suppressTableContextMenu = false
            return false
          }

          // Keep the cell selection.
          longPressTriggered = false
          // the synthetic click after this touchend must not run tap-toggle
          suppressNextTapToggle = true

          view.dom.classList.remove(
            're-table-selecting',
          )

          // Do NOT immediately clear this.
          // iOS can fire contextmenu shortly after touchend.
          setTimeout(() => {
            suppressTableContextMenu = false
            suppressNextTapToggle = false
          }, 400)

          return true
        },

        touchcancel(view) {
          clearLongPress()

          longPressTriggered = false
          dragSelecting = false
          dragAnchor = null

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

          // Table cells own their context menu — suppress the native one so
          // the auto-shown cell menu is the only popup.
          const cell = getTableCellAtDOM(view, event.target)
          if (cell) {
            event.preventDefault()
            // Keyboard-invoked contextmenu (Shift+F10 / Menu key) has no
            // preceding right-mousedown — select the cell ourselves.
            const current = tableSelectionKey.getState(view.state)
            if (!current?.multi || !containsCell(current.cells, cell.pos)) {
              setSelection(view, [cell], true, true)
            } else if (!current.menu) {
              view.dispatch(
                view.state.tr.setMeta(tableSelectionKey, { ...current, menu: true }),
              )
            }
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
        let inTable = false
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'table') {
            inTable = true
            break
          }
        }
        const info: SelectionInfo = {
          empty: state.selection.empty,
          marks,
          block: getBlockInfo(state),
          canUndo: undoDepth(state) > 0,
          canRedo: redoDepth(state) > 0,
          chars: docTextLength(state.doc),
          linkHref: linkMark ? linkMark.attrs.href : null,
          inTable,
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

/**
 * Enter inside media/map captions inserts a line break instead of splitting
 * the block apart (Telegram captions are multiline).
 */
const captionNewline: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'fig_caption') {
      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(N.hard_break.create()))
      }
      return true
    }
  }
  return false
}

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

    // Enter: continue lists (next numbered/bulleted item — the Android
    // RichEditText enter behavior), soft-break inside captions, then the
    // default block splitting.
    keymap({
      Enter: chainCommands(
        splitListItemAny,
        captionNewline,
        baseKeymap.Enter,
      ),
    }),

    keymap({
      Backspace: chainCommands(
        undoInputRule,
        baseKeymap.Backspace,
      ),
    }),

    keymap(baseKeymap),
  ]
}

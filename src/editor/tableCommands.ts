// src/editor/tableCommands.ts
//
// A faithful port of TableModel.java (542 L) semantics to ProseMirror:
//
//  · occupancy grid — every covered coordinate maps to its top-left anchor
//  · addRow / addColumn, insertRowAt / insertColumnAt
//      spans crossing the insertion line grow by +1; uncovered slots get
//      fresh 1×1 cells
//  · deleteRows / deleteColumns
//      cells fully inside the removed range disappear; surviving anchors
//      remap to the first kept index; spans shrink by the removed overlap
//  · mergeCells — only exact rectangles; plain texts concatenated row-major
//    joined by "\n" into the top-left cell (TableModel.mergeCells)
//  · unmergeCell — clears spans and fills the region with empty cells
//    inheriting header + align
//  · toggleBordered / toggleStriped / header row / caption / align / valign
//  · Tab navigation — next / previous anchor cell (RichTableCellGrid)
//
// Strategy: read the table into a mutable grid representation, apply the
// operation, rebuild the node, replace it in one transaction, then restore
// the caret to the equivalent cell. Rebuilding is far more robust than
// surgical transforms for span arithmetic.
//
// Two entry styles exist:
//  · cursor-based (findTableContext) — used by keyboard/sheet flows
//  · position-based (*At commands) — used by the cell-selection context
//    menu (Android: RichTableCell.applyMergeFromSelection & friends), which
//    must work even when the PM caret sits outside the table.

import { Command, EditorState, TextSelection } from 'prosemirror-state'
import { Node } from 'prosemirror-model'
import { N, Align, VAlign } from './schema'

export interface CellRec {
  r: number
  c: number
  colspan: number
  rowspan: number
  header: boolean
  align: Align
  valign: VAlign
  /** paragraph content of the cell */
  content: Node
}

export interface Grid {
  rows: number
  cols: number
  /** anchors[r][c] = key of the covering cell, key = `${r}x${c}` of anchor */
  anchors: (string | null)[][]
  cells: Map<string, CellRec>
}

export const cellKey = (r: number, c: number) => `${r}x${c}`

/** Grid-coordinate identity of one anchor cell. */
export interface AnchorRC {
  r: number
  c: number
}

// ── grid ⇄ node ─────────────────────────────────────────────────────────

export function tableToGrid(table: Node): Grid {
  const cells = new Map<string, CellRec>()
  const rowNodes: Node[] = []
  table.forEach((child) => {
    if (child.type.name === 'table_row') rowNodes.push(child)
  })
  const rows = rowNodes.length
  // first pass: collect cells with positions
  const placed: CellRec[] = []
  let cursorCols = 0
  const occupied = new Set<string>()
  rowNodes.forEach((rowNode, r) => {
    let c = 0
    rowNode.forEach((cellNode) => {
      while (occupied.has(cellKey(r, c))) c++
      const rec: CellRec = {
        r,
        c,
        colspan: cellNode.attrs.colspan,
        rowspan: cellNode.attrs.rowspan,
        header: cellNode.type.name === 'table_header',
        align: cellNode.attrs.align,
        valign: cellNode.attrs.valign,
        content: cellNode.firstChild || N.paragraph.create(),
      }
      for (let dr = 0; dr < rec.rowspan; dr++) {
        for (let dc = 0; dc < rec.colspan; dc++) occupied.add(cellKey(r + dr, c + dc))
      }
      placed.push(rec)
      c += rec.colspan
      cursorCols = Math.max(cursorCols, c)
    })
  })
  // account for rowspans extending the grid
  let maxR = rows
  let maxC = cursorCols
  for (const rec of placed) {
    maxR = Math.max(maxR, rec.r + rec.rowspan)
    maxC = Math.max(maxC, rec.c + rec.colspan)
  }
  const anchors: (string | null)[][] = Array.from({ length: maxR }, () =>
    Array<string | null>(maxC).fill(null),
  )
  for (const rec of placed) {
    cells.set(cellKey(rec.r, rec.c), rec)
    for (let dr = 0; dr < rec.rowspan; dr++) {
      for (let dc = 0; dc < rec.colspan; dc++) {
        anchors[rec.r + dr][rec.c + dc] = cellKey(rec.r, rec.c)
      }
    }
  }
  return { rows: maxR, cols: maxC, anchors, cells }
}

function gridToTable(grid: Grid, attrs: { bordered: boolean; compact: boolean; striped: boolean }, caption: Node | null): Node {
  const rowNodes: Node[] = []
  for (let r = 0; r < grid.rows; r++) {
    const cellNodes: Node[] = []
    for (let c = 0; c < grid.cols; c++) {
      const k = grid.anchors[r][c]
      if (!k) continue
      const rec = grid.cells.get(k)
      if (!rec || rec.r !== r || rec.c !== c) continue // covered by a span
      const type = rec.header ? N.table_header : N.table_cell
      cellNodes.push(
        type.create(
          { colspan: rec.colspan, rowspan: rec.rowspan, align: rec.align, valign: rec.valign },
          rec.content,
        ),
      )
    }
    rowNodes.push(N.table_row.create(null, cellNodes))
  }
  const content: Node[] = caption ? [caption] : []
  content.push(...rowNodes)
  return N.table.create(attrs, content)
}

// ── locating tables & cells in the document ─────────────────────────────

export interface TableContext {
  tablePos: number
  table: Node
  grid: Grid
  attrs: { bordered: boolean; compact: boolean; striped: boolean }
  caption: Node | null
  /** anchor of the cell containing the selection, if any */
  cell: { r: number; c: number } | null
}

export function findTableContext(state: EditorState): TableContext | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      const tablePos = $from.before(d)
      const table = $from.node(d)
      return contextAt(state, tablePos, table)
    }
  }
  return null
}

/** Table context around an arbitrary doc position (selection-independent). */
export function findTableContextAt(state: EditorState, pos: number): TableContext | null {
  let $pos
  try {
    $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)))
  } catch {
    return null
  }
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'table') {
      return contextAt(state, $pos.before(d), $pos.node(d))
    }
  }
  return null
}

function contextAt(state: EditorState, tablePos: number, table: Node): TableContext {
  const grid = tableToGrid(table)
  let caption: Node | null = null
  table.forEach((child) => {
    if (child.type.name === 'table_caption') caption = child
  })
  let cell: { r: number; c: number } | null = null
  const { $from } = state.selection
  if ($from.pos >= tablePos && $from.pos <= tablePos + table.nodeSize) {
    // find innermost cell around selection
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d)
      if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
        // locate its anchor by scanning grid for matching node identity
        outer: for (let r = 0; r < grid.rows; r++) {
          for (let c = 0; c < grid.cols; c++) {
            const k = grid.anchors[r][c]
            if (k && grid.cells.get(k)?.content === n.firstChild) {
              cell = { r, c }
              break outer
            }
          }
        }
        break
      }
    }
  }
  return {
    tablePos,
    table,
    grid,
    attrs: { bordered: table.attrs.bordered, compact: table.attrs.compact, striped: table.attrs.striped },
    caption,
    cell,
  }
}

/**
 * Doc position of the text inside the anchor cell at grid (r, c) —
 * used to place the caret without rebuilding the table. Walks the node
 * with an occupancy map so rowspans don't skew column indices.
 */
export function anchorCellTextPos(table: Node, tablePos: number, r: number, c: number): number | null {
  const target = cellKey(r, c)
  const occ = new Set<string>()
  let out: number | null = null
  let pos = tablePos + 1 // first child of the table node
  let ri = 0
  table.forEach((child) => {
    if (child.type.name !== 'table_row') {
      pos += child.nodeSize
      return
    }
    let cellPos = pos + 1 // after the row open token
    let ci = 0
    child.forEach((cellNode) => {
      while (occ.has(cellKey(ri, ci))) ci++
      if (out === null && cellKey(ri, ci) === target) {
        out = cellPos + 2 // cell open + paragraph open
      }
      for (let dr = 0; dr < cellNode.attrs.rowspan; dr++) {
        for (let dc = 0; dc < cellNode.attrs.colspan; dc++) {
          occ.add(cellKey(ri + dr, ci + dc))
        }
      }
      cellPos += cellNode.nodeSize
      ci += cellNode.attrs.colspan
    })
    pos += child.nodeSize // row open + cells + close
    ri++
  })
  return out
}

/** Replace the table and restore the caret to cell (r, c) when possible. */
function replaceTable(
  state: EditorState,
  dispatch: ((tr: import('prosemirror-state').Transaction) => void) | undefined,
  ctx: TableContext,
  newGrid: Grid,
  focus: { r: number; c: number } | null,
  newAttrs = ctx.attrs,
  newCaption: Node | null | undefined = undefined,
): boolean {
  if (!dispatch) return true
  const caption = newCaption === undefined ? ctx.caption : newCaption
  const newTable = gridToTable(newGrid, newAttrs, caption)
  let tr = state.tr.replaceWith(ctx.tablePos, ctx.tablePos + ctx.table.nodeSize, newTable)
  if (focus) {
    const r = Math.min(focus.r, newGrid.rows - 1)
    const c = Math.min(focus.c, newGrid.cols - 1)
    const found = anchorCellTextPos(newTable, ctx.tablePos, r, c)
    if (found !== null && found <= tr.doc.content.size) {
      tr = tr.setSelection(TextSelection.create(tr.doc, Math.min(found, tr.doc.content.size - 1)))
    }
  }
  dispatch(tr.scrollIntoView())
  return true
}

// ── structural operations (pure grid mutators) ──────────────────────────

function cloneGrid(g: Grid): Grid {
  return {
    rows: g.rows,
    cols: g.cols,
    anchors: g.anchors.map((row) => [...row]),
    cells: new Map(Array.from(g.cells.entries()).map(([k, v]) => [k, { ...v }])),
  }
}

function emptyParagraph(): Node {
  return N.paragraph.create()
}

function addCell(grid: Grid, r: number, c: number, header = false, align: Align = 'left'): void {
  const k = cellKey(r, c)
  grid.cells.set(k, {
    r,
    c,
    colspan: 1,
    rowspan: 1,
    header,
    align,
    valign: 'top',
    content: emptyParagraph(),
  })
  grid.anchors[r][c] = k
}

/**
 * Insert a row at `index` (TableModel.insertRowAt semantics):
 *  · cells starting at/below the line shift down
 *  · spans crossing the line grow by +1
 *  · uncovered slots in the new row get fresh 1×1 cells
 * Cells are keyed by their coordinates, so the map is re-keyed after the
 * shift — otherwise addCell at the vacated row would silently overwrite an
 * existing key instead of adding a cell.
 */
function insertRowIntoGrid(g: Grid, index: number): void {
  const rekeyed = new Map<string, CellRec>()
  for (const rec of g.cells.values()) {
    if (rec.r >= index) rec.r += 1
    else if (rec.r + rec.rowspan > index) rec.rowspan += 1
    rekeyed.set(cellKey(rec.r, rec.c), rec)
  }
  g.cells = rekeyed
  g.rows += 1
  rebuildAnchors(g)
  for (let c = 0; c < g.cols; c++) {
    if (!g.anchors[index][c]) addCell(g, index, c)
  }
}

/** Insert a column at `index` — the column counterpart of insertRowIntoGrid. */
function insertColumnIntoGrid(g: Grid, index: number): void {
  const rekeyed = new Map<string, CellRec>()
  for (const rec of g.cells.values()) {
    if (rec.c >= index) rec.c += 1
    else if (rec.c + rec.colspan > index) rec.colspan += 1
    rekeyed.set(cellKey(rec.r, rec.c), rec)
  }
  g.cells = rekeyed
  g.cols += 1
  rebuildAnchors(g)
  for (let r = 0; r < g.rows; r++) {
    if (!g.anchors[r][index]) addCell(g, r, index)
  }
}

/** Recreate the anchor occupancy map from the cell records. */
function rebuildAnchors(g: Grid): void {
  g.anchors = Array.from({ length: g.rows }, () => Array<string | null>(g.cols).fill(null))
  for (const [k, rec] of g.cells) {
    for (let dr = 0; dr < rec.rowspan; dr++) {
      for (let dc = 0; dc < rec.colspan; dc++) {
        if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
      }
    }
  }
}

/** Delete an arbitrary set of rows (TableModel.deleteRows(Set&lt;Integer&gt;)). */
function deleteRowsFromGrid(g: Grid, rows: Set<number>): boolean {
  const dead = new Set<string>()
  const removedAbove = (x: number) => {
    let n = 0
    for (const rr of rows) if (rr < x) n++
    return n
  }
  for (const [k, rec] of g.cells) {
    const start = rec.r
    const end = rec.r + rec.rowspan - 1
    let overlap = 0
    let firstKept = -1
    for (let r = start; r <= end; r++) {
      if (rows.has(r)) overlap++
      else if (firstKept < 0) firstKept = r
    }
    if (overlap === rec.rowspan) {
      dead.add(k) // fully inside removed rows
      continue
    }
    if (overlap === 0) {
      rec.r -= removedAbove(start) // below/above — untouched content
      continue
    }
    // partial overlap: shrink span, anchor to the first kept row
    rec.rowspan -= overlap
    rec.r = firstKept - removedAbove(firstKept)
  }
  for (const k of dead) g.cells.delete(k)
  g.rows -= rows.size
  g.anchors = Array.from({ length: g.rows }, () => Array<string | null>(g.cols).fill(null))
  for (const [k, rec] of g.cells) {
    for (let dr = 0; dr < rec.rowspan; dr++) {
      for (let dc = 0; dc < rec.colspan; dc++) {
        if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
      }
    }
  }
  return g.rows > 0
}

/** Delete an arbitrary set of columns (TableModel.deleteColumns(Set&lt;Integer&gt;)). */
function deleteColumnsFromGrid(g: Grid, cols: Set<number>): boolean {
  const dead = new Set<string>()
  const removedLeft = (x: number) => {
    let n = 0
    for (const cc of cols) if (cc < x) n++
    return n
  }
  for (const [k, rec] of g.cells) {
    const start = rec.c
    const end = rec.c + rec.colspan - 1
    let overlap = 0
    let firstKept = -1
    for (let c = start; c <= end; c++) {
      if (cols.has(c)) overlap++
      else if (firstKept < 0) firstKept = c
    }
    if (overlap === rec.colspan) {
      dead.add(k)
      continue
    }
    if (overlap === 0) {
      rec.c -= removedLeft(start)
      continue
    }
    rec.colspan -= overlap
    rec.c = firstKept - removedLeft(firstKept)
  }
  for (const k of dead) g.cells.delete(k)
  g.cols -= cols.size
  for (const row of g.anchors) {
    row.fill(null)
    row.length = g.cols
  }
  for (const [k, rec] of g.cells) {
    for (let dr = 0; dr < rec.rowspan; dr++) {
      for (let dc = 0; dc < rec.colspan; dc++) {
        if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
      }
    }
  }
  return g.cols > 0
}

// ── cursor-based commands ───────────────────────────────────────────────

export const addRow: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx) return false
  const g = cloneGrid(ctx.grid)
  g.anchors.push(Array<string | null>(g.cols).fill(null))
  for (let c = 0; c < g.cols; c++) addCell(g, g.rows, c)
  g.rows += 1
  return replaceTable(state, dispatch, ctx, g, { r: g.rows - 1, c: ctx.cell?.c ?? 0 })
}

export const addColumn: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx) return false
  const g = cloneGrid(ctx.grid)
  for (const row of g.anchors) row.push(null)
  for (let r = 0; r < g.rows; r++) addCell(g, r, g.cols)
  g.cols += 1
  return replaceTable(state, dispatch, ctx, g, { r: ctx.cell?.r ?? 0, c: g.cols - 1 })
}

export function insertRowAt(index: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    insertRowIntoGrid(g, index)
    return replaceTable(state, dispatch, ctx, g, { r: index, c: ctx.cell?.c ?? 0 })
  }
}

export function insertColumnAt(index: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    insertColumnIntoGrid(g, index)
    return replaceTable(state, dispatch, ctx, g, { r: ctx.cell?.r ?? 0, c: index })
  }
}

export function deleteRows(from: number, to: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    const rows = new Set<number>()
    for (let r = from; r <= to; r++) rows.add(r)
    if (!deleteRowsFromGrid(g, rows)) return false
    return replaceTable(state, dispatch, ctx, g, { r: Math.min(from, g.rows - 1), c: ctx.cell?.c ?? 0 })
  }
}

export function deleteColumns(from: number, to: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    const cols = new Set<number>()
    for (let c = from; c <= to; c++) cols.add(c)
    if (!deleteColumnsFromGrid(g, cols)) return false
    return replaceTable(state, dispatch, ctx, g, { r: ctx.cell?.r ?? 0, c: Math.min(from, g.cols - 1) })
  }
}

// ── merge / unmerge (TableModel semantics) ──────────────────────────────

export interface Rect {
  r1: number
  c1: number
  r2: number
  c2: number
}

/** True when the rectangle is exactly covered by whole cells. */
export function isExactRect(g: Grid, rect: Rect): boolean {
  const inside = new Set<string>()
  for (let r = rect.r1; r <= rect.r2; r++) {
    for (let c = rect.c1; c <= rect.c2; c++) {
      const k = g.anchors[r]?.[c]
      if (!k) return false
      const rec = g.cells.get(k)
      if (!rec) return false
      if (rec.r < rect.r1 || rec.c < rect.c1) return false
      if (rec.r + rec.rowspan - 1 > rect.r2 || rec.c + rec.colspan - 1 > rect.c2) return false
      inside.add(k)
    }
  }
  return inside.size > 1
}

function mergeGridRect(g: Grid, rect: Rect, schemaText: (s: string) => Node[]): boolean {
  if (!isExactRect(g, rect)) return false
  // concatenate plain texts row-major joined by "\n" (TableModel.mergeCells)
  const texts: string[] = []
  for (let r = rect.r1; r <= rect.r2; r++) {
    for (let c = rect.c1; c <= rect.c2; c++) {
      const k = g.anchors[r][c]
      if (k !== cellKey(r, c)) continue
      const rec = g.cells.get(k)
      if (!rec) continue
      let text = ''
      rec.content.forEach((inline) => {
        text += inline.text ?? ''
      })
      if (text) texts.push(text)
      if (k !== cellKey(rect.r1, rect.c1)) g.cells.delete(k)
    }
  }
  const anchorRec = g.cells.get(cellKey(rect.r1, rect.c1))
  if (!anchorRec) return false
  anchorRec.colspan = rect.c2 - rect.c1 + 1
  anchorRec.rowspan = rect.r2 - rect.r1 + 1
  anchorRec.content = N.paragraph.create(null, texts.length ? schemaText(texts.join('\n')) : [])
  for (let r = rect.r1; r <= rect.r2; r++) {
    for (let c = rect.c1; c <= rect.c2; c++) {
      g.anchors[r][c] = cellKey(rect.r1, rect.c1)
    }
  }
  return true
}

export function mergeCells(rect: Rect): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    if (!mergeGridRect(g, rect, (t) => [state.schema.text(t)])) return false
    return replaceTable(state, dispatch, ctx, g, { r: rect.r1, c: rect.c1 })
  }
}

export const unmergeCell: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx || !ctx.cell) return false
  const g = cloneGrid(ctx.grid)
  if (!unmergeGridCell(g, ctx.cell.r, ctx.cell.c)) return false
  return replaceTable(state, dispatch, ctx, g, ctx.cell)
}

function unmergeGridCell(g: Grid, r: number, c: number): boolean {
  const k = g.anchors[r][c]
  if (!k) return false
  const rec = g.cells.get(k)
  if (!rec || (rec.colspan === 1 && rec.rowspan === 1)) return false
  const { colspan, rowspan, header, align } = rec
  rec.colspan = 1
  rec.rowspan = 1
  for (let dr = 0; dr < rowspan; dr++) {
    for (let dc = 0; dc < colspan; dc++) {
      if (dr === 0 && dc === 0) continue
      addCell(g, r + dr, c + dc, header, align) // inherit header + align
    }
  }
  return true
}

// ── position-based commands (cell-selection context menu) ───────────────
// Android counterparts: RichTableCell.applyMergeFromSelection,
// applyUnmergeFromSelection, applyDeleteRowsFromSelection, … — all locate
// the table from the selection itself, not the caret.

function ctxAtPos(state: EditorState, tablePos: number): TableContext | null {
  const table = state.doc.nodeAt(tablePos)
  if (!table || table.type.name !== 'table') return null
  return contextAt(state, tablePos, table)
}

export function mergeCellsAt(tablePos: number, rect: Rect): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    if (!mergeGridRect(g, rect, (t) => [state.schema.text(t)])) return false
    return replaceTable(state, dispatch, ctx, g, { r: rect.r1, c: rect.c1 })
  }
}

export function unmergeCellAt(tablePos: number, r: number, c: number): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    if (!unmergeGridCell(g, r, c)) return false
    return replaceTable(state, dispatch, ctx, g, { r, c })
  }
}

export function deleteRowsAt(tablePos: number, rows: number[]): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    if (!deleteRowsFromGrid(g, new Set(rows))) return false
    return replaceTable(state, dispatch, ctx, g, { r: Math.min(Math.min(...rows), g.rows - 1), c: 0 })
  }
}

export function deleteColumnsAt(tablePos: number, cols: number[]): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    if (!deleteColumnsFromGrid(g, new Set(cols))) return false
    return replaceTable(state, dispatch, ctx, g, { r: 0, c: Math.min(Math.min(...cols), g.cols - 1) })
  }
}

export function insertRowAtPos(tablePos: number, index: number, focusC = 0): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    insertRowIntoGrid(g, index)
    return replaceTable(state, dispatch, ctx, g, { r: index, c: focusC })
  }
}

export function insertColumnAtPos(tablePos: number, index: number, focusR = 0): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    insertColumnIntoGrid(g, index)
    return replaceTable(state, dispatch, ctx, g, { r: focusR, c: index })
  }
}

/** Apply header on/off to a set of anchor cells (applyHeaderToggle). */
export function setHeaderOnCells(tablePos: number, anchors: AnchorRC[], header: boolean): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    for (const a of anchors) {
      const rec = g.cells.get(cellKey(a.r, a.c))
      if (rec) rec.header = header
    }
    return replaceTable(state, dispatch, ctx, g, anchors[0] ?? null)
  }
}

export function setAlignOnCells(tablePos: number, anchors: AnchorRC[], align: Align): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    for (const a of anchors) {
      const rec = g.cells.get(cellKey(a.r, a.c))
      if (rec) rec.align = align
    }
    return replaceTable(state, dispatch, ctx, g, anchors[0] ?? null)
  }
}

export function setVAlignOnCells(tablePos: number, anchors: AnchorRC[], valign: VAlign): Command {
  return (state, dispatch) => {
    const ctx = ctxAtPos(state, tablePos)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    for (const a of anchors) {
      const rec = g.cells.get(cellKey(a.r, a.c))
      if (rec) rec.valign = valign
    }
    return replaceTable(state, dispatch, ctx, g, anchors[0] ?? null)
  }
}

// ── flags, caption, alignment, header row ───────────────────────────────

export const toggleBordered: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx) return false
  return replaceTable(state, dispatch, ctx, ctx.grid, ctx.cell, {
    ...ctx.attrs,
    bordered: !ctx.attrs.bordered,
  })
}

export const toggleCompact: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx) return false
  return replaceTable(state, dispatch, ctx, ctx.grid, ctx.cell, {
    ...ctx.attrs,
    compact: !ctx.attrs.compact,
  })
}
    
export const toggleStriped: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx) return false
  return replaceTable(state, dispatch, ctx, ctx.grid, ctx.cell, {
    ...ctx.attrs,
    striped: !ctx.attrs.striped,
  })
}

export function setCellAlign(align: Align): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx || !ctx.cell) return false
    const g = cloneGrid(ctx.grid)
    const k = g.anchors[ctx.cell.r][ctx.cell.c]
    const rec = k && g.cells.get(k)
    if (!rec) return false
    rec.align = align
    return replaceTable(state, dispatch, ctx, g, ctx.cell)
  }
}

export function setCellValign(valign: VAlign): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx || !ctx.cell) return false
    const g = cloneGrid(ctx.grid)
    const k = g.anchors[ctx.cell.r][ctx.cell.c]
    const rec = k && g.cells.get(k)
    if (!rec) return false
    rec.valign = valign
    return replaceTable(state, dispatch, ctx, g, ctx.cell)
  }
}

/** Toggle the first row between header (th) and normal cells. */
export const toggleHeaderRow: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx) return false
  const g = cloneGrid(ctx.grid)
  let anyHeader = false
  for (let c = 0; c < g.cols; c++) {
    const k = g.anchors[0][c]
    if (k && g.cells.get(k)?.header) anyHeader = true
  }
  for (let c = 0; c < g.cols; c++) {
    const k = g.anchors[0][c]
    const rec = k && g.cells.get(k)
    if (rec && rec.r === 0) rec.header = !anyHeader
  }
  return replaceTable(state, dispatch, ctx, g, ctx.cell)
}

export function setTableCaption(text: string): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const caption = text.trim()
      ? N.table_caption.create(null, text ? [state.schema.text(text)] : [])
      : null
    return replaceTable(state, dispatch, ctx, ctx.grid, ctx.cell, undefined, caption)
  }
}

// ── construction & navigation ───────────────────────────────────────────

export function makeTable(rows: number, cols: number, withHeader = true): Node {
  const rowNodes: Node[] = []
  for (let r = 0; r < rows; r++) {
    const cellNodes: Node[] = []
    for (let c = 0; c < cols; c++) {
      const type = r === 0 && withHeader ? N.table_header : N.table_cell
      cellNodes.push(type.create(null, N.paragraph.create()))
    }
    rowNodes.push(N.table_row.create(null, cellNodes))
  }
  // Telegram's table always shows its centered title field — the caption
  // stays empty until the user types (or is deleted to hide it).
  const caption = N.table_caption.create()
  return N.table.create({ bordered: true, compact: false, striped: false }, [caption, ...rowNodes])
}

export function insertTableCmd(rows: number, cols: number): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const { $from } = state.selection
      const after = $from.after(1)
      const table = makeTable(rows, cols)
      let tr = state.tr.insert(after, table)
      tr = tr.insert(after + table.nodeSize, N.paragraph.create())
      const firstCell = anchorCellTextPos(table, after, 0, 0)
      const $pos = tr.doc.resolve(Math.min((firstCell ?? after) + 1, tr.doc.content.size - 1))
      tr = tr.setSelection(TextSelection.near($pos))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Tab / Shift+Tab — move to the next / previous anchor cell (RichTableCellGrid).
 *  Moves the caret only: no table rebuild, so playback and undo history stay
 *  intact between Tab presses. */
export function nextCell(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx || !ctx.cell) return false
    const { r, c } = ctx.cell
    let idx = r * ctx.grid.cols + c + dir
    const total = ctx.grid.rows * ctx.grid.cols
    while (idx >= 0 && idx < total) {
      const rr = Math.floor(idx / ctx.grid.cols)
      const cc = idx % ctx.grid.cols
      const k = ctx.grid.anchors[rr][cc]
      if (k && k === cellKey(rr, cc)) {
        if (!dispatch) return true
        const pos = anchorCellTextPos(ctx.table, ctx.tablePos, rr, cc)
        if (pos === null) return false
        const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size - 1))
        dispatch(state.tr.setSelection(TextSelection.near($pos)).scrollIntoView())
        return true
      }
      idx += dir
    }
    return false
  }
}

export function isInTable(state: EditorState): boolean {
  return findTableContext(state) !== null
}

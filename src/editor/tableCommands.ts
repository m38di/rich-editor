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

import { Command, EditorState, TextSelection } from 'prosemirror-state'
import { Node } from 'prosemirror-model'
import { N, Align, VAlign } from './schema'

interface CellRec {
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

interface Grid {
  rows: number
  cols: number
  /** anchors[r][c] = key of the covering cell, key = `${r}x${c}` of anchor */
  anchors: (string | null)[][]
  cells: Map<string, CellRec>
}

const key = (r: number, c: number) => `${r}x${c}`

// ── grid ⇄ node ─────────────────────────────────────────────────────────

function tableToGrid(table: Node): Grid {
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
      while (occupied.has(key(r, c))) c++
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
        for (let dc = 0; dc < rec.colspan; dc++) occupied.add(key(r + dr, c + dc))
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
    cells.set(key(rec.r, rec.c), rec)
    for (let dr = 0; dr < rec.rowspan; dr++) {
      for (let dc = 0; dc < rec.colspan; dc++) {
        anchors[rec.r + dr][rec.c + dc] = key(rec.r, rec.c)
      }
    }
  }
  return { rows: maxR, cols: maxC, anchors, cells }
}

function gridToTable(grid: Grid, attrs: { bordered: boolean; striped: boolean }, caption: Node | null): Node {
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
  attrs: { bordered: boolean; striped: boolean }
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
    attrs: { bordered: table.attrs.bordered, striped: table.attrs.striped },
    caption,
    cell,
  }
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
    const k = newGrid.anchors[r]?.[c]
    if (k) {
      // walk the new table to find the anchor cell's content start
      let offset = ctx.tablePos + 1 // inside table
      let found = -1
      let row = 0
      newTable.forEach((child) => {
        if (child.type.name !== 'table_row') {
          offset += child.nodeSize
          return
        }
        let col = 0
        child.forEach((cellNode) => {
          const cellKey = key(row, col)
          const start = offset + 1
          if (cellKey === k && found === -1) found = start + 1 // inside paragraph
          offset += cellNode.nodeSize
          col += cellNode.attrs.colspan
        })
        row++
      })
      if (found > 0 && found <= tr.doc.content.size) {
        tr = tr.setSelection(TextSelection.create(tr.doc, Math.min(found, tr.doc.content.size - 1)))
      }
    }
  }
  dispatch(tr.scrollIntoView())
  return true
}

// ── structural operations ───────────────────────────────────────────────

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
  const k = key(r, c)
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
    const newRow: (string | null)[] = Array<string | null>(g.cols).fill(null)
    g.anchors.splice(index, 0, newRow)
    const grown = new Set<string>()
    for (let c = 0; c < g.cols; c++) {
      const below = g.anchors[index + 1]?.[c]
      if (below) {
        const rec = g.cells.get(below)
        if (rec && rec.r > index) {
          // cell starts at/below insertion point → shift its anchor down
          if (!grown.has(below)) {
            rec.r += 1
            grown.add(below)
          }
          g.anchors[index + 1][c] = null // will be re-anchored below
        } else if (rec && rec.r <= index && rec.r + rec.rowspan > index) {
          // spans across the line → grow
          if (!grown.has(below)) {
            rec.rowspan += 1
            grown.add(below)
          }
          g.anchors[index][c] = below
          continue
        }
      }
      if (!g.anchors[index][c]) addCell(g, index, c)
    }
    // re-anchor shifted cells
    for (const k of grown) {
      const rec = g.cells.get(k)
      if (!rec) continue
      for (let dr = 0; dr < rec.rowspan; dr++) {
        for (let dc = 0; dc < rec.colspan; dc++) {
          if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
        }
      }
    }
    g.rows += 1
    return replaceTable(state, dispatch, ctx, g, { r: index, c: ctx.cell?.c ?? 0 })
  }
}

export function insertColumnAt(index: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    for (const row of g.anchors) row.splice(index, 0, null)
    const grown = new Set<string>()
    for (let r = 0; r < g.rows; r++) {
      const right = g.anchors[r]?.[index + 1]
      if (right) {
        const rec = g.cells.get(right)
        if (rec && rec.c > index) {
          if (!grown.has(right)) {
            rec.c += 1
            grown.add(right)
          }
          g.anchors[r][index + 1] = null
        } else if (rec && rec.c <= index && rec.c + rec.colspan > index) {
          if (!grown.has(right)) {
            rec.colspan += 1
            grown.add(right)
          }
          g.anchors[r][index] = right
          continue
        }
      }
      if (!g.anchors[r][index]) addCell(g, r, index)
    }
    for (const k of grown) {
      const rec = g.cells.get(k)
      if (!rec) continue
      for (let dr = 0; dr < rec.rowspan; dr++) {
        for (let dc = 0; dc < rec.colspan; dc++) {
          if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
        }
      }
    }
    g.cols += 1
    return replaceTable(state, dispatch, ctx, g, { r: ctx.cell?.r ?? 0, c: index })
  }
}

export function deleteRows(from: number, to: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    const removed = to - from + 1
    const dead = new Set<string>()
    for (const [k, rec] of g.cells) {
      const start = rec.r
      const end = rec.r + rec.rowspan - 1
      if (start >= from && end <= to) {
        dead.add(k) // fully inside removed range
        continue
      }
      if (end < from) continue // above — untouched
      if (start > to) {
        rec.r -= removed // below — shift up
        continue
      }
      // partial overlap: shrink span, anchor to first kept row
      const overlap = Math.min(end, to) - Math.max(start, from) + 1
      rec.rowspan -= overlap
      if (rec.r >= from && rec.r <= to) rec.r = from
    }
    for (const k of dead) g.cells.delete(k)
    g.anchors.splice(from, removed)
    g.rows -= removed
    // rebuild anchor map from surviving cells
    for (const row of g.anchors) row.fill(null)
    while (g.anchors.length < g.rows) g.anchors.push(Array<string | null>(g.cols).fill(null))
    for (const [k, rec] of g.cells) {
      for (let dr = 0; dr < rec.rowspan; dr++) {
        for (let dc = 0; dc < rec.colspan; dc++) {
          if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
        }
      }
    }
    if (g.rows === 0) return false
    return replaceTable(state, dispatch, ctx, g, { r: Math.min(from, g.rows - 1), c: ctx.cell?.c ?? 0 })
  }
}

export function deleteColumns(from: number, to: number): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    const removed = to - from + 1
    const dead = new Set<string>()
    for (const [k, rec] of g.cells) {
      const start = rec.c
      const end = rec.c + rec.colspan - 1
      if (start >= from && end <= to) {
        dead.add(k)
        continue
      }
      if (end < from) continue
      if (start > to) {
        rec.c -= removed
        continue
      }
      const overlap = Math.min(end, to) - Math.max(start, from) + 1
      rec.colspan -= overlap
      if (rec.c >= from && rec.c <= to) rec.c = from
    }
    for (const k of dead) g.cells.delete(k)
    for (const row of g.anchors) row.splice(from, removed)
    g.cols -= removed
    for (const row of g.anchors) {
      while (row.length < g.cols) row.push(null)
    }
    for (const row of g.anchors) row.fill(null)
    for (const [k, rec] of g.cells) {
      for (let dr = 0; dr < rec.rowspan; dr++) {
        for (let dc = 0; dc < rec.colspan; dc++) {
          if (g.anchors[rec.r + dr]) g.anchors[rec.r + dr][rec.c + dc] = k
        }
      }
    }
    if (g.cols === 0) return false
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

export function mergeCells(rect: Rect): Command {
  return (state, dispatch) => {
    const ctx = findTableContext(state)
    if (!ctx) return false
    const g = cloneGrid(ctx.grid)
    if (!isExactRect(g, rect)) return false
    // concatenate plain texts row-major joined by "\n" (TableModel.mergeCells)
    const texts: string[] = []
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c1; c <= rect.c2; c++) {
        const k = g.anchors[r][c]
        if (k !== key(r, c)) continue
        const rec = g.cells.get(k)
        if (!rec) continue
        let text = ''
        rec.content.forEach((inline) => {
          text += inline.text ?? ''
        })
        if (text) texts.push(text)
        if (k !== key(rect.r1, rect.c1)) g.cells.delete(k)
      }
    }
    const anchorRec = g.cells.get(key(rect.r1, rect.c1))
    if (!anchorRec) return false
    anchorRec.colspan = rect.c2 - rect.c1 + 1
    anchorRec.rowspan = rect.r2 - rect.r1 + 1
    anchorRec.content = N.paragraph.create(null, texts.length ? [state.schema.text(texts.join('\n'))] : [])
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c1; c <= rect.c2; c++) {
        g.anchors[r][c] = key(rect.r1, rect.c1)
      }
    }
    return replaceTable(state, dispatch, ctx, g, { r: rect.r1, c: rect.c1 })
  }
}

export const unmergeCell: Command = (state, dispatch) => {
  const ctx = findTableContext(state)
  if (!ctx || !ctx.cell) return false
  const g = cloneGrid(ctx.grid)
  const k = g.anchors[ctx.cell.r][ctx.cell.c]
  if (!k) return false
  const rec = g.cells.get(k)
  if (!rec || (rec.colspan === 1 && rec.rowspan === 1)) return false
  const { r, c, colspan, rowspan, header, align } = rec
  rec.colspan = 1
  rec.rowspan = 1
  for (let dr = 0; dr < rowspan; dr++) {
    for (let dc = 0; dc < colspan; dc++) {
      if (dr === 0 && dc === 0) continue
      addCell(g, r + dr, c + dc, header, align) // inherit header + align
    }
  }
  return replaceTable(state, dispatch, ctx, g, { r, c })
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
  return N.table.create({ bordered: true, striped: false }, rowNodes)
}

export function insertTableCmd(rows: number, cols: number): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const { $from } = state.selection
      const after = $from.after(1)
      const table = makeTable(rows, cols)
      let tr = state.tr.insert(after, table)
      tr = tr.insert(after + table.nodeSize, N.paragraph.create())
      // focus first body cell
      const firstCell = after + 1 + 1 // table open + row open… resolve safely below
      const $pos = tr.doc.resolve(Math.min(firstCell + 1, tr.doc.content.size - 1))
      tr = tr.setSelection(TextSelection.near($pos))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Tab / Shift+Tab — move to the next / previous anchor cell. */
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
      if (k && k === key(rr, cc)) {
        return replaceTable(state, dispatch, ctx, ctx.grid, { r: rr, c: cc })
      }
      idx += dir
    }
    return false
  }
}

export function isInTable(state: EditorState): boolean {
  return findTableContext(state) !== null
}

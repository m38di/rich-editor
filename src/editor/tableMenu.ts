// src/editor/tableMenu.ts
//
// Port of the cell-selection menu gating from RichEditorListView.java:
//
//   computeCanMerge        → canMerge      (selection exactly covers a rectangle)
//   computeHasSpan         → canUnmerge    (single cell with colspan/rowspan > 1)
//   computeSpansFullRows   → fullRows      (every column of the hit rows selected)
//   computeSpansFullColumns→ fullCols
//   computeAllSelected     → allSelected   (whole table selected)
//   canDeleteRows/Cols     → not all rows/cols, full spans, not the whole table
//   commonHorizontalAlign  → commonAlign   (-1 when mixed)
//   allSelectedHeader      → allHeader     ("Remove highlight" vs "Highlight …")

import { EditorState } from 'prosemirror-state'
import { cellKey, findTableContextAt, Grid, AnchorRC } from './tableCommands'
import { Align, VAlign } from './schema'

/** Web stand-in for MessagesController richMessageMaxTableCols. */
export const MAX_TABLE_COLS = 100

export type HighlightLabel = 'cell' | 'row' | 'column' | 'remove'

export interface TableMenuFlags {
  tablePos: number
  grid: Grid
  /** selected anchor cells in row-major order */
  anchors: AnchorRC[]
  count: number
  canMerge: boolean
  canUnmerge: boolean
  fullRows: boolean
  fullCols: boolean
  allSelected: boolean
  canDeleteRows: boolean
  canDeleteCols: boolean
  canInsertCols: boolean
  commonAlign: Align | null
  commonVAlign: VAlign | null
  allHeader: boolean
  highlightLabel: HighlightLabel
  /** bounding rectangle of the selection (merge target) */
  rect: { r1: number; c1: number; r2: number; c2: number }
}

function parseKey(k: string): AnchorRC {
  const [r, c] = k.split('x')
  return { r: Number(r), c: Number(c) }
}

/** Compute the full flag set for the cell-selection context menu. */
export function computeTableMenuFlags(state: EditorState, cellPos: number[]): TableMenuFlags | null {
  if (cellPos.length === 0) return null
  let ctx = null
  for (const p of cellPos) {
    ctx = findTableContextAt(state, p)
    if (ctx) break
  }
  if (!ctx) return null
  const g = ctx.grid

  // doc pos → anchor coords by content identity (contextAt's technique)
  const keys = new Set<string>()
  for (const p of cellPos) {
    const node = state.doc.nodeAt(p)
    if (!node || (node.type.name !== 'table_cell' && node.type.name !== 'table_header')) continue
    outer: for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const k = g.anchors[r][c]
        if (k && g.cells.get(k)?.content === node.firstChild) {
          keys.add(k)
          break outer
        }
      }
    }
  }
  if (keys.size === 0) return null

  const anchors: AnchorRC[] = Array.from(keys).map(parseKey).sort((a, b) => a.r - b.r || a.c - b.c)
  const n = anchors.length

  // computeCanMerge
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1
  for (const a of anchors) {
    const rec = g.cells.get(cellKey(a.r, a.c))!
    minR = Math.min(minR, a.r); minC = Math.min(minC, a.c)
    maxR = Math.max(maxR, a.r + rec.rowspan - 1); maxC = Math.max(maxC, a.c + rec.colspan - 1)
  }
  const covered = new Set<string>()
  let inBounds = true
  for (let r = minR; r <= maxR && inBounds; r++) {
    for (let c = minC; c <= maxC && inBounds; c++) {
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) { inBounds = false; break }
      const k = g.anchors[r][c]
      if (k) covered.add(k)
    }
  }
  const canMerge = n >= 2 && inBounds && covered.size === keys.size && sameSet(covered, keys)

  // computeHasSpan
  const firstRec = g.cells.get(cellKey(anchors[0].r, anchors[0].c))!
  const canUnmerge = n === 1 && (firstRec.colspan > 1 || firstRec.rowspan > 1)

  // computeSpansFullRows / FullColumns
  const rowsHit = new Set(anchors.map((a) => a.r))
  const colsHit = new Set(anchors.map((a) => a.c))
  let fullRows = rowsHit.size > 0
  for (const r of rowsHit) {
    if (r < 0 || r >= g.rows) { fullRows = false; break }
    for (let c = 0; c < g.cols; c++) {
      const k = g.anchors[r][c]
      if (!k || parseKey(k).r !== r || !keys.has(k)) { fullRows = false; break }
    }
    if (!fullRows) break
  }
  let fullCols = colsHit.size > 0
  for (const c of colsHit) {
    if (c < 0 || c >= g.cols) { fullCols = false; break }
    for (let r = 0; r < g.rows; r++) {
      const k = g.anchors[r][c]
      if (!k || parseKey(k).c !== c || !keys.has(k)) { fullCols = false; break }
    }
    if (!fullCols) break
  }

  // computeAllSelected
  const all = new Set<string>()
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const k = g.anchors[r][c]
      if (k) all.add(k)
    }
  }
  const allSelected = all.size > 0 && sameSet(all, keys)

  const canDeleteRows = fullRows && !allSelected && rowsHit.size < g.rows
  const canDeleteCols = fullCols && !allSelected && colsHit.size < g.cols
  const canInsertCols = fullCols && g.cols < MAX_TABLE_COLS

  // commonHorizontalAlign / commonVerticalAlign
  let commonAlign: Align | null = null
  let commonVAlign: VAlign | null = null
  let mixedA = false
  let mixedV = false
  for (const a of anchors) {
    const rec = g.cells.get(cellKey(a.r, a.c))!
    if (commonAlign === null && !mixedA) commonAlign = rec.align
    else if (commonAlign !== rec.align) { mixedA = true; commonAlign = null }
    if (commonVAlign === null && !mixedV) commonVAlign = rec.valign
    else if (commonVAlign !== rec.valign) { mixedV = true; commonVAlign = null }
  }

  const allHeader = anchors.every((a) => g.cells.get(cellKey(a.r, a.c))!.header)
  const highlightLabel: HighlightLabel = allHeader
    ? 'remove'
    : fullCols
      ? 'column'
      : fullRows
        ? 'row'
        : 'cell'

  return {
    tablePos: ctx.tablePos,
    grid: g,
    anchors,
    count: n,
    canMerge,
    canUnmerge,
    fullRows,
    fullCols,
    allSelected,
    canDeleteRows,
    canDeleteCols,
    canInsertCols,
    commonAlign,
    commonVAlign,
    allHeader,
    highlightLabel,
    rect: { r1: minR, c1: minC, r2: maxR, c2: maxC },
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/** Distinct hit rows/columns of a selection (for delete/insert operations). */
export function distinctRows(anchors: AnchorRC[]): number[] {
  return Array.from(new Set(anchors.map((a) => a.r)))
}

export function distinctCols(anchors: AnchorRC[]): number[] {
  return Array.from(new Set(anchors.map((a) => a.c)))
}

/** Insert index above/below the selection (applyInsertRowFromSelection). */
export function insertRowIndex(anchors: AnchorRC[], grid: Grid, above: boolean): number {
  if (above) return Math.min(...anchors.map((a) => a.r))
  let idx = 0
  for (const a of anchors) {
    const rec = grid.cells.get(cellKey(a.r, a.c))!
    idx = Math.max(idx, a.r + rec.rowspan)
  }
  return idx
}

/** Insert index left/right of the selection (applyInsertColumnFromSelection). */
export function insertColumnIndex(anchors: AnchorRC[], grid: Grid, left: boolean): number {
  if (left) return Math.min(...anchors.map((a) => a.c))
  let idx = 0
  for (const a of anchors) {
    const rec = grid.cells.get(cellKey(a.r, a.c))!
    idx = Math.max(idx, a.c + rec.colspan)
  }
  return idx
}

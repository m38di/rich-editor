// src/components/TableCellMenu.tsx
//
// The cell-selection context menu — web counterpart of
// RichEditorListView.showTableCellMenu(). A compact popup anchored above
// the topmost selected cell (below the bottom-most one when there is no
// room), with the exact Telegram gating:
//
//   · alignment section always present (applies live, menu stays open)
//   · Highlight cell/row/column ⇄ Remove highlight      — always present
//   · Merge cells      — ≥2 cells, exact rectangular cover
//   · Split cell       — exactly 1 cell with colspan/rowspan > 1
//   · Insert column left/right — full-column selection
//   · Insert row above/below  — full-row selection
//   · Delete column/row — full span but not the whole table
//   · Delete table      — every cell selected
//
// Every row action exits cell-selection mode afterwards, exactly like the
// Android menu (exitCellSelectionMode in each callback).

import { useEffect, useLayoutEffect, useState } from 'react'
import { Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import {
  computeTableMenuFlags,
  distinctRows,
  distinctCols,
  insertRowIndex,
  insertColumnIndex,
} from '../editor/tableMenu'
import {
  mergeCellsAt,
  unmergeCellAt,
  deleteRowsAt,
  deleteColumnsAt,
  insertRowAtPos,
  insertColumnAtPos,
  setHeaderOnCells,
  setAlignOnCells,
  setVAlignOnCells,
} from '../editor/tableCommands'
import { clearTableSelection } from '../editor/plugins'
import { Iv } from './ivIcons'

interface Props {
  viewRef: React.MutableRefObject<EditorView | null>
  /** doc positions of the selected cells */
  cellPos: number[]
  onClose: () => void
}

const EST_ROW_H = 48
const EST_BASE_H = 68 // paddings + alignment section

interface Anchor {
  top: number
  left: number
  below: boolean
}

export function TableCellMenu({ viewRef, cellPos, onClose }: Props) {
  const view = viewRef.current
  const [, setTick] = useState(0)
  const flags = view ? computeTableMenuFlags(view.state, cellPos) : null
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  // Anchor above the topmost-leftmost selected cell (tableMenuAnchor);
  // below the bottom-most-leftmost when there is no room above.
  useLayoutEffect(() => {
    if (!view || !flags || cellPos.length === 0) {
      setAnchor(null)
      return
    }
    let topCell: { top: number; left: number; bottom: number } | null = null
    let botCell: { top: number; left: number; bottom: number } | null = null
    for (const p of cellPos) {
      const dom = view.nodeDOM(p)
      if (!(dom instanceof HTMLElement)) continue
      const r = dom.getBoundingClientRect()
      if (!topCell || r.top < topCell.top - 1 || (Math.abs(r.top - topCell.top) <= 1 && r.left < topCell.left)) {
        topCell = { top: r.top, left: r.left, bottom: r.bottom }
      }
      if (!botCell || r.bottom > botCell.bottom + 1 || (Math.abs(r.bottom - botCell.bottom) <= 1 && r.left < botCell.left)) {
        botCell = { top: r.top, left: r.left, bottom: r.bottom }
      }
    }
    if (!topCell || !botCell) {
      setAnchor(null)
      return
    }
    const est = EST_BASE_H + actionRowCount(flags) * EST_ROW_H
    const roomAbove = topCell.top - est - 8 >= 8
    setAnchor(
      roomAbove
        ? { top: topCell.top - est - 8, left: topCell.left, below: false }
        : { top: botCell.bottom + 8, left: botCell.left, below: true },
    )
    // recompute when the table reflows (row heights change with the menu's
    // own actions is fine — the menu closes then anyway)
  }, [cellPos, flags?.count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        exit()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!flags || !anchor) return null

  const dispatch = (cmd: Command) => {
    const v = viewRef.current
    if (!v) return
    cmd(v.state, (tr) => v.dispatch(tr))
    // the menu stays open across align clicks (Telegram behavior) — force a
    // re-render so the recomputed common-align moves the `.on` highlight
    setTick((t) => t + 1)
  }

  /** Run an action then leave cell-selection mode (Android exitCellSelectionMode). */
  const act = (cmd: Command) => {
    dispatch(cmd)
    exit()
  }

  const exit = () => {
    const v = viewRef.current
    if (v) clearTableSelection(v)
    onClose()
  }

  const f = flags
  const alignBtn = (
    icon: string,
    title: string,
    on: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`re-ctx-align-btn${on ? ' on' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Iv name={icon} size={17} />
    </button>
  )

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 268))

  return (
    <>
      <div className="re-ctx-backdrop" onMouseDown={exit} onContextMenu={(e) => { e.preventDefault(); exit() }} />
      <div
        className="re-ctx-menu animate-pop-in"
        style={{ top: anchor.top, left }}
        role="menu"
      >
        <div className="re-ctx-title">Alignment</div>
        <div className="re-ctx-align-row">
          {alignBtn('align_horiz_left', 'Align left', f.commonAlign === 'left', () =>
            dispatch(setAlignOnCells(f.tablePos, f.anchors, 'left')))}
          {alignBtn('align_horiz_middle', 'Align center', f.commonAlign === 'center', () =>
            dispatch(setAlignOnCells(f.tablePos, f.anchors, 'center')))}
          {alignBtn('align_horiz_right', 'Align right', f.commonAlign === 'right', () =>
            dispatch(setAlignOnCells(f.tablePos, f.anchors, 'right')))}
          <span className="re-ctx-align-gap" />
          {alignBtn('align_vert_top', 'Align top', f.commonVAlign === 'top', () =>
            dispatch(setVAlignOnCells(f.tablePos, f.anchors, 'top')))}
          {alignBtn('align_vert_middle', 'Align middle', f.commonVAlign === 'middle', () =>
            dispatch(setVAlignOnCells(f.tablePos, f.anchors, 'middle')))}
          {alignBtn('align_vert_bottom', 'Align bottom', f.commonVAlign === 'bottom', () =>
            dispatch(setVAlignOnCells(f.tablePos, f.anchors, 'bottom')))}
        </div>

        <div className="re-ctx-sep" />

        <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
          onClick={() => act(setHeaderOnCells(f.tablePos, f.anchors, !f.allHeader))}>
          <Iv name={f.allHeader ? 'table_highlight_remove' : 'table_highlight'} size={18} />
          <span>{highlightText(f.highlightLabel)}</span>
        </button>

        {f.canMerge && (
          <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
            onClick={() => act(mergeCellsAt(f.tablePos, f.rect))}>
            <Iv name="table_merge" size={18} />
            <span>Merge cells</span>
          </button>
        )}
        {f.canUnmerge && (
          <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
            onClick={() => act(unmergeCellAt(f.tablePos, f.anchors[0].r, f.anchors[0].c))}>
            <Iv name="table_unmerge" size={18} />
            <span>Split cell</span>
          </button>
        )}
        {f.canInsertCols && (
          <>
            <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
              onClick={() => act(insertColumnAtPos(f.tablePos, insertColumnIndex(f.anchors, f.grid, true)))}>
              <Iv name="table_insert_left" size={18} />
              <span>Insert column left</span>
            </button>
            <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
              onClick={() => act(insertColumnAtPos(f.tablePos, insertColumnIndex(f.anchors, f.grid, false)))}>
              <Iv name="table_insert_right" size={18} />
              <span>Insert column right</span>
            </button>
          </>
        )}
        {f.fullRows && (
          <>
            <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
              onClick={() => act(insertRowAtPos(f.tablePos, insertRowIndex(f.anchors, f.grid, true)))}>
              <Iv name="table_insert_top" size={18} />
              <span>Insert row above</span>
            </button>
            <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
              onClick={() => act(insertRowAtPos(f.tablePos, insertRowIndex(f.anchors, f.grid, false)))}>
              <Iv name="table_insert_bottom" size={18} />
              <span>Insert row below</span>
            </button>
          </>
        )}
        {f.canDeleteCols && (
          <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
            onClick={() => act(deleteColumnsAt(f.tablePos, distinctCols(f.anchors)))}>
            <Iv name="table_remove" size={18} />
            <span>Delete column{distinctCols(f.anchors).length > 1 ? 's' : ''}</span>
          </button>
        )}
        {f.canDeleteRows && (
          <button type="button" className="re-ctx-row" onMouseDown={(e) => e.preventDefault()}
            onClick={() => act(deleteRowsAt(f.tablePos, distinctRows(f.anchors)))}>
            <Iv name="table_remove" size={18} />
            <span>Delete row{distinctRows(f.anchors).length > 1 ? 's' : ''}</span>
          </button>
        )}
        {f.allSelected && (
          <button type="button" className="re-ctx-row danger" onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const v = viewRef.current
              if (!v) return
              const table = v.state.doc.nodeAt(f.tablePos)
              if (table) {
                exit()
                v.dispatch(v.state.tr.delete(f.tablePos, f.tablePos + table.nodeSize))
              }
            }}>
            <Iv name="table_remove" size={18} />
            <span>Delete table</span>
          </button>
        )}
      </div>
    </>
  )
}

function actionRowCount(f: NonNullable<ReturnType<typeof computeTableMenuFlags>>): number {
  return (
    1 + // highlight
    (f.canMerge ? 1 : 0) +
    (f.canUnmerge ? 1 : 0) +
    (f.canInsertCols ? 2 : 0) +
    (f.fullRows ? 2 : 0) +
    (f.canDeleteCols ? 1 : 0) +
    (f.canDeleteRows ? 1 : 0) +
    (f.allSelected ? 1 : 0)
  )
}

function highlightText(label: 'cell' | 'row' | 'column' | 'remove'): string {
  switch (label) {
    case 'remove': return 'Remove highlight'
    case 'column': return 'Highlight column'
    case 'row': return 'Highlight row'
    default: return 'Highlight cell'
  }
}

// src/editor/groupedLayout.ts
//
// Faithful TypeScript port of Telegram's grouped-media layout:
//
//   RichMessageLayout.computeGrouped(float[] ratios)   — the album algorithm
//   RichMediaCell.computeGeometry(int w)               — rects + slide height
//
// Both run in a 1000-unit-wide coordinate space; dp(n) == n px on the web.

export interface GroupedPos {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** width in 1/1000 of the container */
  pw: number
  /** height as a fraction of maxSizeHeight (814) */
  ph: number
  aspectRatio: number
  flags: number
}

export const FLAG_LEFT = 1
export const FLAG_RIGHT = 2
export const FLAG_TOP = 4
export const FLAG_BOTTOM = 8

const MAX_SIZE_WIDTH = 1000
const MAX_SIZE_HEIGHT = 814.0

/** Telegram multiHeight: height of a run of items sharing one line. */
function multiHeight(array: number[], start: number, end: number): number {
  let sum = 0
  for (let a = start; a < end; a++) sum += array[a]
  return MAX_SIZE_WIDTH / Math.max(0.0001, sum)
}

function set(
  p: GroupedPos,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  w: number,
  h: number,
  flags: number,
): void {
  p.minX = minX
  p.maxX = maxX
  p.minY = minY
  p.maxY = maxY
  p.pw = w
  p.ph = h
  p.flags = flags
}

/**
 * Port of RichMessageLayout.computeGrouped. `minDisplaySide` is the smaller
 * side of the viewport in px (Android: min(displaySize.x, displaySize.y)).
 */
export function computeGrouped(ratios: number[], minDisplaySide: number): GroupedPos[] {
  const count = ratios.length
  const arr: GroupedPos[] = []
  if (count === 0) return arr

  const proportionsBuilder: string[] = []
  let averageAspectRatio = 0
  let forceCalc = false
  for (let i = 0; i < count; ++i) {
    const ar = ratios[i] <= 0 ? 1 : ratios[i]
    arr[i] = { minX: 0, maxX: 0, minY: 0, maxY: 0, pw: 0, ph: 0, aspectRatio: ar, flags: 0 }
    if (ar > 1.2) proportionsBuilder.push('w')
    else if (ar < 0.8) proportionsBuilder.push('n')
    else proportionsBuilder.push('q')
    averageAspectRatio += ar
    if (ar > 2.0) forceCalc = true
  }
  const proportions = proportionsBuilder.join('')
  averageAspectRatio /= count

  const minHeight = 120
  const minWidth = Math.trunc(120 / (minDisplaySide / MAX_SIZE_WIDTH))
  const paddingsWidth = Math.trunc(40 / (minDisplaySide / MAX_SIZE_WIDTH))
  const maxAspectRatio = MAX_SIZE_WIDTH / MAX_SIZE_HEIGHT
  const minH = 100 / MAX_SIZE_HEIGHT

  if (count === 1) {
    set(
      arr[0], 0, 0, 0, 0, MAX_SIZE_WIDTH,
      Math.round(Math.min(MAX_SIZE_WIDTH / arr[0].aspectRatio, MAX_SIZE_HEIGHT / 2.0)) / MAX_SIZE_HEIGHT,
      FLAG_LEFT | FLAG_RIGHT | FLAG_TOP | FLAG_BOTTOM,
    )
    return arr
  }

  if (!forceCalc && (count === 2 || count === 3 || count === 4)) {
    if (count === 2) {
      const p1 = arr[0], p2 = arr[1]
      if (proportions === 'ww' && averageAspectRatio > 1.4 * maxAspectRatio && p1.aspectRatio - p2.aspectRatio < 0.2) {
        const height = Math.round(Math.min(MAX_SIZE_WIDTH / p1.aspectRatio, Math.min(MAX_SIZE_WIDTH / p2.aspectRatio, MAX_SIZE_HEIGHT / 2.0))) / MAX_SIZE_HEIGHT
        set(p1, 0, 0, 0, 0, MAX_SIZE_WIDTH, height, FLAG_LEFT | FLAG_RIGHT | FLAG_TOP)
        set(p2, 0, 0, 1, 1, MAX_SIZE_WIDTH, height, FLAG_LEFT | FLAG_RIGHT | FLAG_BOTTOM)
      } else if (proportions === 'ww' || proportions === 'qq') {
        const width = Math.trunc(MAX_SIZE_WIDTH / 2)
        const height = Math.round(Math.min(width / p1.aspectRatio, Math.min(width / p2.aspectRatio, MAX_SIZE_HEIGHT))) / MAX_SIZE_HEIGHT
        set(p1, 0, 0, 0, 0, width, height, FLAG_LEFT | FLAG_BOTTOM | FLAG_TOP)
        set(p2, 1, 1, 0, 0, width, height, FLAG_RIGHT | FLAG_BOTTOM | FLAG_TOP)
      } else {
        let secondWidth = Math.trunc(Math.max(0.4 * MAX_SIZE_WIDTH, Math.round((MAX_SIZE_WIDTH / p1.aspectRatio) / (1.0 / p1.aspectRatio + 1.0 / p2.aspectRatio))))
        let firstWidth = MAX_SIZE_WIDTH - secondWidth
        if (firstWidth < minWidth) { const diff = minWidth - firstWidth; firstWidth = minWidth; secondWidth -= diff }
        const height = Math.min(MAX_SIZE_HEIGHT, Math.round(Math.min(firstWidth / p1.aspectRatio, secondWidth / p2.aspectRatio))) / MAX_SIZE_HEIGHT
        set(p1, 0, 0, 0, 0, firstWidth, height, FLAG_LEFT | FLAG_BOTTOM | FLAG_TOP)
        set(p2, 1, 1, 0, 0, secondWidth, height, FLAG_RIGHT | FLAG_BOTTOM | FLAG_TOP)
      }
    } else if (count === 3) {
      const p1 = arr[0], p2 = arr[1], p3 = arr[2]
      if (proportions.charAt(0) === 'n') {
        const thirdHeight = Math.min(MAX_SIZE_HEIGHT * 0.5, Math.round((p2.aspectRatio * MAX_SIZE_WIDTH) / (p3.aspectRatio + p2.aspectRatio)))
        const secondHeight = MAX_SIZE_HEIGHT - thirdHeight
        const rightWidth = Math.trunc(Math.max(minWidth, Math.min(MAX_SIZE_WIDTH * 0.5, Math.round(Math.min(thirdHeight * p3.aspectRatio, secondHeight * p2.aspectRatio)))))
        const leftWidth = Math.trunc(Math.min(MAX_SIZE_HEIGHT * p1.aspectRatio + paddingsWidth, MAX_SIZE_WIDTH - rightWidth))
        set(p1, 0, 0, 0, 1, leftWidth, 1.0, FLAG_LEFT | FLAG_BOTTOM | FLAG_TOP)
        set(p2, 1, 1, 0, 0, rightWidth, secondHeight / MAX_SIZE_HEIGHT, FLAG_RIGHT | FLAG_TOP)
        set(p3, 1, 1, 1, 1, rightWidth, thirdHeight / MAX_SIZE_HEIGHT, FLAG_RIGHT | FLAG_BOTTOM)
      } else {
        const firstHeight = Math.round(Math.min(MAX_SIZE_WIDTH / p1.aspectRatio, MAX_SIZE_HEIGHT * 0.66)) / MAX_SIZE_HEIGHT
        set(p1, 0, 1, 0, 0, MAX_SIZE_WIDTH, firstHeight, FLAG_LEFT | FLAG_RIGHT | FLAG_TOP)
        const width = Math.trunc(MAX_SIZE_WIDTH / 2)
        let secondHeight = Math.min(MAX_SIZE_HEIGHT - firstHeight, Math.round(Math.min(width / p2.aspectRatio, width / p3.aspectRatio))) / MAX_SIZE_HEIGHT
        if (secondHeight < minH) secondHeight = minH
        set(p2, 0, 0, 1, 1, width, secondHeight, FLAG_LEFT | FLAG_BOTTOM)
        set(p3, 1, 1, 1, 1, width, secondHeight, FLAG_RIGHT | FLAG_BOTTOM)
      }
    } else {
      const p1 = arr[0], p2 = arr[1], p3 = arr[2], p4 = arr[3]
      if (proportions.charAt(0) === 'w') {
        const h0 = Math.round(Math.min(MAX_SIZE_WIDTH / p1.aspectRatio, MAX_SIZE_HEIGHT * 0.66)) / MAX_SIZE_HEIGHT
        set(p1, 0, 2, 0, 0, MAX_SIZE_WIDTH, h0, FLAG_LEFT | FLAG_RIGHT | FLAG_TOP)
        let h = Math.round(MAX_SIZE_WIDTH / (p2.aspectRatio + p3.aspectRatio + p4.aspectRatio))
        let w0 = Math.trunc(Math.max(minWidth, Math.min(MAX_SIZE_WIDTH * 0.4, h * p2.aspectRatio)))
        let w2 = Math.trunc(Math.max(Math.max(minWidth, MAX_SIZE_WIDTH * 0.33), h * p4.aspectRatio))
        let w1 = MAX_SIZE_WIDTH - w0 - w2
        if (w1 < 58) { const diff = 58 - w1; w1 = 58; w0 -= Math.trunc(diff / 2); w2 -= diff - Math.trunc(diff / 2) }
        h = Math.min(MAX_SIZE_HEIGHT - h0, h)
        h /= MAX_SIZE_HEIGHT
        if (h < minH) h = minH
        set(p2, 0, 0, 1, 1, w0, h, FLAG_LEFT | FLAG_BOTTOM)
        set(p3, 1, 1, 1, 1, w1, h, FLAG_BOTTOM)
        set(p4, 2, 2, 1, 1, w2, h, FLAG_RIGHT | FLAG_BOTTOM)
      } else {
        const w = Math.max(minWidth, Math.round(MAX_SIZE_HEIGHT / (1.0 / p2.aspectRatio + 1.0 / p3.aspectRatio + 1.0 / p4.aspectRatio)))
        const h0 = Math.min(0.33, Math.max(minHeight, w / p2.aspectRatio) / MAX_SIZE_HEIGHT)
        const h1 = Math.min(0.33, Math.max(minHeight, w / p3.aspectRatio) / MAX_SIZE_HEIGHT)
        const h2 = 1.0 - h0 - h1
        const w0 = Math.round(Math.min(MAX_SIZE_HEIGHT * p1.aspectRatio + paddingsWidth, MAX_SIZE_WIDTH - w))
        set(p1, 0, 0, 0, 2, w0, h0 + h1 + h2, FLAG_LEFT | FLAG_TOP | FLAG_BOTTOM)
        set(p2, 1, 1, 0, 0, w, h0, FLAG_RIGHT | FLAG_TOP)
        set(p3, 1, 1, 1, 1, w, h1, FLAG_RIGHT)
        set(p4, 1, 1, 2, 2, w, h2, FLAG_RIGHT | FLAG_BOTTOM)
      }
    }
    return arr
  }

  const croppedRatios: number[] = new Array(count)
  for (let a = 0; a < count; ++a) {
    const ar = arr[a].aspectRatio
    if (averageAspectRatio > 1.1) croppedRatios[a] = Math.max(1.0, ar)
    else croppedRatios[a] = Math.min(1.0, ar)
    croppedRatios[a] = Math.max(0.66667, Math.min(1.7, croppedRatios[a]))
  }

  const attemptCounts: number[][] = []
  const attemptHeights: number[][] = []
  for (let firstLine = 1; firstLine < count; ++firstLine) {
    const secondLine = count - firstLine
    if (firstLine > 3 || secondLine > 3) continue
    attemptCounts.push([firstLine, secondLine])
    attemptHeights.push([
      multiHeight(croppedRatios, 0, firstLine),
      multiHeight(croppedRatios, firstLine, count),
    ])
  }
  for (let firstLine = 1; firstLine < count - 1; ++firstLine) {
    for (let secondLine = 1; secondLine < count - firstLine; ++secondLine) {
      const thirdLine = count - firstLine - secondLine
      if (firstLine > 3 || secondLine > (averageAspectRatio < 0.85 ? 4 : 3) || thirdLine > 3) continue
      attemptCounts.push([firstLine, secondLine, thirdLine])
      attemptHeights.push([
        multiHeight(croppedRatios, 0, firstLine),
        multiHeight(croppedRatios, firstLine, firstLine + secondLine),
        multiHeight(croppedRatios, firstLine + secondLine, count),
      ])
    }
  }
  for (let firstLine = 1; firstLine < count - 2; ++firstLine) {
    for (let secondLine = 1; secondLine < count - firstLine; ++secondLine) {
      for (let thirdLine = 1; thirdLine < count - firstLine - secondLine; ++thirdLine) {
        const fourthLine = count - firstLine - secondLine - thirdLine
        if (firstLine > 3 || secondLine > 3 || thirdLine > 3 || fourthLine > 3) continue
        attemptCounts.push([firstLine, secondLine, thirdLine, fourthLine])
        attemptHeights.push([
          multiHeight(croppedRatios, 0, firstLine),
          multiHeight(croppedRatios, firstLine, firstLine + secondLine),
          multiHeight(croppedRatios, firstLine + secondLine, firstLine + secondLine + thirdLine),
          multiHeight(croppedRatios, firstLine + secondLine + thirdLine, count),
        ])
      }
    }
  }

  let optimalIdx = -1
  let optimalDiff = 0
  const targetHeight = (MAX_SIZE_WIDTH / 3) * 4
  for (let a = 0; a < attemptCounts.length; ++a) {
    let height = 0
    let minLineH = Number.MAX_VALUE
    const hs = attemptHeights[a]
    const cs = attemptCounts[a]
    for (const v of hs) { height += v; if (v < minLineH) minLineH = v }
    let diff = Math.abs(height - targetHeight)
    if (cs.length > 1 && (cs[0] > cs[1] || (cs.length > 2 && cs[1] > cs[2]) || (cs.length > 3 && cs[2] > cs[3]))) diff *= 1.2
    if (minLineH < minWidth) diff *= 1.5
    if (optimalIdx === -1 || diff < optimalDiff) { optimalIdx = a; optimalDiff = diff }
  }
  if (optimalIdx === -1) {
    for (let a = 0; a < count; ++a) {
      set(arr[a], 0, 0, a, a, MAX_SIZE_WIDTH, 0.4, FLAG_LEFT | FLAG_RIGHT)
    }
    return arr
  }

  const cs = attemptCounts[optimalIdx]
  const hs = attemptHeights[optimalIdx]
  let index = 0
  for (let i = 0; i < cs.length; ++i) {
    const c = cs[i]
    const lineHeight = hs[i]
    let spanLeft = MAX_SIZE_WIDTH
    let fixIdx = -1
    for (let k = 0; k < c; ++k) {
      const ratio = croppedRatios[index]
      const width = Math.trunc(ratio * lineHeight)
      spanLeft -= width
      let flags = 0
      if (i === 0) flags |= FLAG_TOP
      if (i === cs.length - 1) flags |= FLAG_BOTTOM
      if (k === 0) flags |= FLAG_LEFT
      if (k === c - 1) { flags |= FLAG_RIGHT; fixIdx = index }
      set(arr[index], k, k, i, i, width, Math.max(minH, lineHeight / MAX_SIZE_HEIGHT), flags)
      index++
    }
    if (fixIdx >= 0) arr[fixIdx].pw += spanLeft
  }
  return arr
}

// ── gallery geometry (RichMediaCell.computeGeometry) ─────────────────────

export interface GalleryRect {
  left: number
  top: number
  width: number
  height: number
}

export interface GalleryGeometry {
  /** collage rect per item, gap-adjusted, in px */
  collage: GalleryRect[]
  /** total collage height in px */
  collageH: number
  slideW: number
  slideH: number
}

const GAP = 2
const DEFAULT_HEIGHT = 200

/**
 * Port of RichMediaCell.computeGeometry. `w` is the container width in px;
 * `maxDisplaySide` is the larger viewport side (displaySize.x/y max).
 */
export function computeGalleryGeometry(
  w: number,
  ratios: number[],
  maxDisplaySide: number,
  minDisplaySide = maxDisplaySide,
): GalleryGeometry {
  const collage: GalleryRect[] = []
  const n = ratios.length
  if (n === 0) {
    return { collage, collageH: DEFAULT_HEIGHT, slideW: w, slideH: DEFAULT_HEIGHT }
  }
  if (n === 1) {
    const ar = ratios[0] > 0 ? ratios[0] : 1
    let width = w
    let height: number
    const maxH = maxDisplaySide * 0.55
    if (maxH > 0) {
      height = Math.round(width / ar)
      if (height > maxH) {
        height = maxH
        width = Math.round(height * ar)
      }
    } else {
      height = DEFAULT_HEIGHT
    }
    const left = (w - width) / 2
    collage.push({ left, top: 0, width, height })
    return { collage, collageH: height, slideW: width, slideH: height }
  }

  const positions = computeGrouped(ratios, minDisplaySide)

  let maxRow = 0
  for (const p of positions) maxRow = Math.max(maxRow, p.maxY)

  const rowH: number[] = new Array(maxRow + 1).fill(0)
  for (const p of positions) {
    if (p.minY === p.maxY) rowH[p.minY] = Math.max(rowH[p.minY], p.ph)
  }
  for (const p of positions) {
    if (p.minY !== p.maxY) {
      const span = p.maxY - p.minY + 1
      const per = p.ph / span
      for (let r = p.minY; r <= p.maxY; ++r) rowH[r] = Math.max(rowH[r], per)
    }
  }

  const pixelMaxHeight = maxDisplaySide * 0.5
  const rowYPx: number[] = new Array(maxRow + 2)
  let acc = 0
  for (let r = 0; r <= maxRow; ++r) {
    rowYPx[r] = Math.round(acc * pixelMaxHeight)
    acc += rowH[r]
  }
  rowYPx[maxRow + 1] = Math.round(acc * pixelMaxHeight)

  for (let i = 0; i < positions.length; ++i) {
    const p = positions[i]
    const yPx = rowYPx[p.minY]
    let hPx = rowYPx[p.maxY + 1] - yPx

    let xPx: number
    let leftUnits = 0
    for (let j = 0; j < positions.length; ++j) {
      if (j === i) continue
      const q = positions[j]
      if (q.minY <= p.minY && q.maxY >= p.minY && q.minX < p.minX) leftUnits += q.pw
    }
    xPx = Math.round((leftUnits * w) / MAX_SIZE_WIDTH)

    let wPx: number
    if ((p.flags & FLAG_RIGHT) !== 0) {
      wPx = w - xPx
    } else {
      wPx = Math.round((p.pw * w) / MAX_SIZE_WIDTH)
      wPx -= GAP
    }
    if ((p.flags & FLAG_BOTTOM) === 0) hPx -= GAP

    collage.push({
      left: xPx,
      top: yPx,
      width: Math.max(0, wPx),
      height: Math.max(0, hPx),
    })
  }

  const collageH = rowYPx[maxRow + 1]

  const slideW = w
  let avg = 0
  for (let i = 0; i < n; i++) avg += ratios[i] > 0 ? ratios[i] : 1
  avg /= n
  let sh = slideW / Math.max(0.5, avg)
  const maxH = maxDisplaySide * 0.55
  if (sh > maxH) sh = maxH

  return { collage, collageH, slideW, slideH: sh }
}

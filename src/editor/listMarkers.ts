// src/editor/listMarkers.ts
//
// Nested bullet markers — Telegram cycles disc → circle → square by depth:
//   parent ●   child ◦   grandchild ▪   (repeating every 3 levels)
// Inline styles are applied after every transaction because plain CSS
// selectors can't express the modulo cycle past the third level.

const BULLET_STYLES = ['disc', 'circle', 'square'] as const

export function updateBulletMarkers(root: HTMLElement): void {
  root.querySelectorAll<HTMLUListElement>('ul').forEach((ul) => {
    if (ul.classList.contains('task-list')) return // checkboxes, not bullets
    let depth = 0
    let parent = ul.parentElement

    while (parent) {
      if (parent.tagName === 'UL' && !parent.classList.contains('task-list')) {
        depth++
      }

      parent = parent.parentElement
    }

    ul.style.listStyleType = BULLET_STYLES[depth % BULLET_STYLES.length]
  })
}

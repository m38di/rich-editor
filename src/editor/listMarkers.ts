const BULLET_STYLES = ['disc', 'circle', 'square'] as const

export function updateBulletMarkers(root: HTMLElement) {
  root.querySelectorAll<HTMLUListElement>('ul').forEach((ul) => {
    let depth = 0
    let parent = ul.parentElement

    while (parent) {
      if (parent.tagName === 'UL') {
        depth++
      }
      parent = parent.parentElement
    }

    ul.dataset.marker = BULLET_STYLES[depth % BULLET_STYLES.length]
  })
}

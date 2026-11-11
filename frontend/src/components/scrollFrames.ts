/** How far the page has scrolled through a tall section, from 0 (its top reaches the top of the screen) to 1 (its end reaches the bottom). */
export function scrollProgress(top: number, height: number, viewport: number) {
  const distance = height - viewport
  return distance <= 0 ? 0 : Math.min(1, Math.max(0, -top / distance))
}

/** The picture to show at a given progress: its index and how far (0 to 1) the next picture has faded in over it. */
export function frameAt(progress: number, count: number) {
  if (count <= 1) return { index: 0, mix: 0 }
  const position = Math.min(1, Math.max(0, progress)) * (count - 1)
  const index = Math.min(count - 2, Math.floor(position))
  return { index, mix: position - index }
}

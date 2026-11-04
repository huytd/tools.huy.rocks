/**
 * Pan and zoom for the preview. Drag (or scroll) to pan; ⌘/Ctrl + scroll or pinch to zoom.
 * Until the person moves the view, it keeps the diagram fitted to the pane.
 */
export interface Viewport {
  setSize(width: number, height: number): void
  fit(): void
  zoomBy(factor: number): void
  actualSize(): void
  /** Re-apply the current view, e.g. after the content's size changed. */
  refresh(): void
  readonly scale: number
  readonly moved: boolean
  /** Fit again on the next setSize, e.g. after switching examples. */
  reset(): void
  destroy(): void
}

const MIN = 0.05
const MAX = 8
const PAD = 32

export interface ViewportOptions {
  /**
   * Take over part of the zoom by resizing the content itself (sharper than a CSS scale for
   * images). Receives the zoom level and returns the scale still to apply as a transform.
   */
  applyScale?: (scale: number) => number
  /** How far fitting may enlarge small content (default 1: never past actual size). */
  maxFit?: number
}

export function createViewport(pane: HTMLElement, stage: HTMLElement, onChange: () => void, opts: ViewportOptions = {}): Viewport {
  let x = 0
  let y = 0
  let k = 1
  let w = 0
  let h = 0
  let moved = false

  const apply = () => {
    const rest = opts.applyScale ? opts.applyScale(k) : k
    stage.style.transform = `translate(${x}px, ${y}px) scale(${rest})`
    onChange()
  }

  function fit() {
    if (!w || !h) return
    const W = pane.clientWidth
    const H = pane.clientHeight
    k = Math.min(opts.maxFit ?? 1, (W - PAD * 2) / w, (H - PAD * 2) / h)
    k = Math.max(MIN, k)
    x = (W - w * k) / 2
    y = Math.max(PAD, (H - h * k) / 2)
    if (h * k > H - PAD * 2) y = PAD
    moved = false
    apply()
  }

  function zoomAt(px: number, py: number, factor: number) {
    const nk = Math.min(MAX, Math.max(MIN, k * factor))
    x = px - ((px - x) * nk) / k
    y = py - ((py - y) * nk) / k
    k = nk
    moved = true
    apply()
  }

  const center = () => [pane.clientWidth / 2, pane.clientHeight / 2] as const

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const r = pane.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinches arrive as ctrl+wheel with small deltas.
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0045))
    } else {
      const unit = e.deltaMode === 1 ? 16 : 1
      x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit
      y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit
      moved = true
      apply()
    }
  }

  let drag: { id: number; sx: number; sy: number; x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('a, button, input, .wb-overlay')) return
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x, y }
    pane.setPointerCapture(e.pointerId)
    pane.classList.add('is-panning')
  }
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    x = drag.x + e.clientX - drag.sx
    y = drag.y + e.clientY - drag.sy
    moved = true
    apply()
  }
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    drag = null
    pane.classList.remove('is-panning')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === '+' || e.key === '=') zoomAt(...center(), 1.25)
    else if (e.key === '-' || e.key === '_') zoomAt(...center(), 0.8)
    else if (e.key === '0') fit()
    else if (e.key === '1') vp.actualSize()
    else return
    e.preventDefault()
  }

  pane.addEventListener('wheel', onWheel, { passive: false })
  pane.addEventListener('pointerdown', onDown)
  pane.addEventListener('pointermove', onMove)
  pane.addEventListener('pointerup', onUp)
  pane.addEventListener('pointercancel', onUp)
  pane.addEventListener('keydown', onKey)
  pane.addEventListener('dblclick', (e) => {
    if (!(e.target as Element).closest('.wb-overlay, .wb-zoom')) fit()
  })
  const ro = new ResizeObserver(() => {
    if (!moved) fit()
  })
  ro.observe(pane)

  const vp: Viewport = {
    setSize(nw, nh) {
      const first = !w
      w = nw
      h = nh
      if (first || !moved) fit()
    },
    fit,
    zoomBy: (f) => zoomAt(...center(), f),
    actualSize() {
      const [cx, cy] = center()
      zoomAt(cx, cy, 1 / k)
      if (w * k <= pane.clientWidth) x = (pane.clientWidth - w) / 2
      if (h * k <= pane.clientHeight) y = (pane.clientHeight - h) / 2
      apply()
    },
    refresh: () => apply(),
    get scale() {
      return k
    },
    get moved() {
      return moved
    },
    reset() {
      moved = false
    },
    destroy() {
      ro.disconnect()
      pane.removeEventListener('wheel', onWheel)
    },
  }
  return vp
}

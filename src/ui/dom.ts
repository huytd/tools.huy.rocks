type Child = Node | string | null | undefined | false
type Attrs = Record<string, unknown>

/** Tiny hyperscript helper. `html:` sets innerHTML, `on*` binds listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'html') el.innerHTML = String(v)
    else if (k === 'class') el.className = String(v)
    else if (k === 'dataset') Object.assign(el.dataset, v as object)
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  for (const c of children) {
    if (c == null || c === false) continue
    el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return el
}

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const modKey = isMac ? '⌘' : 'Ctrl'

/** Keyboard shortcut label, e.g. kbd('mod+s') → "⌘S". */
export function kbd(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      const k = p.toLowerCase()
      if (k === 'mod') return isMac ? '⌘' : 'Ctrl+'
      if (k === 'shift') return isMac ? '⇧' : 'Shift+'
      if (k === 'alt') return isMac ? '⌥' : 'Alt+'
      return p.length === 1 ? p.toUpperCase() : p
    })
    .join('')
}

let toastTimer: number | undefined
export function toast(message: string, ms = 2200) {
  let el = document.querySelector<HTMLElement>('.toast')
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' })
    document.body.append(el)
  }
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms)
}

export interface MenuItem {
  label: string
  icon?: string
  hint?: string
  description?: string
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
}
export type MenuEntry = MenuItem | 'separator' | { heading: string }

let openMenu: { close: () => void } | null = null

/** Popover menu anchored under an element. Arrow keys + Enter, Esc closes. */
export function showMenu(anchor: HTMLElement, entries: MenuEntry[], opts: { align?: 'left' | 'right'; className?: string } = {}) {
  openMenu?.close()
  const menu = h('div', { class: `menu ${opts.className ?? ''}`, role: 'menu' })
  const items: HTMLButtonElement[] = []
  for (const e of entries) {
    if (e === 'separator') {
      menu.append(h('div', { class: 'menu-sep', role: 'separator' }))
      continue
    }
    if ('heading' in e) {
      menu.append(h('div', { class: 'menu-heading' }, e.heading))
      continue
    }
    const btn = h(
      'button',
      { class: 'menu-item', role: 'menuitem', disabled: e.disabled },
      e.icon ? h('span', { class: 'menu-icon', html: e.icon }) : null,
      h(
        'span',
        { class: 'menu-label' },
        h('span', {}, e.label),
        e.description ? h('span', { class: 'menu-desc' }, e.description) : null,
      ),
      e.checked ? h('span', { class: 'menu-check', html: '✓' }) : null,
      e.hint ? h('span', { class: 'menu-hint' }, e.hint) : null,
    )
    btn.addEventListener('click', () => {
      close()
      e.onSelect?.()
    })
    btn.addEventListener('mouseenter', () => btn.focus({ preventScroll: true }))
    items.push(btn)
    menu.append(btn)
  }
  document.body.append(menu)

  const r = anchor.getBoundingClientRect()
  const mw = menu.offsetWidth
  let left = opts.align === 'right' ? r.right - mw : r.left
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8))
  menu.style.left = `${left}px`
  menu.style.top = `${r.bottom + 6}px`
  anchor.setAttribute('aria-expanded', 'true')

  const onKey = (ev: KeyboardEvent) => {
    const idx = items.indexOf(document.activeElement as HTMLButtonElement)
    if (ev.key === 'Escape') {
      ev.preventDefault()
      close()
      anchor.focus()
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      const enabled = items.filter((b) => !b.disabled)
      const cur = enabled.indexOf(items[idx])
      const next = ev.key === 'ArrowDown' ? cur + 1 : cur - 1
      enabled[(next + enabled.length) % enabled.length]?.focus()
    }
  }
  const onDown = (ev: PointerEvent) => {
    if (!menu.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) close()
  }
  function close() {
    menu.remove()
    anchor.setAttribute('aria-expanded', 'false')
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('blur', close)
    if (openMenu === handle) openMenu = null
  }
  const handle = { close }
  openMenu = handle
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onDown, true)
  window.addEventListener('blur', close)
  requestAnimationFrame(() => items.find((b) => !b.disabled)?.focus({ preventScroll: true }))
  return handle
}

export function toggleMenu(anchor: HTMLElement, build: () => MenuEntry[], opts?: Parameters<typeof showMenu>[2]) {
  if (anchor.getAttribute('aria-expanded') === 'true') {
    openMenu?.close()
    return
  }
  showMenu(anchor, build(), opts)
}

export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const hr = Math.round(m / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

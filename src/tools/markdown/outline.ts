import type { Editor } from '@tiptap/core'
import { h } from '../../ui/dom'

interface Entry {
  level: number
  text: string
  pos: number
}

/** "Contents" panel listing the document's headings, with the current section marked. */
export function createOutline(editor: Editor, opts: { onNavigate?: () => void } = {}) {
  const list = h('ol', { class: 'outline-list' })
  const el = h('nav', { class: 'md-outline', 'aria-label': 'Contents' }, h('div', { class: 'outline-head' }, 'Contents'), list)
  let entries: Entry[] = []
  let items: HTMLAnchorElement[] = []
  let active = -1
  let signature = ''
  let rebuildTimer: number | undefined
  let frame = 0

  const headingDom = (e: Entry) => {
    try {
      return editor.view.nodeDOM(e.pos) as HTMLElement | null
    } catch {
      return null
    }
  }

  function rebuild() {
    if (editor.isDestroyed) return
    const next: Entry[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const text = node.textContent.trim()
        if (text) next.push({ level: node.attrs.level, text, pos })
        return false
      }
      // Headings only live at the top level or inside blockquotes and lists.
      return !node.isTextblock
    })
    entries = next
    const sig = next.map((e) => `${e.level}:${e.text}`).join('\n')
    if (sig !== signature) {
      signature = sig
      render()
    }
    spy()
  }

  function render() {
    list.innerHTML = ''
    el.classList.toggle('is-empty', !entries.length)
    if (!entries.length) {
      list.append(h('li', { class: 'outline-empty' }, 'Headings you add will show up here.'))
      items = []
      active = -1
      return
    }
    const min = Math.min(...entries.map((e) => e.level))
    items = entries.map((e, i) => {
      const a = h('a', { class: 'outline-item', href: '#', title: e.text, style: `--depth:${Math.min(e.level - min, 4)}` }, e.text)
      a.addEventListener('click', (ev) => {
        ev.preventDefault()
        go(i)
      })
      list.append(h('li', {}, a))
      return a
    })
    active = -1
  }

  function go(i: number) {
    const dom = headingDom(entries[i])
    if (!dom) return
    dom.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    setActive(i)
    opts.onNavigate?.()
  }

  function setActive(i: number) {
    if (i === active) return
    items[active]?.classList.remove('is-active')
    active = i
    const a = items[i]
    if (!a) return
    a.classList.add('is-active')
    // Keep the current entry visible in a long outline.
    const top = a.offsetTop - list.offsetTop
    if (top < el.scrollTop || top + a.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top - el.clientHeight / 2
    }
  }

  /** The current section is the last heading above a line just under the top bar. */
  function spy() {
    if (!items.length) return
    const line = 120
    let current = 0
    for (let i = 0; i < entries.length; i++) {
      const dom = headingDom(entries[i])
      if (!dom) continue
      if (dom.getBoundingClientRect().top <= line) current = i
      else break
    }
    // At the very bottom, the last heading may never reach the line.
    const s = document.scrollingElement!
    if (s.scrollTop + s.clientHeight >= s.scrollHeight - 2) {
      for (let i = entries.length - 1; i > current; i--) {
        const r = headingDom(entries[i])?.getBoundingClientRect()
        if (r && r.top < window.innerHeight) {
          current = i
          break
        }
      }
    }
    setActive(current)
  }

  const onScroll = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      spy()
    })
  }
  const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
    if (!transaction.docChanged) return
    clearTimeout(rebuildTimer)
    rebuildTimer = window.setTimeout(rebuild, 150)
  }
  editor.on('transaction', onTransaction)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  rebuild()

  return {
    el,
    refresh: rebuild,
    destroy() {
      clearTimeout(rebuildTimer)
      cancelAnimationFrame(frame)
      editor.off('transaction', onTransaction)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      el.remove()
    },
  }
}

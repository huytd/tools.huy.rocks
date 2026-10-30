import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { h } from '../../ui/dom'

type Mermaid = typeof import('mermaid').default

const isMermaid = (n: PMNode) => n.type.name === 'codeBlock' && n.attrs.language === 'mermaid'

// ---------- Rendering (lazy-loaded, one diagram at a time) ----------
let lib: Promise<Mermaid> | null = null
let queue: Promise<unknown> = Promise.resolve()
let seq = 0
let configured = ''

const isDark = () => {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t === 'dark'
  return matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Mermaid sizes each label in a scratch element on <body>, so the font has to be named
 * (not inherited) and loaded first, or the label boxes won't fit the text as displayed.
 */
function renderDiagram(code: string, fontFamily: string): Promise<string> {
  lib ??= import('mermaid').then((m) => m.default)
  const job = queue.then(async () => {
    const [mermaid] = await Promise.all([
      lib!,
      document.fonts.load(`16px ${fontFamily}`).catch(() => {}),
      document.fonts.load(`bold 16px ${fontFamily}`).catch(() => {}),
    ])
    const theme = isDark() ? 'dark' : 'neutral'
    if (configured !== `${theme}|${fontFamily}`) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily })
      configured = `${theme}|${fontFamily}`
    }
    const id = `md-mermaid-${++seq}`
    try {
      return (await mermaid.render(id, code)).svg
    } finally {
      // Mermaid can leave its scratch element behind when a diagram fails to parse.
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  })
  queue = job.catch(() => {})
  return job
}

// Re-render every diagram when the theme changes, or when a font finishes loading late.
const views = new Set<() => void>()
const rerenderAll = () => views.forEach((fn) => fn())
new MutationObserver(rerenderAll).observe(document.documentElement, { attributeFilter: ['data-theme'] })
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerenderAll)
document.fonts.addEventListener('loadingdone', rerenderAll)

/** Code block whose `mermaid` fences show the rendered diagram; the source appears while the cursor is inside. */
export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const code = h('code')
      const pre = h('pre', {}, code)
      const setLang = (n: PMNode) => (code.className = n.attrs.language ? `language-${n.attrs.language}` : '')
      setLang(node)
      if (!isMermaid(node)) {
        return {
          dom: pre,
          contentDOM: code,
          update(n) {
            if (n.type !== node.type || isMermaid(n)) return false
            setLang(n)
            return true
          },
        }
      }

      const view = h('div', { class: 'md-mermaid-view', contenteditable: 'false' })
      const dom = h('div', { class: 'md-mermaid' }, pre, view)
      let source: string | null = null
      let timer: number | undefined
      let token = 0

      const draw = async (text: string) => {
        const mine = ++token
        if (!text.trim()) {
          view.innerHTML = ''
          view.append(h('span', { class: 'md-mermaid-note' }, 'Empty diagram'))
          dom.classList.add('is-empty')
          dom.classList.remove('has-error')
          return
        }
        try {
          const svg = await renderDiagram(text, getComputedStyle(view).fontFamily)
          if (mine !== token) return
          view.innerHTML = svg
          dom.classList.remove('has-error', 'is-empty')
        } catch (err) {
          if (mine !== token) return
          const msg = String((err as Error)?.message ?? err).trim()
          view.innerHTML = ''
          view.append(h('div', { class: 'md-mermaid-error' }, msg || 'Invalid diagram'))
          dom.classList.add('has-error')
          dom.classList.remove('is-empty')
        }
      }
      const schedule = (text: string, immediate = false) => {
        if (text === source) return
        source = text
        clearTimeout(timer)
        if (immediate) draw(text)
        else timer = window.setTimeout(() => draw(text), 300)
      }
      const redraw = () => {
        source = null
        schedule(node.textContent, true)
      }
      schedule(node.textContent, true)
      views.add(redraw)

      // Clicking the diagram puts the cursor into its source.
      view.addEventListener('mousedown', (e) => {
        if (!editor.isEditable) return
        const pos = getPos()
        if (typeof pos !== 'number') return
        e.preventDefault()
        editor.chain().focus().setTextSelection(pos + node.nodeSize - 1).run()
      })

      return {
        dom,
        contentDOM: code,
        update(n) {
          if (n.type !== node.type || !isMermaid(n)) return false
          node = n
          schedule(n.textContent)
          return true
        },
        stopEvent: (e) => view.contains(e.target as Node),
        // Only the code text is ProseMirror's; class changes and the rendered SVG are ours.
        ignoreMutation: (m) => m.type !== 'selection' && !code.contains(m.target),
        destroy() {
          clearTimeout(timer)
          views.delete(redraw)
        },
      }
    }
  },
})

/** Marks the mermaid block that holds the cursor so its source is shown. */
export const MermaidEditing = Extension.create({
  name: 'mermaidEditing',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('mermaidEditing'),
        props: {
          decorations(state) {
            const { $from, $to } = state.selection
            for (let d = $from.depth; d > 0; d--) {
              const n = $from.node(d)
              if (!isMermaid(n)) continue
              if ($to.pos > $from.end(d)) break
              const start = $from.before(d)
              return DecorationSet.create(state.doc, [Decoration.node(start, start + n.nodeSize, { class: 'is-editing' })])
            }
            return DecorationSet.empty
          },
        },
      }),
    ]
  },
})

export const MERMAID_SAMPLE = `flowchart LR
  A[Write markdown] --> B{Looks right?}
  B -- Yes --> C[Ship it]
  B -- No --> A`

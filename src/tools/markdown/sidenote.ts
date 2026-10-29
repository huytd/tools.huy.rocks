import { Node, type Editor, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { h } from '../../ui/dom'
import { icon } from '../../ui/icons'

/*
 * Side notes are stored as markdown footnotes:
 *
 *   Some claim.[^1]
 *
 *   [^1]: The note text.
 *
 * Definitions are lifted out of the body before parsing (so each reference can
 * carry its note), and written back at the end of the document on save.
 */

let defs: Map<string, string> | null = null
let pendingEdit: string | null = null

const DEF = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

/** Remove referenced footnote definitions from `md`. */
function extractNotes(md: string): { body: string; notes: Map<string, string> } {
  const lines = md.split('\n')
  const found: Array<{ id: string; text: string; from: number; to: number }> = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i])
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }
    const m = DEF.exec(lines[i])
    if (!m) continue
    const text = [m[2]]
    let j = i + 1
    while (j < lines.length && /^(?: {2,}|\t)\S/.test(lines[j])) text.push(lines[j++].trim())
    found.push({ id: m[1], text: text.join('\n').trim(), from: i, to: j })
    i = j - 1
  }
  const notes = new Map<string, string>()
  if (!found.length) return { body: md, notes }
  const drop = new Set<number>()
  const rest = lines.filter((_, i) => !found.some((d) => i >= d.from && i < d.to)).join('\n')
  for (const d of found) {
    // Leave definitions nothing points at exactly as they are.
    if (!rest.includes(`[^${d.id}]`) || notes.has(d.id)) continue
    notes.set(d.id, d.text)
    for (let i = d.from; i < d.to; i++) drop.add(i)
  }
  return { body: lines.filter((_, i) => !drop.has(i)).join('\n'), notes }
}

/** Parse markdown with `parse`, turning footnotes into side notes. */
export function parseWithNotes(md: string, parse: (md: string) => JSONContent): JSONContent {
  const { body, notes } = extractNotes(md)
  defs = notes
  try {
    return parse(body)
  } finally {
    defs = null
  }
}

/** Serialize with `serialize`, appending a footnote definition per side note. */
export function serializeWithNotes(doc: JSONContent, serialize: (doc: JSONContent) => string): string {
  const notes = new Map<string, string>()
  const used = new Set<string>()
  collectIds(doc, used)
  let next = nextNumber(used)
  const walk = (n: JSONContent): JSONContent => {
    if (n.type === 'sidenote') {
      let id = String(n.attrs?.id ?? '')
      const text = String(n.attrs?.content ?? '')
      // Two notes sharing a label but not a text (e.g. a pasted copy that was edited) need their own.
      if (!id || (notes.has(id) && notes.get(id) !== text)) id = String(next++)
      notes.set(id, text)
      return { ...n, attrs: { ...n.attrs, id } }
    }
    return n.content ? { ...n, content: n.content.map(walk) } : n
  }
  const out = walk(doc)
  const body = serialize(out)
  if (!notes.size) return body
  const lines = [...notes].map(([id, text]) => {
    const [first, ...more] = text.replace(/\n\s*\n/g, '\n').split('\n')
    return [`[^${id}]: ${first}`, ...more.map((l) => `    ${l}`)].join('\n')
  })
  return `${body.replace(/\s+$/, '')}\n\n${lines.join('\n')}\n`
}

function collectIds(n: JSONContent, into: Set<string>) {
  if (n.type === 'sidenote' && n.attrs?.id) into.add(String(n.attrs.id))
  n.content?.forEach((c) => collectIds(c, into))
}

function nextNumber(used: Set<string>): number {
  let max = 0
  for (const id of used) if (/^\d+$/.test(id)) max = Math.max(max, Number(id))
  return max + 1
}

/** Insert a side note after the selection and open it for editing. */
export function addSidenote(editor: Editor, at = editor.state.selection.to): boolean {
  const $pos = editor.state.doc.resolve(at)
  if (!$pos.parent.inlineContent || $pos.parent.type.spec.code) return false
  const used = new Set<string>()
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'sidenote' && n.attrs.id) used.add(String(n.attrs.id))
  })
  const id = String(nextNumber(used))
  pendingEdit = id
  return editor
    .chain()
    .focus()
    .insertContentAt(at, { type: 'sidenote', attrs: { id, content: '' } })
    .run()
}

export const Sidenote = Node.create({
  name: 'sidenote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-id') },
      content: { default: '', parseHTML: (el) => el.getAttribute('data-content') ?? '' },
    }
  },
  parseHTML() {
    return [{ tag: 'sup[data-sidenote]' }]
  },
  renderHTML({ node }) {
    return ['sup', { 'data-sidenote': '', 'data-id': node.attrs.id, 'data-content': node.attrs.content, title: node.attrs.content }, '*']
  },
  renderText: ({ node }) => ` (${node.attrs.content})`,

  markdownTokenName: 'sidenote',
  markdownTokenizer: {
    name: 'sidenote',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenize(src) {
      const m = /^\[\^([^\]\s]+)\]/.exec(src)
      if (!m || !defs?.has(m[1])) return
      return { type: 'sidenote', raw: m[0], id: m[1], text: defs.get(m[1])! }
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('sidenote', { id: token.id, content: token.text ?? '' }),
  renderMarkdown: (node) => `[^${node.attrs?.id}]`,

  addKeyboardShortcuts() {
    return { 'Mod-Alt-m': ({ editor }) => addSidenote(editor) }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const text = h('span', { class: 'sidenote-text' })
      const remove = h('button', {
        class: 'sidenote-remove',
        type: 'button',
        title: 'Remove side note',
        'aria-label': 'Remove side note',
        html: icon('x', 12),
      })
      const box = h('span', { class: 'sidenote-box' }, text, remove)
      const ref = h('sup', { class: 'sidenote-ref', title: 'Side note' })
      const dom = h('span', { class: 'sidenote', contenteditable: 'false' }, ref, box)
      let input: HTMLTextAreaElement | null = null

      const show = (n: PMNode) => {
        text.textContent = n.attrs.content || 'Empty note'
        text.classList.toggle('is-placeholder', !n.attrs.content)
      }
      show(node)

      const pos = () => {
        try {
          const p = getPos()
          return typeof p === 'number' ? p : null
        } catch {
          return null
        }
      }
      const removeNode = () => {
        input = null
        const p = pos()
        if (p == null) return
        editor.chain().focus().deleteRange({ from: p, to: p + 1 }).run()
      }
      const commit = (value: string | null) => {
        if (!input) return
        const ta = input
        input = null
        ta.remove()
        text.hidden = false
        dom.classList.remove('is-editing')
        const p = pos()
        if (p == null) return
        const content = (value ?? node.attrs.content).trim()
        if (!content) return removeNode()
        if (content !== node.attrs.content) {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(p, undefined, { ...node.attrs, content }))
        }
      }
      // In the margin the note is always visible; inline (narrow pages) the number toggles it.
      const inMargin = () => {
        const cs = getComputedStyle(box)
        return cs.display !== 'none' && cs.float !== 'none'
      }
      // Put the cursor right after the note, synchronously so the next keystroke lands in the text.
      const backToText = () => {
        const p = pos()
        if (p == null || editor.isDestroyed) return
        editor.view.focus()
        editor.commands.setTextSelection(p + 1)
      }
      const edit = () => {
        if (input || !editor.isEditable) return
        if (!inMargin()) dom.classList.add('is-open')
        dom.classList.add('is-editing')
        const ta = h('textarea', {
          class: 'sidenote-input',
          rows: '1',
          placeholder: `Write a note… (Enter to save)`,
          spellcheck: 'true',
        })
        input = ta
        ta.value = node.attrs.content
        text.hidden = true
        box.insertBefore(ta, remove)
        const fit = () => {
          ta.style.height = 'auto'
          ta.style.height = `${ta.scrollHeight}px`
        }
        ta.addEventListener('input', fit)
        ta.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
            e.preventDefault()
            commit(e.key === 'Enter' ? ta.value : null)
            backToText()
          }
        })
        ta.addEventListener('blur', () => commit(ta.value))
        fit()
        ta.focus()
        ta.setSelectionRange(ta.value.length, ta.value.length)
      }

      ref.addEventListener('mousedown', (e) => e.preventDefault())
      ref.addEventListener('click', () => {
        if (inMargin()) edit()
        else if (input) input.focus()
        else dom.classList.toggle('is-open')
      })
      text.addEventListener('click', edit)
      remove.addEventListener('mousedown', (e) => e.preventDefault())
      remove.addEventListener('click', removeNode)

      if (pendingEdit === node.attrs.id) {
        pendingEdit = null
        requestAnimationFrame(edit)
      }

      return {
        dom,
        update(n) {
          if (n.type !== node.type) return false
          node = n
          if (!input) show(n)
          return true
        },
        stopEvent: (e) => box.contains(e.target as globalThis.Node) || ref.contains(e.target as globalThis.Node),
        ignoreMutation: () => true,
      }
    }
  },
})

import { Editor, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { BubbleMenu } from '@tiptap/extension-bubble-menu'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { createLowlight, common } from 'lowlight'
import { SlashCommand } from './slash'
import { h, isMac } from '../../ui/dom'
import { icon } from '../../ui/icons'

export interface EditorHooks {
  onChange(): void
  /** Turn a relative image src into a displayable URL (blob:) or null. */
  resolveImage(src: string): Promise<string | null>
  /** Mod+click on a link, or any click while read-only. */
  openLink(href: string): void
}

const lowlight = createLowlight(common)
const isExternal = (src: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)

/** Image node that keeps the original markdown src but displays a resolved URL. */
function localImage(hooks: EditorHooks) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement('img')
        img.draggable = false
        let current = ''
        const apply = (n: typeof node) => {
          img.alt = n.attrs.alt ?? ''
          img.title = n.attrs.title ?? ''
          const src: string = n.attrs.src ?? ''
          if (src === current) return
          current = src
          img.classList.remove('is-broken')
          if (!src || isExternal(src)) {
            img.src = src
            return
          }
          img.removeAttribute('src')
          hooks.resolveImage(src).then((url) => {
            if (current !== src) return
            if (url) img.src = url
            else img.classList.add('is-broken')
          })
        }
        img.addEventListener('error', () => img.classList.add('is-broken'))
        let latest = node
        apply(node)
        // Re-resolve when folder access is granted later.
        const onAssets = () => {
          current = ''
          apply(latest)
        }
        window.addEventListener('md:assets', onAssets)
        return {
          dom: img,
          update(n) {
            if (n.type !== node.type) return false
            latest = n
            apply(n)
            return true
          },
          destroy() {
            window.removeEventListener('md:assets', onAssets)
          },
        }
      }
    },
  }).configure({ inline: false, allowBase64: true })
}

// ---------- Highlight blocks that changed on an external reload ----------
const flashKey = new PluginKey<DecorationSet>('mdFlash')
const FlashChanges = Extension.create({
  name: 'flashChanges',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: flashKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(flashKey) as DecorationSet | undefined
            return next ?? set.map(tr.mapping, tr.doc)
          },
        },
        props: { decorations: (state) => flashKey.getState(state) },
      }),
    ]
  },
})

function changedBlocks(before: PMNode, after: PMNode): Decoration[] {
  const pool = new Map<string, number>()
  before.forEach((n) => pool.set(n.toString(), (pool.get(n.toString()) ?? 0) + 1))
  const decos: Decoration[] = []
  after.forEach((n, offset) => {
    const k = n.toString()
    const left = pool.get(k) ?? 0
    if (left > 0) pool.set(k, left - 1)
    else decos.push(Decoration.node(offset, offset + n.nodeSize, { class: 'md-flash' }))
  })
  // Don't light up the whole page on a full rewrite.
  return decos.length > Math.max(6, after.childCount * 0.6) ? [] : decos
}

function buildBubble(getEditor: () => Editor) {
  const el = h('div', { class: 'bubble' })
  const marks: Array<{ name: string; icon: Parameters<typeof icon>[0]; title: string; run: (e: Editor) => void }> = [
    { name: 'bold', icon: 'bold', title: `Bold (${isMac ? '⌘' : 'Ctrl+'}B)`, run: (e) => e.chain().focus().toggleBold().run() },
    { name: 'italic', icon: 'italic', title: `Italic (${isMac ? '⌘' : 'Ctrl+'}I)`, run: (e) => e.chain().focus().toggleItalic().run() },
    { name: 'strike', icon: 'strike', title: 'Strikethrough', run: (e) => e.chain().focus().toggleStrike().run() },
    { name: 'code', icon: 'inlineCode', title: `Inline code (${isMac ? '⌘' : 'Ctrl+'}E)`, run: (e) => e.chain().focus().toggleCode().run() },
  ]
  const buttons = marks.map((m) => {
    const b = h('button', { class: 'bubble-btn', title: m.title, 'aria-label': m.title, html: icon(m.icon, 15), type: 'button' })
    b.addEventListener('mousedown', (ev) => ev.preventDefault())
    b.addEventListener('click', () => {
      m.run(getEditor())
      sync()
    })
    return { m, b }
  })
  const linkBtn = h('button', { class: 'bubble-btn', title: 'Link', 'aria-label': 'Link', html: icon('link', 15), type: 'button' })
  linkBtn.addEventListener('mousedown', (ev) => ev.preventDefault())
  const linkInput = h('input', { class: 'bubble-input', type: 'url', placeholder: 'Paste link, Enter to apply', spellcheck: 'false' })
  const tools = h('div', { class: 'bubble-tools' }, ...buttons.map((x) => x.b), h('span', { class: 'bubble-sep' }), linkBtn)
  el.append(tools, linkInput)

  linkBtn.addEventListener('click', () => {
    const e = getEditor()
    el.classList.add('is-link')
    linkInput.value = e.getAttributes('link').href ?? ''
    linkInput.focus()
    linkInput.select()
  })
  const closeLink = () => el.classList.remove('is-link')
  linkInput.addEventListener('keydown', (ev) => {
    const e = getEditor()
    if (ev.key === 'Enter') {
      ev.preventDefault()
      const href = linkInput.value.trim()
      const c = e.chain().focus().extendMarkRange('link')
      ;(href ? c.setLink({ href }) : c.unsetLink()).run()
      closeLink()
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      closeLink()
      e.commands.focus()
    }
  })
  linkInput.addEventListener('blur', closeLink)

  function sync() {
    const e = getEditor()
    for (const { m, b } of buttons) b.classList.toggle('is-active', e.isActive(m.name))
    linkBtn.classList.toggle('is-active', e.isActive('link'))
  }
  return { el, sync }
}

export function createEditor(mount: HTMLElement, hooks: EditorHooks) {
  let editor!: Editor
  const bubble = buildBubble(() => editor)

  editor = new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
      }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null, enableTabIndentation: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      localImage(hooks),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? `Heading ${node.attrs.level}` : "Write something, or type '/' for commands…",
        includeChildren: false,
      }),
      BubbleMenu.configure({
        element: bubble.el,
        appendTo: () => document.body,
        options: { strategy: 'fixed', placement: 'top', offset: 8, flip: true, shift: { padding: 8 } },
        shouldShow: ({ editor: e, state, from, to }) => {
          if (!e.isEditable || from === to) return false
          if (state.selection instanceof NodeSelection) return false
          if (e.isActive('codeBlock')) return false
          return state.doc.textBetween(from, to).trim().length > 0
        },
      }),
      SlashCommand,
      FlashChanges,
      Markdown.configure({ indentation: { style: 'space', size: 2 }, markedOptions: { gfm: true } }),
    ],
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      handleDOMEvents: {
        click: (view, event) => {
          const a = (event.target as HTMLElement).closest('a')
          if (!a || !view.dom.contains(a)) return false
          const href = a.getAttribute('href')
          if (!href) return false
          if (event.metaKey || event.ctrlKey || !view.editable) {
            event.preventDefault()
            hooks.openLink(href)
            return true
          }
          return false
        },
      },
    },
    onUpdate: () => hooks.onChange(),
    onSelectionUpdate: () => bubble.sync(),
    onTransaction: () => bubble.sync(),
  })

  let flashTimer: number | undefined

  /** Replace content from markdown without firing onChange. */
  function setMarkdown(md: string, opts: { external?: boolean } = {}) {
    const scroller = document.scrollingElement!
    const scrollTop = scroller.scrollTop
    const hadFocus = editor.isFocused
    const { from, to } = editor.state.selection
    const before = editor.state.doc

    editor.commands.setContent(md, { contentType: 'markdown', emitUpdate: false })

    if (hadFocus) {
      const max = editor.state.doc.content.size
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
    }
    scroller.scrollTop = scrollTop
    if (opts.external) {
      const decos = changedBlocks(before, editor.state.doc)
      if (decos.length) {
        const view = editor.view
        view.dispatch(view.state.tr.setMeta(flashKey, DecorationSet.create(view.state.doc, decos)).setMeta('addToHistory', false))
        clearTimeout(flashTimer)
        flashTimer = window.setTimeout(() => {
          if (!editor.isDestroyed)
            view.dispatch(view.state.tr.setMeta(flashKey, DecorationSet.empty).setMeta('addToHistory', false))
        }, 1900)
      }
    }
  }

  return {
    editor,
    setMarkdown,
    getMarkdown: () => tidy(editor.getMarkdown()),
    destroy: () => {
      editor.destroy()
      bubble.el.remove()
    },
  }
}

/** Collapse runs of blank lines (outside code fences) left by some serializers. */
export function tidy(md: string): string {
  const out: string[] = []
  let fence: string | null = null
  let blank = 0
  for (const line of md.split('\n')) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
      out.push(line)
      continue
    }
    if (m) fence = m[1]
    if (line.trim() === '') {
      if (++blank > 1) continue
    } else blank = 0
    out.push(line)
  }
  return out.join('\n')
}

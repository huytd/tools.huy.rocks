import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { h } from '../../ui/dom'
import { icon, type IconName } from '../../ui/icons'
import { MERMAID_SAMPLE } from './mermaid'
import { addSidenote } from './sidenote'

interface SlashItem {
  title: string
  hint: string
  icon: IconName
  keywords: string
  markdown: string
  run: (editor: Editor, range: Range) => void
}

const chain = (e: Editor, r: Range) => e.chain().focus().deleteRange(r)

export const SLASH_ITEMS: SlashItem[] = [
  { title: 'Text', hint: 'Plain paragraph', icon: 'text', keywords: 'paragraph p plain', markdown: '', run: (e, r) => chain(e, r).setParagraph().run() },
  { title: 'Heading 1', hint: 'Large section heading', icon: 'h1', keywords: 'h1 title big', markdown: '#', run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', hint: 'Medium section heading', icon: 'h2', keywords: 'h2 subtitle', markdown: '##', run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', hint: 'Small section heading', icon: 'h3', keywords: 'h3', markdown: '###', run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { title: 'Bulleted list', hint: 'Simple bulleted list', icon: 'list', keywords: 'ul unordered bullet', markdown: '-', run: (e, r) => chain(e, r).toggleBulletList().run() },
  { title: 'Numbered list', hint: 'List with numbering', icon: 'listOrdered', keywords: 'ol ordered number', markdown: '1.', run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { title: 'To-do list', hint: 'Track tasks with checkboxes', icon: 'todo', keywords: 'todo task checkbox check', markdown: '[]', run: (e, r) => chain(e, r).toggleTaskList().run() },
  { title: 'Quote', hint: 'Capture a quote', icon: 'quote', keywords: 'blockquote citation', markdown: '>', run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { title: 'Code', hint: 'Code block with highlighting', icon: 'codeBlock', keywords: 'code snippet pre fence', markdown: '```', run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  { title: 'Divider', hint: 'Visually separate blocks', icon: 'divider', keywords: 'hr rule separator line', markdown: '---', run: (e, r) => chain(e, r).setHorizontalRule().run() },
  { title: 'Diagram', hint: 'Mermaid flowchart, sequence, and more', icon: 'diagram', keywords: 'mermaid chart flowchart graph sequence', markdown: '```mermaid', run: (e, r) => chain(e, r).setCodeBlock({ language: 'mermaid' }).command(({ tr }) => (tr.insertText(MERMAID_SAMPLE), true)).run() },
  { title: 'Side note', hint: 'Note in the margin', icon: 'note', keywords: 'sidenote footnote comment margin annotation', markdown: '[^1]', run: (e, r) => (e.chain().focus().deleteRange(r).run(), addSidenote(e)) },
  { title: 'Table', hint: 'Simple 3×3 table', icon: 'table', keywords: 'grid rows columns', markdown: '', run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
]

function filter(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((i) => `${i.title} ${i.keywords}`.toLowerCase().includes(q))
}

function renderMenu() {
  let el: HTMLDivElement | null = null
  let items: SlashItem[] = []
  let selected = 0
  let props: SuggestionProps<SlashItem> | null = null

  const draw = () => {
    if (!el || !props) return
    el.innerHTML = ''
    if (!items.length) {
      el.append(h('div', { class: 'slash-empty' }, 'No results'))
      return
    }
    el.append(h('div', { class: 'menu-heading' }, 'Basic blocks'))
    items.forEach((item, i) => {
      const btn = h(
        'button',
        { class: `menu-item slash-item${i === selected ? ' is-selected' : ''}`, type: 'button' },
        h('span', { class: 'slash-icon', html: icon(item.icon, 18) }),
        h('span', { class: 'menu-label' }, h('span', {}, item.title), h('span', { class: 'menu-desc' }, item.hint)),
        item.markdown ? h('span', { class: 'menu-hint' }, item.markdown) : null,
      )
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        props!.command(item)
      })
      btn.addEventListener('mousemove', () => {
        if (selected !== i) {
          selected = i
          draw()
        }
      })
      el!.append(btn)
    })
    el.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' })
  }

  const place = () => {
    const rect = props?.clientRect?.()
    if (!el || !rect) return
    const below = rect.bottom + 6
    const height = el.offsetHeight
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
    el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`
    el.style.top = `${top}px`
  }

  return {
    onStart(p: SuggestionProps<SlashItem>) {
      props = p
      items = p.items
      selected = 0
      el = h('div', { class: 'menu slash-menu', role: 'listbox' })
      document.body.append(el)
      draw()
      place()
    },
    onUpdate(p: SuggestionProps<SlashItem>) {
      props = p
      items = p.items
      selected = Math.min(selected, Math.max(0, items.length - 1))
      draw()
      place()
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (!items.length) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        draw()
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        props?.command(items[selected])
        return true
      }
      if (event.key === 'Escape') {
        el?.remove()
        el = null
        return true
      }
      return false
    },
    onExit() {
      el?.remove()
      el = null
      props = null
    },
  }
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        allow: ({ state, range }) => {
          // Only at the start of a block or after whitespace, and never inside code.
          const $from = state.doc.resolve(range.from)
          if ($from.parent.type.spec.code) return false
          const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
          return before === '' || /\s$/.test(before)
        },
        items: ({ query }) => filter(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: renderMenu,
      }),
    ]
  },
})

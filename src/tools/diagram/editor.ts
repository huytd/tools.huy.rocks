import { h } from '../../ui/dom'

export interface SourceEditor {
  el: HTMLElement
  textarea: HTMLTextAreaElement
  get value(): string
  /** Replace the text; `undoable` keeps it on the browser's undo stack. */
  setValue(text: string, opts?: { undoable?: boolean }): void
  setErrorLine(line: number | null): void
  focus(): void
}

const INDENT = '  '

/** A plain textarea with a line-number gutter. Tab indents, Shift+Tab outdents. */
export function createSourceEditor(onInput: () => void): SourceEditor {
  const gutter = h('div', { class: 'dg-gutter', 'aria-hidden': 'true' })
  const textarea = h('textarea', {
    class: 'dg-textarea',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    wrap: 'off',
    'aria-label': 'Diagram source',
  })
  const el = h('div', { class: 'dg-code' }, gutter, textarea)

  let lineCount = 0
  let errorLine: number | null = null

  function renderGutter() {
    const n = textarea.value.split('\n').length
    if (n === lineCount && gutter.dataset.err === String(errorLine)) return
    lineCount = n
    gutter.dataset.err = String(errorLine)
    const frag = document.createDocumentFragment()
    for (let i = 1; i <= n; i++) {
      const d = document.createElement('div')
      d.textContent = String(i)
      if (i === errorLine) d.className = 'is-error'
      frag.append(d)
    }
    gutter.replaceChildren(frag)
  }

  const syncScroll = () => (gutter.scrollTop = textarea.scrollTop)
  textarea.addEventListener('scroll', syncScroll)
  textarea.addEventListener('input', () => {
    renderGutter()
    onInput()
  })

  /** Insert through execCommand so the edit can be undone; fall back where unsupported. */
  function insert(text: string) {
    if (!document.execCommand('insertText', false, text)) {
      textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end')
      textarea.dispatchEvent(new Event('input'))
    }
  }

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      const v = textarea.value
      const { selectionStart: s, selectionEnd: end } = textarea
      const lineStart = v.lastIndexOf('\n', s - 1) + 1
      const multi = v.slice(s, end).includes('\n')
      if (!multi && !e.shiftKey) return insert(INDENT)
      // Indent or outdent every line the selection touches.
      const blockEnd = end > s && v[end - 1] === '\n' ? end - 1 : end
      const lines = v.slice(lineStart, blockEnd).split('\n')
      const changed = lines.map((l) => (e.shiftKey ? l.replace(/^( {1,2}|\t)/, '') : INDENT + l))
      textarea.setSelectionRange(lineStart, blockEnd)
      insert(changed.join('\n'))
      const delta = changed[0].length - lines[0].length
      textarea.setSelectionRange(Math.max(lineStart, s + delta), lineStart + changed.join('\n').length)
    } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Keep the current line's indentation.
      const v = textarea.value
      const lineStart = v.lastIndexOf('\n', textarea.selectionStart - 1) + 1
      const indent = /^[ \t]*/.exec(v.slice(lineStart, textarea.selectionStart))![0]
      if (!indent) return
      e.preventDefault()
      insert(`\n${indent}`)
    }
  })

  return {
    el,
    textarea,
    get value() {
      return textarea.value
    },
    setValue(text, opts = {}) {
      if (text === textarea.value) return
      if (opts.undoable && document.activeElement === textarea) {
        textarea.select()
        insert(text)
        textarea.setSelectionRange(0, 0)
        textarea.scrollTop = 0
      } else {
        textarea.value = text
        textarea.scrollTop = 0
      }
      renderGutter()
      syncScroll()
    },
    setErrorLine(line) {
      if (line === errorLine) return
      errorLine = line
      renderGutter()
    },
    focus: () => textarea.focus({ preventScroll: true }),
  }
}

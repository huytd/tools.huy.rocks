import './workbench.css'
import type { ToolContext } from '../../tools/registry'
import { h } from '../dom'
import { icon } from '../icons'
import { createSourceEditor, type SourceEditor } from './code-editor'
import { createViewport, type Viewport, type ViewportOptions } from './viewport'

// The shared shell for "source on the left, live preview on the right" tools: a source editor
// with line numbers and an error panel, a resizable split, a pan/zoom preview with a footer,
// drag-and-drop and a file picker, and a status chip in the top bar.

export interface Prefs {
  get(key: string, fallback: string): string
  set(key: string, value: string): void
}

/** localStorage under a prefix; every access survives storage being unavailable. */
export function createPrefs(prefix: string): Prefs {
  return {
    get(key, fallback) {
      try {
        return localStorage.getItem(`${prefix}.${key}`) ?? fallback
      } catch {
        return fallback
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(`${prefix}.${key}`, value)
      } catch {}
    },
  }
}

// ---------- Share links carry the source deflated and base64url-encoded ----------
export async function packText(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function unpackText(data: string): Promise<string> {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

export interface WorkbenchOptions {
  ctx: ToolContext
  /** Extra class on the root, for tool-specific styles. */
  className: string
  prefs: Prefs
  sourceLabel: string
  previewLabel: string
  /** File input `accept` list. */
  accept: string
  onInput(): void
  onFile(file: File): void
  viewport?: ViewportOptions
}

export interface Workbench {
  root: HTMLElement
  editor: SourceEditor
  preview: HTMLElement
  /** Holds what's drawn; pan and zoom transform it. */
  stage: HTMLElement
  /** Covers the preview for cards and prompts. */
  overlay: HTMLElement
  /** Footer text on the left of the preview. */
  info: HTMLElement
  /** Footer controls, left of the zoom buttons. */
  footTools: HTMLElement
  /** Top bar slot before the file name. */
  crumbLead: HTMLElement
  vp: Viewport
  setFileName(name: string | null): void
  setStatus(text: string | null, tone?: 'busy' | 'danger' | null): void
  /** Show or clear the error panel. `stale` dims the last good preview. */
  setError(message: string | null, opts?: { line?: number | null; stale?: boolean }): void
  showNote(text: string | null): void
  openFilePicker(): void
  destroy(): void
}

const clampSplit = (v: number) => Math.min(0.75, Math.max(0.2, v))

export function createWorkbench(o: WorkbenchOptions): Workbench {
  let split = clampSplit(Number(o.prefs.get('split', '0.38')) || 0.38)

  const editor = createSourceEditor(o.onInput, o.sourceLabel)
  const errorBox = h('div', { class: 'wb-error', hidden: true, role: 'alert' })
  const editorPane = h('section', { class: 'wb-editor-pane', 'aria-label': o.sourceLabel }, editor.el, errorBox)
  const resizer = h('div', {
    class: 'wb-resizer',
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': 'Resize panes',
    tabindex: '0',
  })
  const stage = h('div', { class: 'wb-stage' })
  const note = h('div', { class: 'wb-note', hidden: true })
  const overlay = h('div', { class: 'wb-overlay', hidden: true })
  const info = h('span', { class: 'wb-info' })
  const footTools = h('div', { class: 'wb-foot-tools' })
  const zoomLabel = h('button', { class: 'wb-zoom-btn wb-zoom-pct', title: 'Actual size (1)' }, '100%')
  const zoomOut = h('button', { class: 'wb-zoom-btn', html: icon('minus', 14), title: 'Zoom out (−)', 'aria-label': 'Zoom out' })
  const zoomIn = h('button', { class: 'wb-zoom-btn', html: icon('plus', 14), title: 'Zoom in (+)', 'aria-label': 'Zoom in' })
  const zoomFit = h('button', { class: 'wb-zoom-btn', html: icon('fit', 14), title: 'Fit to view (0)', 'aria-label': 'Fit to view' })
  const foot = h(
    'div',
    { class: 'wb-foot' },
    info,
    h('div', { class: 'wb-foot-right' }, footTools, h('div', { class: 'wb-zoom' }, zoomOut, zoomLabel, zoomIn, zoomFit)),
  )
  const preview = h('section', { class: 'wb-preview', tabindex: '0', 'aria-label': o.previewLabel }, stage, note, overlay, foot)
  const fileInput = h('input', { type: 'file', accept: o.accept, hidden: true })
  const dropHint = h('div', { class: 'wb-drop' }, h('div', {}, 'Drop to open'))
  const root = h('div', { class: `wb-tool ${o.className}` }, editorPane, resizer, preview, dropHint, fileInput)
  root.style.setProperty('--wb-split', String(split))
  o.ctx.root.append(root)

  // Top bar
  const crumbLead = h('span', { class: 'wb-crumb-lead' })
  const fileLabel = h('span', { class: 'wb-file', hidden: true })
  const status = h('span', { class: 'wb-status', hidden: true })
  o.ctx.crumbs.append(h('span', { class: 'wb-sep' }, '/'), crumbLead, fileLabel, status)

  // Preview
  const vp = createViewport(
    preview,
    stage,
    () => {
      zoomLabel.textContent = `${Math.round(vp.scale * 100)}%`
    },
    o.viewport,
  )
  zoomIn.addEventListener('click', () => vp.zoomBy(1.25))
  zoomOut.addEventListener('click', () => vp.zoomBy(0.8))
  zoomFit.addEventListener('click', () => vp.fit())
  zoomLabel.addEventListener('click', () => vp.actualSize())

  // Files
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    fileInput.value = ''
    if (f) o.onFile(f)
  })
  let dragDepth = 0
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
  root.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth++
    root.classList.add('is-dragging')
  })
  root.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault()
  })
  root.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0
      root.classList.remove('is-dragging')
    }
  })
  root.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth = 0
    root.classList.remove('is-dragging')
    const f = e.dataTransfer?.files[0]
    if (f) o.onFile(f)
  })

  // Split
  const setSplit = (v: number, save = true) => {
    split = clampSplit(v)
    root.style.setProperty('--wb-split', String(split))
    if (save) o.prefs.set('split', split.toFixed(3))
  }
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    resizer.setPointerCapture(e.pointerId)
    root.classList.add('is-resizing')
    const box = root.getBoundingClientRect()
    const move = (ev: PointerEvent) => setSplit((ev.clientX - box.left) / box.width, false)
    const up = () => {
      root.classList.remove('is-resizing')
      resizer.removeEventListener('pointermove', move)
      resizer.removeEventListener('pointerup', up)
      resizer.removeEventListener('pointercancel', up)
      setSplit(split)
    }
    resizer.addEventListener('pointermove', move)
    resizer.addEventListener('pointerup', up)
    resizer.addEventListener('pointercancel', up)
  })
  resizer.addEventListener('dblclick', () => setSplit(0.38))
  resizer.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setSplit(split + (e.key === 'ArrowLeft' ? -0.03 : 0.03))
  })

  const wb: Workbench = {
    root,
    editor,
    preview,
    stage,
    overlay,
    info,
    footTools,
    crumbLead,
    vp,
    setFileName(name) {
      fileLabel.hidden = !name
      fileLabel.textContent = name ?? ''
      fileLabel.title = name ?? ''
    },
    setStatus(text, tone = null) {
      status.hidden = !text
      status.textContent = text ?? ''
      status.className = `wb-status${tone ? ` tone-${tone}` : ''}`
    },
    setError(message, opts = {}) {
      errorBox.hidden = !message
      errorBox.textContent = message ?? ''
      editor.setErrorLine(message ? opts.line ?? null : null)
      preview.classList.toggle('is-stale', !!message && !!opts.stale)
      if (message) wb.setStatus('Error', 'danger')
    },
    showNote(text) {
      note.hidden = !text
      note.textContent = text ?? ''
    },
    openFilePicker: () => fileInput.click(),
    destroy() {
      vp.destroy()
      root.remove()
    },
  }
  return wb
}

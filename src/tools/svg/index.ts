import './svg-tool.css'
import type { ToolContext, ToolInstance } from '../registry'
import { h, kbd, toast, toggleMenu, type MenuEntry } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { createPrefs, createWorkbench, packText, unpackText } from '../../ui/workbench'
import { download, markupToPng } from '../../ui/workbench/svg'
import { SVG_EXAMPLES, SVG_STARTER } from './examples'
import { SvgError, byteSize, dataUri, formatBytes, formatSvg, parseSvg, type ParsedSvg } from './svgdoc'

const pref = createPrefs('sv')

type Backdrop = 'checker' | 'light' | 'dark'
const BACKDROPS: { id: Backdrop; label: string }[] = [
  { id: 'checker', label: 'Transparent' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

/** Past this many CSS pixels, the rest of the zoom is a transform rather than a bigger bitmap. */
const MAX_DRAW_PX = 8192

const linkFromHash = () => /^#\/svg\/([\w-]+)/.exec(location.hash)?.[1] ?? null

export function mount(ctx: ToolContext): ToolInstance {
  // ---------- State ----------
  let fileName: string | null = pref.get('file', '') || null
  let backdrop: Backdrop = (['checker', 'light', 'dark'] as const).find((b) => b === pref.get('backdrop', 'checker')) ?? 'checker'
  let current: (ParsedSvg & { url: string }) | null = null
  let renderTimer: number | undefined
  let saveTimer: number | undefined
  let token = 0
  let disposed = false

  // ---------- DOM ----------
  const img = h('img', { class: 'sv-art', alt: 'SVG preview', draggable: 'false' })
  const wb = createWorkbench({
    ctx,
    className: 'sv-tool',
    prefs: pref,
    sourceLabel: 'SVG source',
    previewLabel: 'SVG preview',
    accept: '.svg,image/svg+xml',
    onInput: () => onSourceInput(),
    onFile: (f) => openFile(f),
    viewport: {
      maxFit: 8,
      // Draw the image at the zoomed size so it stays sharp; only very large zooms fall back to scaling.
      applyScale(k) {
        if (!current) return k
        const drawn = Math.min(k, MAX_DRAW_PX / Math.max(current.width, current.height))
        img.style.width = `${current.width * drawn}px`
        img.style.height = `${current.height * drawn}px`
        return k / drawn
      },
    },
  })
  const { editor, vp } = wb
  wb.stage.append(img)

  const backdropBtns = BACKDROPS.map((b) => {
    const btn = h('button', {
      class: `sv-swatch sv-swatch-${b.id}`,
      title: `${b.label} background`,
      'aria-label': `${b.label} background`,
      'aria-pressed': 'false',
    })
    btn.addEventListener('click', () => setBackdrop(b.id))
    return btn
  })
  wb.footTools.append(h('div', { class: 'sv-swatches', role: 'group', 'aria-label': 'Preview background' }, ...backdropBtns))

  const optimizeBtn = h('button', { class: 'text-btn', title: 'Optimize with SVGO' }, 'Optimize')
  const examplesBtn = h('button', { class: 'text-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'Examples')
  const exportBtn = h('button', {
    class: 'icon-btn',
    html: icon('download'),
    title: 'Export',
    'aria-label': 'Export',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  const moreBtn = h('button', {
    class: 'icon-btn',
    html: icon('more'),
    title: 'More',
    'aria-label': 'More',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  ctx.actions.append(examplesBtn, optimizeBtn, exportBtn, moreBtn)

  function setBackdrop(b: Backdrop) {
    backdrop = b
    pref.set('backdrop', b)
    wb.root.dataset.backdrop = b
    backdropBtns.forEach((btn, i) => btn.setAttribute('aria-pressed', String(BACKDROPS[i].id === b)))
  }

  function renderChrome() {
    wb.setFileName(fileName)
    const ok = !!current
    exportBtn.disabled = !ok
    exportBtn.style.opacity = ok ? '' : '0.45'
  }

  // ---------- Rendering ----------
  function scheduleRender() {
    clearTimeout(renderTimer)
    renderTimer = window.setTimeout(renderNow, 150)
  }

  async function renderNow() {
    clearTimeout(renderTimer)
    const mine = ++token
    const src = editor.value
    if (!src.trim()) {
      clear()
      wb.setError(null)
      wb.setStatus(null)
      wb.showNote('Paste or write SVG markup on the left, open a file, or pick an example.')
      return
    }
    wb.showNote(null)
    let parsed: ParsedSvg
    try {
      parsed = parseSvg(src)
    } catch (err) {
      const e = err as SvgError
      wb.setError(e.message, { line: e.line ?? null, stale: !!current })
      return
    }
    // Drawn through an <img>: the SVG's own <style> can't leak into this page and its scripts never run.
    const url = URL.createObjectURL(new Blob([parsed.markup], { type: 'image/svg+xml' }))
    const next = new Image()
    next.src = url
    try {
      await next.decode()
    } catch {
      URL.revokeObjectURL(url)
      if (mine !== token || disposed) return
      wb.setError('The browser couldn’t draw this SVG.', { stale: !!current })
      return
    }
    if (mine !== token || disposed) {
      URL.revokeObjectURL(url)
      return
    }
    const sizeChanged = !current || current.width !== parsed.width || current.height !== parsed.height
    if (current) URL.revokeObjectURL(current.url)
    current = { ...parsed, url }
    img.src = url
    wb.setError(null)
    wb.setStatus(null)
    wb.preview.classList.remove('is-stale')
    if (sizeChanged) vp.setSize(parsed.width, parsed.height)
    else vp.refresh()
    renderInfo()
    renderChrome()
  }

  function renderInfo() {
    if (!current) {
      wb.info.textContent = ''
      return
    }
    const round = (n: number) => String(Math.round(n * 100) / 100)
    const parts = [`${round(current.width)} × ${round(current.height)}`]
    if (current.viewBox && current.viewBox !== `0 0 ${current.width} ${current.height}`) parts.push(`viewBox ${current.viewBox}`)
    parts.push(formatBytes(byteSize(editor.value)), `${current.elements} element${current.elements === 1 ? '' : 's'}`)
    if (current.fixes.length) parts.push(`${current.fixes.join(', ')} added for preview`)
    wb.info.textContent = parts.join(' · ')
    wb.info.title = wb.info.textContent
  }

  function clear() {
    if (current) URL.revokeObjectURL(current.url)
    current = null
    img.removeAttribute('src')
    img.style.width = img.style.height = '0'
    renderInfo()
    renderChrome()
  }

  // ---------- Source ----------
  function onSourceInput() {
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => pref.set('src', editor.value), 400)
    scheduleRender()
  }
  function flushSave() {
    clearTimeout(saveTimer)
    pref.set('src', editor.value)
  }

  function load(text: string, opts: { fileName?: string | null; undoable?: boolean } = {}) {
    fileName = opts.fileName ?? null
    pref.set('file', fileName ?? '')
    editor.setValue(text, { undoable: opts.undoable })
    flushSave()
    clear()
    vp.reset()
    renderNow()
  }

  /** Replace the text in place (undoable), keeping the view where it is. */
  function replaceSource(text: string) {
    editor.setValue(text, { undoable: true })
    flushSave()
    renderNow()
  }

  async function openFile(file: File) {
    if (file.size > 5_000_000) {
      toast('That file is too large to edit here')
      return
    }
    const text = await file.text()
    if (!/<svg[\s>]/i.test(text)) {
      toast('That doesn’t look like an SVG file')
      return
    }
    load(text, { fileName: file.name })
  }

  const baseName = () => (fileName ? fileName.replace(/\.[^.]+$/, '') : 'image')

  // ---------- Tidy ----------
  function format() {
    try {
      const out = formatSvg(editor.value)
      if (out === editor.value) toast('Already formatted')
      else replaceSource(out)
    } catch (err) {
      toast(err instanceof SvgError ? 'Fix the error first, then format' : 'Couldn’t format this SVG')
    }
  }

  async function optimize() {
    const before = editor.value
    if (!before.trim()) return
    try {
      parseSvg(before)
    } catch {
      toast('Fix the error first, then optimize')
      return
    }
    optimizeBtn.disabled = true
    wb.setStatus('Optimizing…', 'busy')
    try {
      const { optimize } = await import('svgo/browser')
      const { data } = optimize(before, { multipass: true, plugins: ['preset-default'] })
      if (disposed) return
      const a = byteSize(before)
      const b = byteSize(data)
      if (b >= a) {
        toast('Already as small as SVGO can make it')
      } else {
        replaceSource(data)
        toast(`Optimized: ${formatBytes(a)} → ${formatBytes(b)} (${Math.round((1 - b / a) * 100)}% smaller). Undo with ${kbd('mod+z')}`, 3600)
      }
    } catch (err) {
      console.error(err)
      toast('SVGO couldn’t optimize this SVG')
    } finally {
      optimizeBtn.disabled = false
      wb.setStatus(null)
    }
  }

  // ---------- Export ----------
  async function exportAs(kind: 'svg' | 'png' | 'copy-svg' | 'copy-png' | 'copy-uri' | 'copy-css', scale = 2) {
    if (!current) return
    const markup = current.markup
    try {
      if (kind === 'svg') download(new Blob([markup], { type: 'image/svg+xml' }), `${baseName()}.svg`)
      else if (kind === 'png') {
        download(await markupToPng(markup, current.width, current.height, null, scale), `${baseName()}${scale === 1 ? '' : `@${scale}x`}.png`)
      } else if (kind === 'copy-png') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': markupToPng(markup, current.width, current.height, null, 2) })])
        toast('Image copied')
      } else {
        const text =
          kind === 'copy-svg' ? markup : kind === 'copy-uri' ? dataUri(markup) : `background-image: url("${dataUri(markup)}");`
        await navigator.clipboard.writeText(text)
        toast(kind === 'copy-svg' ? 'SVG copied' : kind === 'copy-uri' ? 'Data URI copied' : 'CSS copied')
      }
    } catch (err) {
      console.error(err)
      toast(kind.startsWith('copy') ? 'Couldn’t copy to the clipboard' : `Couldn’t export ${kind.toUpperCase()}`)
    }
  }

  function saveSource() {
    download(new Blob([editor.value], { type: 'image/svg+xml' }), fileName ?? 'image.svg')
  }

  async function copyLink() {
    try {
      const url = `${location.origin}${location.pathname}#/svg/${await packText(editor.value)}`
      await navigator.clipboard.writeText(url)
      toast(url.length > 8000 ? 'Link copied (it’s long; some apps may cut it off)' : 'Link copied')
    } catch {
      toast('Couldn’t copy the link')
    }
  }

  async function openFromHash() {
    const data = linkFromHash()
    if (!data) return false
    history.replaceState(null, '', '#/svg')
    try {
      const text = await unpackText(data)
      if (!disposed) {
        load(text)
        toast('Opened a shared SVG')
      }
    } catch {
      toast('That link’s SVG couldn’t be read')
    }
    return true
  }
  const onHashChange = () => {
    if (linkFromHash()) openFromHash()
  }
  window.addEventListener('hashchange', onHashChange)

  // ---------- Menus ----------
  optimizeBtn.addEventListener('click', optimize)

  examplesBtn.addEventListener('click', () =>
    toggleMenu(
      examplesBtn,
      () => [
        { heading: 'Examples' },
        ...SVG_EXAMPLES.map<MenuEntry>((e) => ({
          label: e.name,
          description: e.description,
          onSelect: () => load(e.code, { undoable: true }),
        })),
      ],
      { align: 'right' },
    ),
  )

  exportBtn.addEventListener('click', () =>
    toggleMenu(
      exportBtn,
      () => [
        { label: 'Download SVG', icon: icon('download'), onSelect: () => exportAs('svg') },
        { heading: 'PNG, transparent background' },
        { label: 'Download PNG 1×', icon: icon('image'), onSelect: () => exportAs('png', 1) },
        { label: 'Download PNG 2×', icon: icon('image'), onSelect: () => exportAs('png', 2) },
        { label: 'Download PNG 4×', icon: icon('image'), onSelect: () => exportAs('png', 4) },
        'separator',
        { label: 'Copy SVG', icon: icon('code'), onSelect: () => exportAs('copy-svg') },
        { label: 'Copy image', icon: icon('copy'), description: 'PNG at 2×', onSelect: () => exportAs('copy-png') },
        { label: 'Copy as data URI', icon: icon('link'), description: 'For <img src> or url()', onSelect: () => exportAs('copy-uri') },
        { label: 'Copy as CSS background', icon: icon('code'), onSelect: () => exportAs('copy-css') },
      ],
      { align: 'right', className: 'menu-wide' },
    ),
  )

  moreBtn.addEventListener('click', () =>
    toggleMenu(
      moreBtn,
      () => [
        { label: 'Open file…', icon: icon('folder'), hint: kbd('mod+o'), onSelect: wb.openFilePicker },
        { label: 'Save', icon: icon('save'), hint: kbd('mod+s'), description: 'Downloads the source as written', onSelect: saveSource },
        { label: 'Copy link', icon: icon('link'), description: 'The SVG travels inside the link', onSelect: copyLink },
        'separator',
        { label: 'Format', icon: icon('outline'), hint: kbd('shift+alt+f'), description: 'Re-indent the markup', onSelect: format },
        { label: 'Optimize', icon: icon('fit'), description: 'Shrink with SVGO (undoable)', onSelect: optimize },
        'separator',
        { label: 'New', icon: icon('plus'), onSelect: () => load('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">\n  \n</svg>\n', { undoable: true }) },
      ],
      { align: 'right' },
    ),
  )

  // ---------- Keyboard ----------
  const onKey = (e: KeyboardEvent) => {
    if (e.shiftKey && e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyF') {
      e.preventDefault()
      format()
      return
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
    const k = e.key.toLowerCase()
    if (k === 'o') {
      e.preventDefault()
      wb.openFilePicker()
    } else if (k === 's') {
      e.preventDefault()
      saveSource()
    }
  }
  document.addEventListener('keydown', onKey)

  // ---------- Start ----------
  setBackdrop(backdrop)
  editor.setValue(pref.get('src', SVG_STARTER))
  renderChrome()
  openFromHash().then((opened) => {
    if (!opened && !disposed) renderNow()
  })
  requestAnimationFrame(() => editor.focus())

  return {
    unmount() {
      disposed = true
      flushSave()
      clearTimeout(renderTimer)
      if (current) URL.revokeObjectURL(current.url)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', onHashChange)
      wb.destroy()
    },
  }
}

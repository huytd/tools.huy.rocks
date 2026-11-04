import './diagram.css'
import type { ToolContext, ToolInstance } from '../registry'
import { h, kbd, toast, toggleMenu, type MenuEntry } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { isDark } from '../../ui/mermaid'
import { createPrefs, createWorkbench, packText, unpackText } from '../../ui/workbench'
import { download, prepareSvg, serializeSvg, svgToPng, type PreparedSvg } from '../../ui/workbench/svg'
import { EXAMPLES, STARTERS } from './examples'
import { MERMAID_LOOKS, polishClaude, type MermaidLook } from './mermaid-theme'
import {
  DEFAULT_PLANTUML_SERVER,
  DiagramError,
  FILE_ACCEPT,
  LANGS,
  d2Loaded,
  detectLang,
  langInfo,
  normalizeServer,
  render,
  type Lang,
  type RenderOptions,
} from './engines'

const pref = createPrefs('dg')

const isLang = (v: string): v is Lang => LANGS.some((l) => l.id === v)

// Share links: #/diagram/<lang>/<deflated, base64url source>
function linkFromHash(): { lang: Lang; data: string } | null {
  const m = /^#\/diagram\/(\w+)\/([\w-]+)/.exec(location.hash)
  return m && isLang(m[1]) ? { lang: m[1], data: m[2] } : null
}

export function mount(ctx: ToolContext): ToolInstance {
  // ---------- State ----------
  const stored = pref.get('lang', 'mermaid')
  let lang: Lang = isLang(stored) ? stored : 'mermaid'
  const sources = {} as Record<Lang, string>
  for (const l of LANGS) sources[l.id] = pref.get(`src.${l.id}`, STARTERS[l.id])
  let fileName: string | null = null
  let pumlServer = normalizeServer(pref.get('puml.server', DEFAULT_PLANTUML_SERVER)) || DEFAULT_PLANTUML_SERVER
  let pumlAllowed = pref.get('puml.allowed', '') // the server the person agreed to send diagrams to
  let d2Layout: 'dagre' | 'elk' = pref.get('d2.layout', 'elk') === 'dagre' ? 'dagre' : 'elk'
  let d2Sketch = pref.get('d2.sketch', '0') === '1'
  const storedLook = pref.get('mermaid.look', 'claude')
  let mermaidLook: MermaidLook = MERMAID_LOOKS.some((l) => l.id === storedLook) ? (storedLook as MermaidLook) : 'claude'

  let current: (PreparedSvg & { isError: boolean }) | null = null
  let renderToken = 0
  let abort: AbortController | null = null
  let renderTimer: number | undefined
  let saveTimer: number | undefined
  let busyTimer: number | undefined
  let lastRendered = '' // lang|theme|settings|source of the last finished render
  let showingConsent = false
  let disposed = false

  // ---------- DOM ----------
  const wb = createWorkbench({
    ctx,
    className: 'dg-tool',
    prefs: pref,
    sourceLabel: 'Diagram source',
    previewLabel: 'Diagram preview',
    accept: FILE_ACCEPT,
    onInput: () => onSourceInput(),
    onFile: (f) => openFile(f),
  })
  const { editor, preview, stage, overlay, vp, root } = wb

  // Top bar
  const langBtn = h('button', { class: 'wb-crumb-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Diagram language' })
  wb.crumbLead.append(langBtn)

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
  ctx.actions.append(examplesBtn, exportBtn, moreBtn)

  // ---------- Chrome ----------
  function renderChrome() {
    const info = langInfo(lang)
    langBtn.replaceChildren(h('span', {}, info.name), h('span', { class: 'wb-chev', html: icon('chevronDown', 13) }))
    wb.setFileName(fileName)
    root.dataset.lang = lang
    wb.info.textContent =
      lang === 'plantuml' ? `PlantUML · rendered by ${hostOf(pumlServer)}` : `${info.name} · rendered in your browser`
    const canExport = !!current && !current.isError
    exportBtn.disabled = !canExport
    exportBtn.style.opacity = canExport ? '' : '0.45'
  }
  const hostOf = (url: string) => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  }

  const setStatus = wb.setStatus
  const showNote = wb.showNote
  function setError(message: string | null, line: number | null = null) {
    wb.setError(message, { line, stale: !!current && !current.isError })
  }

  // ---------- Rendering ----------
  const settingsKey = () => [lang, isDark(), lang === 'plantuml' ? pumlServer : '', lang === 'd2' ? `${d2Layout}${d2Sketch}` : '', lang === 'mermaid' ? mermaidLook : ''].join('|')

  function scheduleRender(delay = lang === 'plantuml' ? 650 : 280) {
    clearTimeout(renderTimer)
    renderTimer = window.setTimeout(renderNow, delay)
  }

  async function renderNow(force = false) {
    clearTimeout(renderTimer)
    const code = editor.value
    const key = `${settingsKey()}|${code}`
    if (!force && key === lastRendered) return
    const token = ++renderToken
    abort?.abort()
    abort = new AbortController()
    clearTimeout(busyTimer)

    if (!code.trim()) {
      lastRendered = key
      clearDiagram()
      setError(null)
      setStatus(null)
      showNote('Write some diagram source on the left, or pick one from Examples.')
      return
    }
    if (lang === 'plantuml' && pumlAllowed !== pumlServer) {
      showConsent()
      return
    }
    hideConsent()
    showNote(null)

    const firstD2 = lang === 'd2' && !d2Loaded()
    busyTimer = window.setTimeout(() => {
      if (token === renderToken) setStatus(firstD2 ? 'Loading D2…' : 'Rendering…', 'busy')
    }, firstD2 ? 0 : 200)

    try {
      const markup = await render(lang, code, renderOptions(abort.signal))
      if (token !== renderToken || disposed) return
      showSvg(markup, false)
      lastRendered = key
      setError(null)
      setStatus(null)
    } catch (err) {
      if (token !== renderToken || disposed || (err as Error)?.name === 'AbortError') return
      lastRendered = key
      if (err instanceof DiagramError && err.svg) {
        try {
          showSvg(err.svg, true)
        } catch {}
      }
      const msg = String((err as Error)?.message ?? err).trim() || 'Something went wrong'
      setError(msg, err instanceof DiagramError ? err.line ?? null : null)
    } finally {
      if (token === renderToken) clearTimeout(busyTimer)
    }
  }

  const renderOptions = (signal: AbortSignal, extra: Partial<RenderOptions> = {}): RenderOptions => ({
    dark: isDark(),
    fontFamily: getComputedStyle(preview).fontFamily,
    signal,
    mermaidLook,
    plantumlServer: pumlServer,
    d2Layout,
    d2Sketch,
    ...extra,
  })

  /** Parse renderer output; the SVG must be in the document while it's polished (it gets measured). */
  function prepareFor(markup: string, host: HTMLElement, isError = false): PreparedSvg {
    const prepared = prepareSvg(markup)
    host.replaceChildren(prepared.el)
    if (lang === 'mermaid' && mermaidLook === 'claude' && !isError) Object.assign(prepared, polishClaude(prepared.el, isDark()))
    return prepared
  }

  function showSvg(markup: string, isError: boolean) {
    const prepared = prepareFor(markup, stage, isError)
    current = { ...prepared, isError }
    preview.classList.remove('is-stale')
    vp.setSize(prepared.width, prepared.height)
    renderChrome()
  }

  function clearDiagram() {
    stage.replaceChildren()
    current = null
    renderChrome()
  }

  // ---------- PlantUML consent ----------
  function showConsent(opts: { cancellable?: boolean } = {}) {
    showingConsent = true
    clearDiagram()
    setError(null)
    setStatus(null)
    showNote(null)
    const input = h('input', {
      class: 'dg-input',
      type: 'url',
      value: pumlServer,
      spellcheck: 'false',
      'aria-label': 'PlantUML server URL',
      placeholder: DEFAULT_PLANTUML_SERVER,
    })
    const go = h('button', { class: 'dg-btn dg-btn-primary', type: 'submit' }, 'Render with this server')
    const reset = h('button', { class: 'dg-btn', type: 'button' }, 'Use plantuml.com')
    const cancel = opts.cancellable ? h('button', { class: 'dg-btn', type: 'button' }, 'Cancel') : null
    const form = h(
      'form',
      { class: 'dg-card' },
      h('div', { class: 'dg-card-icon', html: icon('alert', 18) }),
      h('h2', {}, 'PlantUML renders on a server'),
      h(
        'p',
        {},
        "PlantUML is a Java program with no browser version, so to draw this diagram its source is sent to a PlantUML server. Mermaid and D2 render right here and send nothing.",
      ),
      h(
        'p',
        {},
        'The public server is run by plantuml.com. To keep diagrams private, run your own (',
        h('code', {}, 'docker run -p 8080:8080 plantuml/plantuml-server'),
        ') and enter its address, e.g. ',
        h('code', {}, 'http://localhost:8080'),
        '.',
      ),
      h('label', { class: 'dg-label' }, h('span', {}, 'Server'), input),
      h('div', { class: 'dg-card-actions' }, go, input.value !== DEFAULT_PLANTUML_SERVER ? reset : null, cancel),
    )
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const url = normalizeServer(input.value) || DEFAULT_PLANTUML_SERVER
      try {
        new URL(url)
      } catch {
        input.setCustomValidity('Enter a server address like https://www.plantuml.com/plantuml')
        input.reportValidity()
        return
      }
      pumlServer = url
      pumlAllowed = url
      pref.set('puml.server', url)
      pref.set('puml.allowed', url)
      hideConsent()
      renderChrome()
      renderNow(true)
    })
    input.addEventListener('input', () => input.setCustomValidity(''))
    reset.addEventListener('click', () => {
      input.value = DEFAULT_PLANTUML_SERVER
      reset.remove()
    })
    cancel?.addEventListener('click', () => {
      hideConsent()
      renderNow(true)
    })
    overlay.replaceChildren(form)
    overlay.hidden = false
  }
  function hideConsent() {
    if (!showingConsent) return
    showingConsent = false
    overlay.hidden = true
    overlay.replaceChildren()
  }

  // ---------- Source & language ----------
  function onSourceInput() {
    sources[lang] = editor.value
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => pref.set(`src.${lang}`, sources[lang]), 400)
    if (!showingConsent) scheduleRender()
  }

  function flushSave() {
    clearTimeout(saveTimer)
    pref.set(`src.${lang}`, sources[lang])
  }

  function setLang(next: Lang, opts: { source?: string; fileName?: string | null; undoable?: boolean } = {}) {
    if (next !== lang) flushSave()
    hideConsent()
    lang = next
    pref.set('lang', lang)
    if (opts.source != null) {
      sources[lang] = opts.source
      pref.set(`src.${lang}`, opts.source)
    }
    fileName = opts.fileName ?? null
    editor.setValue(sources[lang], { undoable: opts.undoable })
    clearDiagram()
    setError(null)
    vp.reset()
    renderChrome()
    renderNow(true)
  }

  function loadExample(code: string) {
    setLang(lang, { source: code, undoable: true })
  }

  // ---------- Files ----------
  async function openFile(file: File) {
    if (file.size > 2_000_000) {
      toast('That file is too large for a diagram')
      return
    }
    const text = await file.text()
    const detected = detectLang(file.name, text)
    if (!detected) {
      toast('That file looks empty')
      return
    }
    setLang(detected, { source: text, fileName: file.name })
  }

  const baseName = () => (fileName ? fileName.replace(/\.[^.]+$/, '') : 'diagram')

  function saveSource() {
    const name = fileName ?? `diagram.${langInfo(lang).ext}`
    download(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }), name)
  }

  const previewBackground = () => getComputedStyle(preview).backgroundColor || (isDark() ? '#191919' : '#ffffff')

  async function exportAs(kind: 'svg' | 'png' | 'copy-svg' | 'copy-png') {
    if (!current || current.isError) return
    try {
      if (kind === 'svg') {
        download(new Blob([serializeSvg(current.el)], { type: 'image/svg+xml' }), `${baseName()}.svg`)
      } else if (kind === 'copy-svg') {
        await navigator.clipboard.writeText(serializeSvg(current.el))
        toast('SVG copied')
      } else {
        const png = rasterize()
        if (kind === 'png') download(await png, `${baseName()}.png`)
        else {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          toast('Image copied')
        }
      }
    } catch (err) {
      console.error(err)
      toast(kind.startsWith('copy') ? "Couldn't copy to the clipboard" : `Couldn't export ${kind.toUpperCase()}`)
    }
  }

  /**
   * PNG of the current diagram. Mermaid's HTML labels would taint the canvas, so Mermaid
   * diagrams are drawn once more with plain SVG text for the export.
   */
  async function rasterize(): Promise<Blob> {
    if (!current) throw new Error('Nothing to export')
    if (lang !== 'mermaid' || !current.el.querySelector('foreignObject')) {
      return svgToPng(current.el, current.width, current.height, previewBackground())
    }
    const markup = await render(lang, editor.value, renderOptions(new AbortController().signal, { plainLabels: true }))
    const host = h('div', { class: 'dg-offscreen', 'aria-hidden': 'true' })
    document.body.append(host)
    try {
      const svg = prepareFor(markup, host)
      return await svgToPng(svg.el, svg.width, svg.height, previewBackground())
    } finally {
      host.remove()
    }
  }

  async function copyLink() {
    try {
      const data = await packText(editor.value)
      const url = `${location.origin}${location.pathname}#/diagram/${lang}/${data}`
      await navigator.clipboard.writeText(url)
      toast(url.length > 8000 ? 'Link copied (it’s long; some apps may cut it off)' : 'Link copied')
    } catch {
      toast("Couldn't copy the link")
    }
  }

  async function openFromHash() {
    const link = linkFromHash()
    if (!link) return false
    history.replaceState(null, '', '#/diagram')
    try {
      const text = await unpackText(link.data)
      if (disposed) return true
      setLang(link.lang, { source: text })
      toast('Opened a shared diagram')
    } catch {
      toast("That link's diagram couldn't be read")
    }
    return true
  }
  const onHashChange = () => {
    if (linkFromHash()) openFromHash()
  }
  window.addEventListener('hashchange', onHashChange)

  // ---------- Menus ----------
  langBtn.addEventListener('click', () =>
    toggleMenu(
      langBtn,
      () => [
        { heading: 'Language' },
        ...LANGS.map<MenuEntry>((l) => ({
          label: l.name,
          description: l.where,
          checked: l.id === lang,
          onSelect: () => l.id !== lang && setLang(l.id),
        })),
      ],
      { className: 'menu-wide' },
    ),
  )

  examplesBtn.addEventListener('click', () =>
    toggleMenu(
      examplesBtn,
      () => {
        const list = EXAMPLES[lang]
        const item = (e: (typeof list)[number]): MenuEntry => ({ label: e.name, onSelect: () => loadExample(e.code) })
        return [
          { heading: `${langInfo(lang).name} diagrams` },
          ...list.filter((e) => !e.c4).map(item),
          'separator',
          { heading: 'C4 model' },
          ...list.filter((e) => e.c4).map(item),
        ]
      },
      { align: 'right' },
    ),
  )

  exportBtn.addEventListener('click', () =>
    toggleMenu(
      exportBtn,
      () => [
        { label: 'Download SVG', icon: icon('download'), onSelect: () => exportAs('svg') },
        { label: 'Download PNG', icon: icon('image'), onSelect: () => exportAs('png') },
        'separator',
        { label: 'Copy SVG', icon: icon('code'), onSelect: () => exportAs('copy-svg') },
        { label: 'Copy image', icon: icon('copy'), onSelect: () => exportAs('copy-png') },
      ],
      { align: 'right' },
    ),
  )

  moreBtn.addEventListener('click', () =>
    toggleMenu(
      moreBtn,
      () => {
        const entries: MenuEntry[] = [
          { label: 'Open file…', icon: icon('folder'), hint: kbd('mod+o'), onSelect: wb.openFilePicker },
          { label: 'Save source', icon: icon('save'), hint: kbd('mod+s'), onSelect: saveSource },
          { label: 'Copy link', icon: icon('link'), description: 'The diagram travels inside the link', onSelect: copyLink },
        ]
        if (lang === 'mermaid') {
          entries.push(
            'separator',
            { heading: 'Mermaid theme' },
            ...MERMAID_LOOKS.map<MenuEntry>((l) => ({
              label: l.name,
              description: l.description,
              checked: mermaidLook === l.id,
              onSelect: () => {
                mermaidLook = l.id
                pref.set('mermaid.look', l.id)
                renderNow()
              },
            })),
          )
        }
        if (lang === 'd2') {
          entries.push(
            'separator',
            { heading: 'D2 layout' },
            {
              label: 'ELK',
              description: 'Tidier for nested containers',
              checked: d2Layout === 'elk',
              onSelect: () => setD2({ layout: 'elk' }),
            },
            { label: 'Dagre', description: 'Faster, compact', checked: d2Layout === 'dagre', onSelect: () => setD2({ layout: 'dagre' }) },
            'separator',
            { label: 'Sketch style', icon: icon('highlight'), checked: d2Sketch, onSelect: () => setD2({ sketch: !d2Sketch }) },
          )
        }
        if (lang === 'plantuml') {
          entries.push('separator', {
            label: 'PlantUML server…',
            icon: icon('server'),
            description: hostOf(pumlServer),
            onSelect: () => showConsent({ cancellable: pumlAllowed === pumlServer }),
          })
        }
        entries.push('separator', { label: `${langInfo(lang).name} reference`, icon: icon('external'), onSelect: () => window.open(langInfo(lang).docs, '_blank', 'noopener') })
        return entries
      },
      { align: 'right' },
    ),
  )

  function setD2(opts: { layout?: 'dagre' | 'elk'; sketch?: boolean }) {
    if (opts.layout) {
      d2Layout = opts.layout
      pref.set('d2.layout', d2Layout)
    }
    if (opts.sketch != null) {
      d2Sketch = opts.sketch
      pref.set('d2.sketch', d2Sketch ? '1' : '0')
    }
    renderNow()
  }

  // ---------- Keyboard ----------
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
    const k = e.key.toLowerCase()
    if (k === 'o') {
      e.preventDefault()
      wb.openFilePicker()
    } else if (k === 's') {
      e.preventDefault()
      saveSource()
    } else if (k === 'enter') {
      e.preventDefault()
      renderNow(true)
    }
  }
  document.addEventListener('keydown', onKey)

  // ---------- Theme ----------
  const onTheme = () => renderNow()
  const themeObserver = new MutationObserver(onTheme)
  themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] })
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', onTheme)
  // Mermaid measures labels with the page font; redraw once a late font arrives.
  const onFonts = () => lang === 'mermaid' && renderNow(true)
  document.fonts.addEventListener('loadingdone', onFonts)

  // ---------- Start ----------
  editor.setValue(sources[lang])
  renderChrome()
  openFromHash().then((opened) => {
    if (!opened && !disposed) renderNow(true)
  })
  requestAnimationFrame(() => editor.focus())

  return {
    unmount() {
      disposed = true
      flushSave()
      abort?.abort()
      clearTimeout(renderTimer)
      clearTimeout(busyTimer)
      themeObserver.disconnect()
      mq.removeEventListener('change', onTheme)
      document.fonts.removeEventListener('loadingdone', onFonts)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', onHashChange)
      wb.destroy()
    },
  }
}

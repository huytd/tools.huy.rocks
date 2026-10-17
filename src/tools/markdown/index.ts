import './markdown.css'
import type { ToolContext, ToolInstance } from '../registry'
import { h, kbd, relativeTime, showMenu, toast, toggleMenu, type MenuEntry } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { createEditor, tidy } from './editor'
import { frontmatterPairs, joinFrontmatter, splitFrontmatter } from './frontmatter'
import { FileWatcher, type WatchEvent } from './watcher'
import * as fs from './files'

type Mode = 'rich' | 'source'

type Session =
  | {
      kind: 'handle'
      handle: FileSystemFileHandle
      name: string
      writable: boolean | null
      /** Folder access used only to resolve relative images and links. */
      root: fs.AssetRoot | null
      /** A remembered folder that needs a one-click re-grant. */
      pendingRoot: fs.AssetRoot | null
    }
  | { kind: 'snapshot'; file: File; name: string }
  | { kind: 'new'; name: string }

const pref = {
  get(key: string, fallback: string) {
    try {
      return localStorage.getItem(`md.${key}`) ?? fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`md.${key}`, value)
    } catch {}
  },
}

const SAMPLE = `# Welcome

This is a **Notion-style** markdown editor that runs entirely in your browser.

- Type \`/\` for blocks: headings, lists, to-dos, quotes, code, tables
- Select text for **bold**, *italic*, \`code\` and [links](https://tools.huy.rocks)
- Markdown shortcuts work as you type: \`#\`, \`-\`, \`1.\`, \`[ ]\`, \`>\`, \`\`\`

## Live reload

Open a \`.md\` file and edit it in any other app. This page picks up the change within a second, highlights what moved, and keeps your scroll position.

- [x] Open a file
- [ ] Edit it somewhere else
- [ ] Watch it update here

\`\`\`ts
const watcher = new FileWatcher(handle, onChange)
watcher.start() // polls every second, reads only when the file changed
\`\`\`
`

const nameOf = (s: { name: string }) => (fs.MD_EXT.test(s.name) ? s.name : `${s.name}.md`)

export function mount(ctx: ToolContext): ToolInstance {
  // ---------- State ----------
  let session: Session | null = null
  let watcher: FileWatcher | null = null
  let mode: Mode = pref.get('mode', 'rich') === 'source' ? 'source' : 'rich'
  let frontmatter: string | null = null
  let diskText = '' // last text we know is on disk (loaded or saved)
  let baseline = '' // diskText as the current view would serialize it
  let dirty = false
  let saving = false
  let justSaved = 0
  let missing = false
  let unreadable = false
  let conflictText: string | null = null
  let needsAssets = false // doc has relative images we couldn't show
  let assetsDismissed = false
  let autosave = pref.get('autosave', '1') === '1'
  let fullWidth = pref.get('fullWidth', '0') === '1'
  let changeTimer: number | undefined
  let disposed = false
  const imageCache = new Map<string, string>()

  // ---------- DOM ----------
  const fileInput = h('input', {
    type: 'file',
    accept: '.md,.markdown,.mdx,.mdown,.mkd,.txt,text/markdown,text/plain',
    hidden: true,
  })
  const banner = h('div', { class: 'md-banner', hidden: true, role: 'status' })
  const empty = h('div', { class: 'md-empty' })
  const hint = h('div', { class: 'md-hint', hidden: true })
  const props = h('div', { class: 'md-props', hidden: true })
  const editorMount = h('div', { class: 'md-editor' })
  const source = h('textarea', {
    class: 'md-source',
    spellcheck: 'false',
    'aria-label': 'Markdown source',
    autocapitalize: 'off',
    autocomplete: 'off',
  })
  const doc = h('article', { class: 'md-doc', hidden: true }, hint, props, editorMount, source)
  const main = h('section', { class: 'md-main' }, banner, empty, doc)
  const dropHint = h('div', { class: 'md-drop' }, h('div', {}, 'Drop to open'))
  const root = h('div', { class: 'md-tool' }, main, dropHint, fileInput)
  ctx.root.append(root)

  // Top bar
  const crumbName = h('span', { class: 'crumb crumb-name' })
  const status = h('span', { class: 'md-status' })
  ctx.crumbs.append(h('span', { class: 'crumb-sep' }, '/'), crumbName, status)

  const sourceBtn = h('button', {
    class: 'icon-btn',
    html: icon('code'),
    title: `Markdown source (${kbd('mod+/')})`,
    'aria-label': 'Toggle markdown source',
    'aria-pressed': 'false',
  })
  const openBtn = h('button', { class: 'text-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'Open')
  const moreBtn = h('button', {
    class: 'icon-btn',
    html: icon('more'),
    'aria-label': 'More',
    title: 'More',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  })
  ctx.actions.append(sourceBtn, openBtn, moreBtn)

  // ---------- Editor ----------
  const ed = createEditor(editorMount, {
    onChange: () => onLocalEdit(),
    resolveImage,
    openLink,
  })

  // ---------- Text model ----------
  const mgr = () => ed.editor.markdown!
  const normalize = (body: string) => tidy(mgr().serialize(mgr().parse(body)))
  function currentText(): string {
    return mode === 'source' ? source.value : joinFrontmatter(frontmatter, ed.getMarkdown())
  }
  function baselineFor(text: string): string {
    if (mode === 'source') return text
    const s = splitFrontmatter(text)
    return joinFrontmatter(s.frontmatter, normalize(s.body))
  }

  /** Put `text` into the active view. */
  function render(text: string, opts: { external?: boolean } = {}) {
    const s = splitFrontmatter(text)
    frontmatter = s.frontmatter
    if (mode === 'source') {
      const { selectionStart, selectionEnd } = source
      const sTop = document.scrollingElement!.scrollTop
      source.value = text
      source.setSelectionRange(Math.min(selectionStart, text.length), Math.min(selectionEnd, text.length))
      autosize()
      document.scrollingElement!.scrollTop = sTop
    } else {
      ed.setMarkdown(s.body, opts)
    }
    renderProps()
  }

  function loadText(text: string, opts: { external?: boolean } = {}) {
    diskText = text
    conflictText = null
    render(text, opts)
    baseline = baselineFor(text)
    dirty = false
    refreshUI()
  }

  function renderProps() {
    props.innerHTML = ''
    const pairs = frontmatter && mode === 'rich' ? frontmatterPairs(frontmatter) : []
    props.hidden = !pairs.length
    for (const [k, v] of pairs.slice(0, 24)) {
      props.append(
        h('div', { class: 'prop' }, h('span', { class: 'prop-key' }, k), h('span', { class: 'prop-val' }, v || '—')),
      )
    }
    props.title = 'Front matter. Edit it in the source view.'
  }

  function autosize() {
    source.style.height = 'auto'
    source.style.height = `${source.scrollHeight + 2}px`
  }
  source.addEventListener('input', () => {
    autosize()
    onLocalEdit()
  })
  source.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end')
      source.dispatchEvent(new Event('input'))
    }
  })

  // ---------- Editing & saving ----------
  function onLocalEdit() {
    if (!session) return
    // First edit of a file: ask for write access while we still have the
    // keystroke's user activation.
    if (session.kind === 'handle' && session.writable === null && autosave) {
      const s = session
      s.writable = false
      fs.ensurePermission(s.handle, 'readwrite', true).then((ok) => {
        s.writable = ok
        if (!ok) toast('No write access. Use Save as… to keep your changes.')
        refreshUI()
        if (ok) scheduleCheck(0)
      })
    }
    dirty = true // optimistic; confirmed by the debounced check
    refreshUI()
    scheduleCheck()
  }

  function scheduleCheck(delay = 650) {
    clearTimeout(changeTimer)
    changeTimer = window.setTimeout(() => {
      if (disposed || !session) return
      dirty = currentText() !== baseline
      refreshUI()
      if (dirty && autosave && session.kind === 'handle' && session.writable && conflictText == null) save()
    }, delay)
  }

  async function save(opts: { saveAs?: boolean; explicit?: boolean } = {}): Promise<boolean> {
    if (!session || saving) return false
    if (conflictText != null && !opts.explicit) return false
    clearTimeout(changeTimer)
    const text = currentText()

    if (session.kind === 'handle' && !opts.saveAs) {
      const s = session
      if (!s.writable) {
        s.writable = await fs.ensurePermission(s.handle, 'readwrite', !!opts.explicit)
        if (!s.writable) {
          refreshUI()
          if (opts.explicit) toast('Write access was denied.')
          return false
        }
      }
      saving = true
      refreshUI()
      try {
        await watcher!.whileSuspended(async () => {
          await fs.writeFile(s.handle, text)
          await watcher!.acknowledge(text)
        })
        diskText = text
        baseline = text
        conflictText = null
        justSaved = Date.now()
        dirty = currentText() !== baseline // edits may have landed mid-write
        if (dirty) scheduleCheck()
        return true
      } catch (err) {
        console.error(err)
        toast(`Couldn't save: ${(err as Error).message ?? err}`)
        return false
      } finally {
        saving = false
        refreshUI()
        setTimeout(refreshUI, 1600)
      }
    }

    // Save as / first save of a new or snapshot document.
    if (fs.canSaveAs) {
      const handle = await fs.pickSaveFile(nameOf(session))
      if (!handle) return false
      try {
        await fs.writeFile(handle, text)
      } catch (err) {
        toast(`Couldn't save: ${(err as Error).message ?? err}`)
        return false
      }
      await openHandle(handle, { keepText: text, writable: true })
      toast(`Saved ${handle.name}`)
      return true
    }
    fs.downloadText(nameOf(session), text)
    diskText = text
    baseline = baselineFor(text)
    dirty = false
    refreshUI()
    return true
  }

  // ---------- Opening ----------
  function stopWatching() {
    watcher?.stop()
    watcher = null
    missing = false
    unreadable = false
  }

  function resetAssets() {
    clearImageCache()
    needsAssets = false
    assetsDismissed = false
  }

  async function confirmLeave(): Promise<boolean> {
    if (!session || !dirty) return true
    if (session.kind === 'handle' && autosave && session.writable && conflictText == null) {
      if (await save()) return true
    }
    return confirm('You have unsaved changes. Discard them?')
  }

  async function openHandle(
    handle: FileSystemFileHandle,
    opts: { root?: fs.AssetRoot | null; keepText?: string; writable?: boolean | null } = {},
  ) {
    let file: File
    try {
      file = await handle.getFile()
    } catch (err) {
      toast(`Couldn't open ${handle.name}`)
      console.error(err)
      return
    }
    const text = opts.keepText ?? (await file.text())

    // Reuse a folder grant from earlier visits so relative images just work.
    let root = opts.root ?? null
    let pendingRoot: fs.AssetRoot | null = null
    if (!root && fs.canOpenFolders) {
      const found = await fs.findRoot(handle)
      if (found?.granted) root = found
      else if (found) pendingRoot = found
    }

    stopWatching()
    resetAssets()
    session = { kind: 'handle', handle, name: handle.name, writable: opts.writable ?? null, root, pendingRoot }
    showDoc()
    loadText(text)
    // Image node views can be reused across files; make them resolve against this file.
    window.dispatchEvent(new Event('md:assets'))
    window.scrollTo(0, 0)
    watcher = new FileWatcher({ getFile: () => handle.getFile() }, onWatch)
    await watcher.acknowledge(text, opts.keepText ? undefined : file)
    watcher.start()
    fs.rememberRecent(handle)
    refreshUI()
  }

  async function openSnapshot(file: File) {
    if (!(await confirmLeave())) return
    stopWatching()
    resetAssets()
    session = { kind: 'snapshot', file, name: file.name }
    showDoc()
    const text = await file.text()
    loadText(text)
    window.scrollTo(0, 0)
    // Best effort: some browsers re-read the file from disk on every .text().
    watcher = new FileWatcher({ getFile: async () => file, compareText: true }, onWatch, {
      visible: 2000,
      hidden: 6000,
    })
    await watcher.acknowledge(text, file)
    watcher.start()
    refreshUI()
  }

  async function newDocument(text = '') {
    if (!(await confirmLeave())) return
    stopWatching()
    resetAssets()
    session = { kind: 'new', name: 'Untitled.md' }
    showDoc()
    loadText(text)
    refreshUI()
    if (mode === 'rich') ed.editor.commands.focus('start')
    else source.focus()
  }

  async function openFileFlow() {
    if (!fs.canOpenFiles) {
      fileInput.value = ''
      fileInput.click()
      return
    }
    try {
      const handle = await fs.pickFile()
      if (!handle || !(await confirmLeave())) return
      await openHandle(handle)
    } catch (err) {
      toast(`Couldn't open file: ${(err as Error).message}`)
    }
  }
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (f) openSnapshot(f)
  })

  async function openRecent(r: fs.Recent) {
    const ok = await fs.ensurePermission(r.handle, 'read', true)
    if (!ok) return toast('Permission was not granted')
    try {
      if (!(await confirmLeave())) return
      await r.handle.getFile()
      await openHandle(r.handle)
    } catch {
      toast(`${r.name} is no longer available`)
      await fs.forgetRecent(r.handle)
      renderEmpty()
    }
  }

  function closeFile() {
    stopWatching()
    resetAssets()
    session = null
    conflictText = null
    dirty = false
    frontmatter = null
    source.value = ''
    ed.setMarkdown('')
    diskText = baseline = ''
    refreshUI()
  }

  // ---------- Live reload ----------
  function onWatch(e: WatchEvent) {
    if (disposed) return
    switch (e.type) {
      case 'change': {
        if (dirty && currentText() !== baseline) {
          conflictText = e.text
          refreshUI()
          return
        }
        loadText(e.text, { external: true })
        if (mode === 'source') flash(source)
        break
      }
      case 'missing':
        missing = true
        refreshUI()
        break
      case 'restored':
        missing = false
        refreshUI()
        break
      case 'unreadable':
        unreadable = true
        watcher?.stop()
        refreshUI()
        break
    }
  }

  function flash(el: HTMLElement) {
    el.classList.remove('md-flash')
    void el.offsetWidth
    el.classList.add('md-flash')
  }

  // ---------- Relative images & links (folder access, behind the scenes) ----------
  const assetRoot = () => (session?.kind === 'handle' ? session.root : null)

  async function resolveImage(src: string): Promise<string | null> {
    const r = assetRoot()
    if (!r) {
      if (session?.kind === 'handle' && fs.canOpenFolders && !needsAssets) {
        needsAssets = true
        refreshUI()
      }
      return null
    }
    const path = fs.joinPath(r.path, src)
    if (path == null) return null
    const hit = imageCache.get(path)
    if (hit) return hit
    const handle = await fs.getFileAt(r.dir, path)
    if (!handle) return null
    const url = URL.createObjectURL(await handle.getFile())
    imageCache.set(path, url)
    return url
  }
  function clearImageCache() {
    for (const url of imageCache.values()) URL.revokeObjectURL(url)
    imageCache.clear()
  }

  /** One click: re-grant a remembered folder, or pick the file's folder. */
  async function grantAssets(): Promise<boolean> {
    if (session?.kind !== 'handle') return false
    const s = session
    try {
      if (s.pendingRoot && (await fs.ensurePermission(s.pendingRoot.dir, 'read', true))) {
        s.root = s.pendingRoot
      } else {
        const picked = await fs.pickRootFor(s.handle)
        if (!picked) return false
        if (picked === 'mismatch') {
          toast(`That folder doesn't contain ${s.name}`)
          return false
        }
        s.root = picked
      }
    } catch (err) {
      toast(`Couldn't get folder access: ${(err as Error).message}`)
      return false
    }
    s.pendingRoot = null
    if (session !== s) return false
    needsAssets = false
    clearImageCache()
    window.dispatchEvent(new Event('md:assets'))
    refreshUI()
    return true
  }

  function openLink(href: string) {
    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1)).toLowerCase()
      const target = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).find((el) => slug(el.textContent ?? '') === id)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    if (session?.kind !== 'handle' || !fs.canOpenFolders) return toast('Relative links need Chrome or Edge')
    followRelative(href)
  }

  async function followRelative(href: string) {
    if (session?.kind !== 'handle') return
    if (!session.root && !(await grantAssets())) return
    const r = (session as Extract<Session, { kind: 'handle' }>).root!
    const path = fs.joinPath(r.path, href)
    const handle = path != null ? await fs.getFileAt(r.dir, path) : null
    if (!handle || path == null) return toast(`Not found: ${href}`)
    if (!fs.MD_EXT.test(path)) {
      window.open(URL.createObjectURL(await handle.getFile()), '_blank', 'noopener')
      return
    }
    if (!(await confirmLeave())) return
    await openHandle(handle, { root: { dir: r.dir, path } })
  }

  const slug = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')

  // ---------- Empty state ----------
  async function renderEmpty() {
    empty.innerHTML = ''
    const inner = h(
      'div',
      { class: 'empty-inner' },
      h('h1', { class: 'empty-title' }, 'Markdown'),
      h(
        'p',
        { class: 'empty-sub' },
        'Open any markdown file to read and edit it like a page. When the file changes on disk, this view updates within a second.',
      ),
      h(
        'div',
        { class: 'empty-actions' },
        h(
          'button',
          { class: 'btn btn-primary', onClick: openFileFlow },
          h('span', { html: icon('file', 15) }),
          'Open file',
          h('kbd', {}, kbd('mod+o')),
        ),
        h('button', { class: 'btn', onClick: () => newDocument() }, h('span', { html: icon('plus', 15) }), 'New page'),
      ),
      fs.canOpenFiles
        ? null
        : h(
            'p',
            { class: 'empty-note' },
            h('span', { html: icon('alert', 14) }),
            'This browser can open and read files, but saving in place and reliable live reload need Chrome, Edge, Arc or another Chromium browser. Saves download a copy.',
          ),
    )
    empty.append(inner)
    const recents = await fs.getRecents()
    if (recents.length && !session) {
      const list = h('ul', { class: 'recent-list' })
      for (const r of recents.slice(0, 8)) {
        list.append(
          h(
            'li',
            {},
            h(
              'button',
              { class: 'recent-row', onClick: () => openRecent(r) },
              h('span', { class: 'recent-icon', html: icon('fileText', 16) }),
              h('span', { class: 'recent-name' }, r.name),
              h('span', { class: 'recent-time' }, relativeTime(r.openedAt)),
            ),
          ),
        )
      }
      inner.append(h('div', { class: 'recent' }, h('div', { class: 'recent-head' }, 'Recent'), list))
    }
    inner.append(
      h(
        'p',
        { class: 'empty-foot' },
        'or drop a file anywhere · ',
        h('button', { class: 'link-btn', onClick: () => newDocument(SAMPLE) }, 'try a sample page'),
      ),
    )
  }

  function showDoc() {
    empty.hidden = true
    doc.hidden = false
  }

  // ---------- Chrome (status, banner, hint, buttons) ----------
  function refreshUI() {
    if (disposed) return
    const hasDoc = !!session
    empty.hidden = hasDoc
    doc.hidden = !hasDoc
    if (!hasDoc) renderEmpty()

    root.classList.toggle('is-full', fullWidth)
    doc.classList.toggle('is-source', mode === 'source')
    sourceBtn.setAttribute('aria-pressed', String(mode === 'source'))
    sourceBtn.hidden = !hasDoc

    crumbName.textContent = session ? session.name : ''
    crumbName.title = session?.name ?? ''
    document.title = session ? `${session.name}${dirty ? ' •' : ''} · Markdown` : 'Markdown · tools.huy.rocks'

    // Status pill
    let label = ''
    let tone = ''
    let tip = ''
    if (session) {
      if (missing) [label, tone, tip] = ['File missing', 'danger', 'The file was moved or deleted. Save as… to keep this copy.']
      else if (saving) [label, tone, tip] = ['Saving…', 'muted', '']
      else if (conflictText != null) [label, tone, tip] = ['Conflict', 'warn', 'The file changed on disk while you had unsaved edits.']
      else if (session.kind === 'new')
        [label, tone, tip] = [dirty ? 'Unsaved' : 'Draft', dirty ? 'warn' : 'muted', `Save with ${kbd('mod+s')}`]
      else if (session.kind === 'handle' && session.writable === false && dirty)
        [label, tone, tip] = ['Read-only', 'warn', 'Write access was not granted. Use Save as…']
      else if (dirty && !(autosave && session.kind === 'handle'))
        [label, tone, tip] = ['Unsaved', 'warn', `Save with ${kbd('mod+s')}`]
      else if (Date.now() - justSaved < 1500) [label, tone, tip] = ['Saved', 'live', '']
      else if (session.kind === 'snapshot' && unreadable)
        [label, tone, tip] = ['Snapshot', 'muted', 'This browser can’t re-read the file. Use Chrome or Edge for live reload.']
      else if (unreadable) [label, tone, tip] = ['Not watching', 'warn', 'The file could not be read. Reopen it to resume.']
      else [label, tone, tip] = ['Live', 'live', 'Watching the file for changes on disk']
    }
    status.hidden = !label
    status.className = `md-status tone-${tone}`
    status.innerHTML = ''
    if (label) status.append(h('span', { class: 'dot' }), label)
    status.title = tip

    // Relative-image hint (folder access is an implementation detail)
    hint.innerHTML = ''
    hint.hidden = !(needsAssets && !assetsDismissed && session?.kind === 'handle' && !session.root)
    if (!hint.hidden) {
      hint.append(
        h('span', { class: 'hint-icon', html: icon('image', 15) }),
        h('span', { class: 'hint-text' }, 'This page has images stored next to the file.'),
        h('button', { class: 'btn btn-sm', onClick: () => grantAssets() }, 'Show images'),
        h('button', {
          class: 'icon-btn hint-close',
          'aria-label': 'Dismiss',
          html: icon('x', 14),
          onClick: () => {
            assetsDismissed = true
            refreshUI()
          },
        }),
      )
    }

    // Banner
    banner.innerHTML = ''
    banner.hidden = true
    if (conflictText != null) {
      banner.hidden = false
      banner.className = 'md-banner tone-warn'
      banner.append(
        h('span', { class: 'banner-icon', html: icon('alert', 15) }),
        h('span', { class: 'banner-text' }, 'This file changed on disk while you were editing.'),
        h('button', { class: 'btn btn-sm', onClick: () => loadText(conflictText!, { external: true }) }, 'Load disk version'),
        h('button', { class: 'btn btn-sm', onClick: () => keepMine() }, 'Keep mine'),
      )
    } else if (missing) {
      banner.hidden = false
      banner.className = 'md-banner tone-danger'
      banner.append(
        h('span', { class: 'banner-icon', html: icon('alert', 15) }),
        h('span', { class: 'banner-text' }, 'The file was moved or deleted. Waiting for it to come back.'),
        fs.canSaveAs
          ? h('button', { class: 'btn btn-sm', onClick: () => save({ saveAs: true, explicit: true }) }, 'Save as…')
          : '',
      )
    }
  }

  async function keepMine() {
    const text = conflictText
    conflictText = null
    if (text != null) diskText = text
    dirty = true
    if (session?.kind === 'handle') await save({ explicit: true })
    refreshUI()
  }

  // ---------- Mode ----------
  function setMode(next: Mode) {
    if (next === mode || !session) return
    const wasDirty = dirty && currentText() !== baseline
    const text = wasDirty ? currentText() : diskText
    mode = next
    pref.set('mode', mode)
    doc.classList.toggle('is-source', mode === 'source')
    render(text)
    baseline = baselineFor(diskText)
    dirty = currentText() !== baseline
    refreshUI()
    if (mode === 'source') {
      autosize()
      source.focus({ preventScroll: true })
    } else ed.editor.commands.focus(undefined, { scrollIntoView: false })
  }
  sourceBtn.addEventListener('click', () => setMode(mode === 'rich' ? 'source' : 'rich'))

  // ---------- Menus ----------
  openBtn.addEventListener('click', async () => {
    if (openBtn.getAttribute('aria-expanded') === 'true') return toggleMenu(openBtn, () => [])
    const recents = await fs.getRecents()
    const entries: MenuEntry[] = [
      { label: 'Open file…', icon: icon('file'), hint: kbd('mod+o'), onSelect: openFileFlow },
      { label: 'New page', icon: icon('plus'), onSelect: () => newDocument() },
    ]
    if (recents.length) {
      entries.push('separator', { heading: 'Recent' })
      for (const r of recents.slice(0, 6))
        entries.push({
          label: r.name,
          icon: icon('fileText'),
          hint: relativeTime(r.openedAt),
          onSelect: () => openRecent(r),
        })
    }
    showMenu(openBtn, entries, { align: 'right' })
  })

  moreBtn.addEventListener('click', () =>
    toggleMenu(
      moreBtn,
      () => [
        { label: 'Save', icon: icon('save'), hint: kbd('mod+s'), disabled: !session, onSelect: () => save({ explicit: true }) },
        ...(fs.canSaveAs
          ? [
              {
                label: 'Save as…',
                hint: kbd('mod+shift+s'),
                disabled: !session,
                onSelect: () => save({ saveAs: true, explicit: true }),
              } as MenuEntry,
            ]
          : []),
        {
          label: 'Download .md',
          icon: icon('download'),
          disabled: !session,
          onSelect: () => session && fs.downloadText(nameOf(session), currentText()),
        },
        {
          label: 'Reload from disk',
          icon: icon('refresh'),
          disabled: session?.kind !== 'handle',
          onSelect: async () => {
            if (session?.kind !== 'handle') return
            if (dirty && !confirm('Discard your unsaved changes and reload?')) return
            const text = await (await session.handle.getFile()).text()
            await watcher?.acknowledge(text)
            loadText(text)
            toast('Reloaded')
          },
        },
        'separator',
        {
          label: 'Markdown source',
          icon: icon('code'),
          hint: kbd('mod+/'),
          checked: mode === 'source',
          disabled: !session,
          onSelect: () => setMode(mode === 'rich' ? 'source' : 'rich'),
        },
        {
          label: 'Autosave',
          checked: autosave,
          onSelect: () => {
            autosave = !autosave
            pref.set('autosave', autosave ? '1' : '0')
            if (autosave && dirty && session?.kind === 'handle') scheduleCheck(0)
            refreshUI()
          },
        },
        { label: 'Full width', icon: icon('width'), checked: fullWidth, onSelect: () => toggleWidth() },
        'separator',
        { label: 'Close file', disabled: !session, onSelect: async () => (await confirmLeave()) && closeFile() },
      ],
      { align: 'right' },
    ),
  )

  function toggleWidth() {
    fullWidth = !fullWidth
    pref.set('fullWidth', fullWidth ? '1' : '0')
    refreshUI()
  }

  // ---------- Keyboard ----------
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const k = e.key.toLowerCase()
    if (k === 's') {
      e.preventDefault()
      save({ saveAs: e.shiftKey, explicit: true })
    } else if (k === 'o' && !e.shiftKey) {
      e.preventDefault()
      openFileFlow()
    } else if (k === '/' && session) {
      e.preventDefault()
      setMode(mode === 'rich' ? 'source' : 'rich')
    }
  }
  document.addEventListener('keydown', onKey)

  // ---------- Drag & drop ----------
  let dragDepth = 0
  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    dragDepth++
    root.classList.add('is-dragging')
  }
  const onDragLeave = () => {
    if (--dragDepth <= 0) {
      dragDepth = 0
      root.classList.remove('is-dragging')
    }
  }
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }
  const onDrop = async (e: DragEvent) => {
    dragDepth = 0
    root.classList.remove('is-dragging')
    const item = e.dataTransfer?.items?.[0]
    if (!item || item.kind !== 'file') return
    e.preventDefault()
    e.stopPropagation()
    // Must be requested synchronously, before any await.
    const handlePromise = item.getAsFileSystemHandle?.()
    const file = item.getAsFile()
    const handle = await handlePromise?.catch(() => null)
    if (handle?.kind === 'directory') return toast('Drop a markdown file, not a folder')
    if (handle?.kind === 'file') {
      if (!(await confirmLeave())) return
      return openHandle(handle as FileSystemFileHandle)
    }
    if (file) openSnapshot(file)
  }
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onDrop, true)

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty && session) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  refreshUI()

  // Test hook (dev builds only): drive the tool with OPFS handles from Playwright.
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__md = {
      openHandle: (handle: FileSystemFileHandle, root?: fs.AssetRoot) => openHandle(handle, { root }),
      state: () => ({
        dirty,
        mode,
        diskText,
        text: currentText(),
        conflict: conflictText != null,
        status: status.textContent,
        hasRoot: !!assetRoot(),
      }),
    }
  }

  return {
    unmount() {
      // Best-effort flush of pending edits when switching tools.
      if (dirty && session?.kind === 'handle' && session.writable && conflictText == null) {
        fs.writeFile(session.handle, currentText()).catch(() => {})
      }
      disposed = true
      stopWatching()
      clearTimeout(changeTimer)
      clearImageCache()
      ed.destroy()
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
      root.remove()
      document.title = 'tools.huy.rocks'
    },
  }
}

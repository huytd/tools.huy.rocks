import { createStore, get, set } from 'idb-keyval'

export const canOpenFiles = typeof window.showOpenFilePicker === 'function'
export const canOpenFolders = typeof window.showDirectoryPicker === 'function'
export const canSaveAs = typeof window.showSaveFilePicker === 'function'

export const MD_EXT = /\.(md|markdown|mdx|mdown|mkd|mkdn|txt)$/i
const PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: 'Markdown',
    accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.mdown', '.mkd', '.mkdn'], 'text/plain': ['.txt'] },
  },
]

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export async function pickFile(): Promise<FileSystemFileHandle | null> {
  try {
    const [h] = await window.showOpenFilePicker!({ id: 'md-open', types: PICKER_TYPES })
    return h ?? null
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({ id: 'md-folder', mode: 'read' })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

export async function pickSaveFile(suggestedName: string): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({ id: 'md-save', suggestedName, types: PICKER_TYPES })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Query, then (if allowed by a user gesture) request permission. */
export async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite',
  request = true,
): Promise<boolean> {
  if (!handle.queryPermission) return true
  try {
    if ((await handle.queryPermission({ mode })) === 'granted') return true
    if (!request || !handle.requestPermission) return false
    return (await handle.requestPermission({ mode })) === 'granted'
  } catch {
    return false
  }
}

export async function writeFile(handle: FileSystemFileHandle, text: string) {
  const w = await handle.createWritable()
  await w.write(text)
  await w.close()
}

/** Fallback "save" for browsers without the File System Access API. */
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Resolve `target` (relative to `fromPath`'s folder, or root-absolute with a leading /). */
export function joinPath(fromPath: string, target: string): string | null {
  const clean = decodeURI(target.split(/[?#]/)[0])
  const base = clean.startsWith('/') ? [] : fromPath.split('/').slice(0, -1)
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!base.length) return null
      base.pop()
    } else base.push(part)
  }
  return base.join('/')
}

export async function getFileAt(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | null> {
  const parts = path.split('/').filter(Boolean)
  let dir = root
  try {
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    return await dir.getFileHandle(parts[parts.length - 1])
  } catch {
    return null
  }
}

// ---------- Persistence (handles are structured-cloneable into IndexedDB) ----------
export interface Recent {
  kind: 'file'
  name: string
  handle: FileSystemFileHandle
  openedAt: number
}

const store = (() => {
  try {
    return createStore('tools-huy-rocks', 'markdown')
  } catch {
    return null
  }
})()

export async function getRecents(): Promise<Recent[]> {
  if (!store) return []
  try {
    return ((await get<Recent[]>('recents', store)) ?? [])
      .filter((r) => r.kind === 'file')
      .sort((a, b) => b.openedAt - a.openedAt)
  } catch {
    return []
  }
}

export async function rememberRecent(handle: FileSystemFileHandle) {
  if (!store) return
  try {
    const keep: Recent[] = []
    for (const r of await getRecents()) if (!(await r.handle.isSameEntry(handle).catch(() => false))) keep.push(r)
    keep.unshift({ kind: 'file', name: handle.name, handle, openedAt: Date.now() })
    await set('recents', keep.slice(0, 12), store)
  } catch {
    /* storage unavailable — recents are a convenience only */
  }
}

export async function forgetRecent(handle: FileSystemHandle) {
  if (!store) return
  try {
    const keep: Recent[] = []
    for (const r of await getRecents()) if (!(await r.handle.isSameEntry(handle).catch(() => false))) keep.push(r)
    await set('recents', keep, store)
  } catch {}
}

/**
 * Folders the user granted so relative images and links can resolve.
 * The UI stays file-level; a folder is only ever an access grant for embeds.
 */
export interface AssetRoot {
  dir: FileSystemDirectoryHandle
  path: string // the open file's path inside `dir`
}

async function getRootDirs(): Promise<FileSystemDirectoryHandle[]> {
  if (!store) return []
  try {
    return (await get<FileSystemDirectoryHandle[]>('roots', store)) ?? []
  } catch {
    return []
  }
}

export async function rememberRoot(dir: FileSystemDirectoryHandle) {
  if (!store) return
  try {
    const keep: FileSystemDirectoryHandle[] = [dir]
    for (const d of await getRootDirs()) if (!(await d.isSameEntry(dir).catch(() => false))) keep.push(d)
    await set('roots', keep.slice(0, 24), store)
  } catch {}
}

/**
 * Find a previously granted folder that contains `file`. Prefers the widest
 * folder (most `../` reach). `granted` is false when the browser needs the
 * user to re-confirm access (e.g. after a restart) — one click, no picker.
 */
export async function findRoot(file: FileSystemFileHandle): Promise<(AssetRoot & { granted: boolean }) | null> {
  let best: (AssetRoot & { granted: boolean }) | null = null
  for (const dir of await getRootDirs()) {
    try {
      const parts = await dir.resolve(file)
      if (!parts) continue
      const granted = (await dir.queryPermission?.({ mode: 'read' })) !== 'prompt'
      const cand = { dir, path: parts.join('/'), granted }
      if (!best || (cand.granted && !best.granted) || (cand.granted === best.granted && parts.length > best.path.split('/').length))
        best = cand
    } catch {
      /* handle no longer valid */
    }
  }
  return best
}

/** Ask for the folder containing `file`, opening the picker right next to it. */
export async function pickRootFor(file: FileSystemFileHandle): Promise<AssetRoot | 'mismatch' | null> {
  let dir: FileSystemDirectoryHandle
  try {
    dir = await window.showDirectoryPicker!({ id: 'md-assets', mode: 'read', startIn: file })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
  const parts = await dir.resolve(file).catch(() => null)
  if (!parts) return 'mismatch'
  await rememberRoot(dir)
  return { dir, path: parts.join('/') }
}

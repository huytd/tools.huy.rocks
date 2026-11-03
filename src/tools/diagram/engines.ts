import { renderMermaid } from '../../ui/mermaid'
import { mermaidLookConfig, type MermaidLook } from './mermaid-theme'

export type Lang = 'mermaid' | 'plantuml' | 'd2'

export interface LangInfo {
  id: Lang
  name: string
  ext: string
  /** Where rendering happens, shown in the language menu. */
  where: string
  docs: string
}

export const LANGS: LangInfo[] = [
  { id: 'mermaid', name: 'Mermaid', ext: 'mmd', where: 'Renders in your browser', docs: 'https://mermaid.js.org/intro/' },
  { id: 'plantuml', name: 'PlantUML', ext: 'puml', where: 'Renders on a PlantUML server', docs: 'https://plantuml.com/' },
  { id: 'd2', name: 'D2', ext: 'd2', where: 'Renders in your browser (WebAssembly)', docs: 'https://d2lang.com/tour/intro' },
]
export const langInfo = (id: Lang) => LANGS.find((l) => l.id === id)!

const EXTS: Record<string, Lang> = {
  mmd: 'mermaid',
  mermaid: 'mermaid',
  puml: 'plantuml',
  plantuml: 'plantuml',
  pu: 'plantuml',
  iuml: 'plantuml',
  wsd: 'plantuml',
  d2: 'd2',
}
export const FILE_ACCEPT = Object.keys(EXTS)
  .map((e) => `.${e}`)
  .concat('.txt')
  .join(',')

/** Pick a language from a file name, falling back to sniffing the text. */
export function detectLang(name: string, text: string): Lang | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (EXTS[ext]) return EXTS[ext]
  const head = text.replace(/^\s*(%%.*\n|'.*\n|#.*\n|\s)*/g, '')
  if (/^@start\w+/.test(head)) return 'plantuml'
  if (
    /^(---\n[\s\S]*?\n---\s*)?(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|C4\w+|sankey|xychart|block|packet|kanban|architecture|requirementDiagram|radar|treemap)\b/.test(
      head,
    )
  )
    return 'mermaid'
  return text.trim() ? 'd2' : null
}

export class DiagramError extends Error {
  /** 1-based source line the error points at, when known. */
  line?: number
  /** An SVG that describes the error (PlantUML draws one). */
  svg?: string
  constructor(message: string, line?: number, svg?: string) {
    super(message)
    this.line = line
    this.svg = svg
  }
}

export interface RenderOptions {
  dark: boolean
  fontFamily: string
  signal: AbortSignal
  mermaidLook: MermaidLook
  /** Draw labels as SVG text: canvases refuse to export SVGs that contain HTML labels. */
  plainLabels?: boolean
  plantumlServer: string
  d2Layout: 'dagre' | 'elk'
  d2Sketch: boolean
}

export function render(lang: Lang, code: string, opts: RenderOptions): Promise<string> {
  if (lang === 'mermaid') return mermaid(code, opts)
  if (lang === 'plantuml') return plantuml(code, opts)
  return d2(code, opts)
}

// ---------- Mermaid ----------
async function mermaid(code: string, opts: RenderOptions): Promise<string> {
  try {
    const config = mermaidLookConfig(opts.mermaidLook, opts.dark, opts.fontFamily)
    if (opts.plainLabels) config.htmlLabels = false
    return await renderMermaid(code, opts.fontFamily, config)
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).trim() || 'Invalid diagram'
    const line = /\bline (\d+)/i.exec(msg)
    throw new DiagramError(msg, line ? Number(line[1]) : undefined)
  }
}

// ---------- PlantUML ----------
// PlantUML is a Java program and there's no practical in-browser build, so it renders on a
// server. The source travels in the URL, deflated and base64-encoded the way PlantUML expects.
const PUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

export async function plantumlEncode(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1] ?? 0
    const b3 = bytes[i + 2] ?? 0
    out +=
      PUML_ALPHABET[b1 >> 2] +
      PUML_ALPHABET[((b1 & 3) << 4) | (b2 >> 4)] +
      PUML_ALPHABET[((b2 & 15) << 2) | (b3 >> 6)] +
      PUML_ALPHABET[b3 & 63]
  }
  return out
}

export const DEFAULT_PLANTUML_SERVER = 'https://www.plantuml.com/plantuml'

export function normalizeServer(url: string): string {
  let s = url.trim().replace(/\/+$/, '')
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`
  return s.replace(/\/(svg|dsvg|png|uml)$/i, '')
}

const pumlCache = new Map<string, { ok: boolean; svg: string; error: string | null; line: number | null }>()

async function plantuml(code: string, opts: RenderOptions): Promise<string> {
  let text = code.trim()
  // The server wants a @start…/@end… pair; add one so a bare body still renders.
  if (!/^@start\w+/m.test(text)) text = `@startuml\n${text}\n@enduml`
  const url = `${opts.plantumlServer}/${opts.dark ? 'dsvg' : 'svg'}/${await plantumlEncode(text)}`
  let res = pumlCache.get(url)
  if (!res) {
    let r: Response
    try {
      r = await fetch(url, { signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      throw new DiagramError(`Couldn't reach the PlantUML server at ${new URL(opts.plantumlServer).host}.`)
    }
    const body = await r.text()
    const isSvg = /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(body)
    const errLine = r.headers.get('x-plantuml-diagram-error-line')
    res = {
      ok: r.ok && isSvg,
      svg: isSvg ? body : '',
      error: r.ok ? null : r.headers.get('x-plantuml-diagram-error') ?? (isSvg ? 'PlantUML reported an error (see the preview).' : `The server answered ${r.status} ${r.statusText}`.trim()),
      line: errLine ? Number(errLine) : null,
    }
    if (r.ok || r.status === 400) {
      if (pumlCache.size > 60) pumlCache.delete(pumlCache.keys().next().value!)
      pumlCache.set(url, res)
    }
  }
  if (res.ok) return res.svg
  // Lines are counted from the @start line, which may follow comments or blank lines.
  const offset = res.line != null ? code.split('\n').findIndex((l) => /^\s*@start\w+/.test(l)) : -1
  const line = res.line == null ? undefined : offset >= 0 ? res.line + offset : res.line
  throw new DiagramError(res.error ?? 'PlantUML error', line, res.svg || undefined)
}

// ---------- D2 ----------
// The official WebAssembly build. It's large (~8 MB), so it loads on first use; it runs in a
// worker that handles one request at a time.
type D2Instance = InstanceType<typeof import('@terrastruct/d2').D2>
let d2Lib: Promise<D2Instance> | null = null
let d2Queue: Promise<unknown> = Promise.resolve()

export const d2Loaded = () => d2Lib !== null

function d2Instance(): Promise<D2Instance> {
  d2Lib ??= import('@terrastruct/d2').then((m) => {
    const inst = new m.D2()
    return (inst as unknown as { ready: Promise<void> }).ready.then(() => inst)
  })
  d2Lib.catch(() => (d2Lib = null))
  return d2Lib
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out`)), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}

function d2(code: string, opts: RenderOptions): Promise<string> {
  const job = d2Queue.then(async () => {
    if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const d2 = await d2Instance()
    if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    // Settings written in the file (vars.d2-config) win over the app's defaults.
    const options: import('@terrastruct/d2').CompileOptions = {}
    if (!/\btheme-id\s*:/.test(code)) options.themeID = opts.dark ? 200 : 0
    if (!/\blayout-engine\s*:/.test(code)) options.layout = opts.d2Layout
    if (opts.d2Sketch && !/\bsketch\s*:/.test(code)) options.sketch = true
    let result
    try {
      result = await withTimeout(d2.compile({ fs: { index: code }, options }), 30000, 'D2 layout')
    } catch (err) {
      throw d2Error(err)
    }
    try {
      return await withTimeout(
        d2.render(result.diagram, { ...result.renderOptions, noXMLTag: true, salt: String(Date.now()) }),
        30000,
        'D2 render',
      )
    } catch (err) {
      throw d2Error(err)
    }
  })
  d2Queue = job.catch((err) => {
    // A worker that timed out may be wedged; start a fresh one next time.
    if (/timed out/.test(String(err?.message))) d2Lib = null
  })
  return job
}

function d2Error(err: unknown): Error {
  if (err instanceof DiagramError || (err as Error)?.name === 'AbortError') return err as Error
  const raw = String((err as Error)?.message ?? err)
  try {
    const list = JSON.parse(raw) as { errmsg: string }[]
    if (Array.isArray(list) && list.length) {
      const msgs = list.map((e) => e.errmsg.replace(/^index:/, 'line '))
      const m = /^index:(\d+)/.exec(list[0].errmsg)
      return new DiagramError(msgs.join('\n'), m ? Number(m[1]) : undefined)
    }
  } catch {}
  const m = /index:(\d+)/.exec(raw)
  return new DiagramError(raw.replace(/index:/g, 'line '), m ? Number(m[1]) : undefined)
}

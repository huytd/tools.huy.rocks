const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

export class SvgError extends Error {
  line?: number
  constructor(message: string, line?: number) {
    super(message)
    this.line = line
  }
}

export interface ParsedSvg {
  /** The source with any missing namespace declarations added; what gets drawn and exported. */
  markup: string
  doc: Document
  width: number
  height: number
  viewBox: string | null
  elements: number
  /** Repairs made to `markup`, for the info line. */
  fixes: string[]
}

/**
 * Hand-written SVG often leaves out xmlns, which browsers require when the file stands alone
 * (and an <img> treats it as one). Add the declarations on the root tag; line numbers stay put.
 */
function fixNamespaces(src: string): { markup: string; fixes: string[] } {
  const m = /<svg\b[^>]*>/.exec(src)
  if (!m) return { markup: src, fixes: [] }
  const tag = m[0]
  const add: string[] = []
  const fixes: string[] = []
  if (!/\sxmlns\s*=/.test(tag)) {
    add.push(`xmlns="${SVG_NS}"`)
    fixes.push('xmlns')
  }
  if (/\bxlink:/.test(src) && !/\sxmlns:xlink\s*=/.test(tag)) {
    add.push(`xmlns:xlink="${XLINK_NS}"`)
    fixes.push('xmlns:xlink')
  }
  if (!add.length) return { markup: src, fixes }
  const fixed = tag.replace(/^<svg\b/, `<svg ${add.join(' ')}`)
  return { markup: src.slice(0, m.index) + fixed + src.slice(m.index + tag.length), fixes }
}

const UNITS: Record<string, number> = { '': 1, px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, ex: 8 }

/** An absolute length in px, or null for percentages, auto and junk. */
function length(v: string | null): number | null {
  if (!v) return null
  const m = /^\s*([+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([a-z]*)\s*$/i.exec(v)
  if (!m || !(m[2].toLowerCase() in UNITS)) return null
  const n = Number(m[1]) * UNITS[m[2].toLowerCase()]
  return n > 0 ? n : null
}

export function parseSvg(src: string): ParsedSvg {
  const { markup, fixes } = fixNamespaces(src)
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const err = doc.getElementsByTagName('parsererror')[0]
  if (err) throw parseError(err.textContent ?? '')
  const root = doc.documentElement
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    throw new SvgError(`The root element is <${root.nodeName}>, not <svg>.`, 1)
  }

  const vbAttr = root.getAttribute('viewBox')
  const vb = vbAttr?.trim().split(/[\s,]+/).map(Number)
  const validVb = vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? vb : null
  let width = length(root.getAttribute('width'))
  let height = length(root.getAttribute('height'))
  if (validVb) {
    const ratio = validVb[3] / validVb[2]
    if (width && !height) height = width * ratio
    else if (height && !width) width = height / ratio
    else if (!width && !height) {
      width = validVb[2]
      height = validVb[3]
    }
  }
  // What a browser falls back to for a replaced element with no size.
  width ??= 300
  height ??= 150

  return {
    markup,
    doc,
    width,
    height,
    viewBox: validVb ? validVb.join(' ') : null,
    elements: doc.getElementsByTagName('*').length,
    fixes,
  }
}

/** Pull "line N … message" out of the browser's parsererror text (wording differs per engine). */
function parseError(text: string): SvgError {
  const t = text.replace(/\s+/g, ' ').trim()
  // Chromium/WebKit: "error on line 3 at column 7: Opening and ending tag mismatch: g line 2 and svg"
  let m = /line (\d+) at column (\d+):\s*(.+?)(?:\s*Below is a rendering.*)?$/i.exec(t)
  if (m) return new SvgError(`Line ${m[1]}, column ${m[2]}: ${m[3]}`, Number(m[1]))
  // Firefox: "XML Parsing Error: mismatched tag. Expected: </g>. Location: … Line Number 5, Column 3: …"
  m = /XML Parsing Error:\s*(.+?)\s*Location:.*?Line Number (\d+), Column (\d+)/i.exec(t)
  if (m) return new SvgError(`Line ${m[2]}, column ${m[3]}: ${m[1]}`, Number(m[2]))
  return new SvgError(t || 'This isn’t valid SVG')
}

// ---------- Formatting ----------
const INLINE = new Set(['text', 'tspan', 'textPath', 'title', 'desc', 'style', 'script', 'a'])
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Re-indent the document two spaces per level. Text-bearing elements (<text>, <style>, …) are
 * kept exactly as written, since whitespace inside them can matter.
 */
export function formatSvg(src: string): string {
  const parsed = parseSvg(src)
  const out: string[] = []
  const decl = /^\s*(<\?xml[^>]*\?>)/.exec(src)
  if (decl) out.push(decl[1])
  const serializer = new XMLSerializer()

  const openTag = (el: Element, pad: string, close: string) => {
    const attrs = [...el.attributes].map((a) => `${a.name}="${escAttr(a.value)}"`)
    const one = `${pad}<${el.nodeName}${attrs.length ? ' ' + attrs.join(' ') : ''}${close}`
    if (one.length <= 110 || attrs.length < 3) return one
    return `${pad}<${el.nodeName}\n${attrs.map((a) => `${pad}    ${a}`).join('\n')}${close}`
  }

  const walk = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth)
    switch (node.nodeType) {
      case Node.ELEMENT_NODE: {
        const el = node as Element
        const kids = [...el.childNodes].filter((c) => !(c.nodeType === Node.TEXT_NODE && !c.textContent!.trim()))
        if (!kids.length) {
          out.push(openTag(el, pad, ' />'))
        } else if (INLINE.has(el.localName) || kids.every((c) => c.nodeType === Node.TEXT_NODE || c.nodeType === Node.CDATA_SECTION_NODE)) {
          const inner = [...el.childNodes].map((c) => serializer.serializeToString(c)).join('')
          out.push(`${openTag(el, pad, '>')}${inner}</${el.nodeName}>`)
        } else {
          out.push(openTag(el, pad, '>'))
          for (const c of kids) walk(c, depth + 1)
          out.push(`${pad}</${el.nodeName}>`)
        }
        break
      }
      case Node.TEXT_NODE:
        out.push(pad + escText(node.textContent!.trim()))
        break
      case Node.CDATA_SECTION_NODE:
        out.push(`${pad}<![CDATA[${node.textContent}]]>`)
        break
      case Node.COMMENT_NODE:
        out.push(`${pad}<!--${node.textContent}-->`)
        break
      case Node.PROCESSING_INSTRUCTION_NODE: {
        const pi = node as ProcessingInstruction
        out.push(`${pad}<?${pi.target} ${pi.data}?>`)
        break
      }
      case Node.DOCUMENT_TYPE_NODE: {
        const dt = node as DocumentType
        const ids = dt.publicId ? ` PUBLIC "${dt.publicId}" "${dt.systemId}"` : dt.systemId ? ` SYSTEM "${dt.systemId}"` : ''
        out.push(`<!DOCTYPE ${dt.name}${ids}>`)
        break
      }
    }
  }
  for (const n of parsed.doc.childNodes) walk(n, 0)
  return out.join('\n') + '\n'
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const byteSize = (s: string) => new Blob([s]).size

/** A data: URI, percent-encoded so it's safe in HTML attributes and CSS url(). */
export const dataUri = (markup: string) => `data:image/svg+xml,${encodeURIComponent(markup.trim())}`

export interface PreparedSvg {
  el: SVGSVGElement
  width: number
  height: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Turn renderer output into a detached, inert <svg> with an explicit size. Parsing happens in
 * a <template> so nothing runs; scripts, event handlers and javascript: links are dropped
 * (PlantUML output comes from a server, so it's treated as untrusted).
 */
export function prepareSvg(markup: string): PreparedSvg {
  const tpl = document.createElement('template')
  tpl.innerHTML = markup.replace(/^\s*<\?xml[^>]*>/, '')
  const svg = tpl.content.querySelector('svg')
  if (!svg) throw new Error('The renderer returned no SVG')
  sanitize(tpl.content)

  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  let width = vb && vb.length === 4 ? vb[2] : NaN
  let height = vb && vb.length === 4 ? vb[3] : NaN
  if (!(width > 0 && height > 0)) {
    width = parseFloat(svg.getAttribute('width') ?? '') || 800
    height = parseFloat(svg.getAttribute('height') ?? '') || 600
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.width = `${width}px`
  svg.style.height = `${height}px`
  svg.style.maxWidth = 'none'
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', SVG_NS)
  return { el: document.importNode(svg, true), width, height }
}

function sanitize(root: DocumentFragment) {
  root.querySelectorAll('script, iframe, embed, object').forEach((n) => n.remove())
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
    for (const attr of [...n.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) n.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'xlink:href') && /^\s*(javascript|data:text\/html)/i.test(attr.value))
        n.removeAttribute(attr.name)
    }
    if (n.tagName.toLowerCase() === 'a') n.setAttribute('target', '_blank')
  }
}

/** Standalone SVG file text. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.style.removeProperty('max-width')
  if (!clone.getAttribute('xmlns:xlink') && clone.outerHTML.includes('xlink:'))
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

/** Rasterize at `scale`× on a solid background. */
export function svgToPng(svg: SVGSVGElement, width: number, height: number, background: string | null, scale = 2): Promise<Blob> {
  return markupToPng(serializeSvg(svg), width, height, background, scale)
}

/** Rasterize SVG markup at `scale`×; a null background keeps transparency. */
export async function markupToPng(markup: string, width: number, height: number, background: string | null, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    // Browsers cap canvas area; shrink very large images to fit.
    const maxSide = 16384
    const maxArea = 120e6
    let s = Math.min(scale, maxSide / width, maxSide / height, Math.sqrt(maxArea / (width * height)))
    s = Math.max(s, 0.01)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * s))
    canvas.height = Math.max(1, Math.round(height * s))
    const ctx = canvas.getContext('2d')!
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

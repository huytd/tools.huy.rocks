// Shared mermaid renderer. Mermaid's config is global, so every tool goes through this
// one queue and the config is re-applied whenever it differs from the last render.

type Mermaid = typeof import('mermaid').default
type MermaidConfig = Parameters<Mermaid['initialize']>[0]

let lib: Promise<Mermaid> | null = null
let queue: Promise<unknown> = Promise.resolve()
let seq = 0
let configured = ''

export const isDark = () => {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t === 'dark'
  return matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Render one diagram to an SVG string. Mermaid sizes each label in a scratch element on
 * <body>, so the font has to be named (not inherited) and loaded first, or the label boxes
 * won't fit the text as displayed.
 */
export function renderMermaid(code: string, fontFamily: string, extra: MermaidConfig = {}): Promise<string> {
  lib ??= import('mermaid').then((m) => m.default)
  const job = queue.then(async () => {
    const [mermaid] = await Promise.all([
      lib!,
      document.fonts.load(`16px ${fontFamily}`).catch(() => {}),
      document.fonts.load(`bold 16px ${fontFamily}`).catch(() => {}),
    ])
    const config: MermaidConfig = {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark() ? 'dark' : 'neutral',
      fontFamily,
      ...extra,
    }
    const key = JSON.stringify(config)
    if (configured !== key) {
      mermaid.initialize(config)
      configured = key
    }
    const id = `mermaid-${++seq}`
    try {
      return (await mermaid.render(id, code)).svg
    } finally {
      // Mermaid can leave its scratch element behind when a diagram fails to parse.
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  })
  queue = job.catch(() => {})
  return job
}

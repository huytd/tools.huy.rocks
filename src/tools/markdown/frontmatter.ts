/**
 * YAML front matter is kept verbatim and never passed through the rich-text
 * parser (which would turn `---` fences into horizontal rules).
 */
export interface Split {
  frontmatter: string | null // raw block including fences and trailing newline
  body: string
}

const FM_RE = /^(?:﻿)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(text: string): Split {
  const m = FM_RE.exec(text)
  if (!m) return { frontmatter: null, body: text }
  return { frontmatter: m[0], body: text.slice(m[0].length).replace(/^\r?\n/, '') }
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (!frontmatter) return body
  const fm = frontmatter.endsWith('\n') ? frontmatter : frontmatter + '\n'
  return `${fm}\n${body}`
}

/** Shallow `key: value` pairs for display only — not a YAML parser. */
export function frontmatterPairs(frontmatter: string): Array<[string, string]> {
  const inner = frontmatter.replace(/^(?:﻿)?---[ \t]*\r?\n/, '').replace(/\r?\n(?:---|\.\.\.)[ \t]*\r?\n?$/, '')
  const out: Array<[string, string]> = []
  let last: [string, string] | null = null
  for (const line of inner.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_][\w.-]*)\s*:\s*(.*)$/.exec(line)
    if (kv) {
      last = [kv[1], kv[2].replace(/^["']|["']$/g, '')]
      out.push(last)
    } else if (last && /^\s+-\s+/.test(line)) {
      const item = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '')
      last[1] = last[1] ? `${last[1]}, ${item}` : item
    } else if (last && /^\s+\S/.test(line)) {
      last[1] = `${last[1]} ${line.trim()}`.trim()
    }
  }
  return out
}

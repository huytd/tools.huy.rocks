// A Mermaid look modeled on Claude's own diagrams: warm neutral surfaces, thin warm-gray
// strokes, dark text, and a single clay accent for the element that carries meaning
// (people in C4, notes, activations). Every color is picked for both light and dark.

type MermaidConfig = NonNullable<Parameters<(typeof import('mermaid').default)['initialize']>[0]>

export type MermaidLook = 'claude' | 'neutral' | 'default'

export const MERMAID_LOOKS: { id: MermaidLook; name: string; description: string }[] = [
  { id: 'claude', name: 'Claude', description: 'Warm neutrals with a clay accent' },
  { id: 'neutral', name: 'Neutral', description: 'Mermaid’s grayscale theme' },
  { id: 'default', name: 'Mermaid', description: 'Mermaid’s own colors' },
]

interface Palette {
  bg: string
  fg: string
  muted: string
  faint: string
  line: string
  node: string
  nodeBorder: string
  cluster: string
  clusterBorder: string
  clay: string
  clayTint: string
  kraft: string
  kraftTint: string
  /** Categorical series for pies, git branches, mind maps. */
  series: string[]
  c4: {
    person: [string, string]
    system: [string, string]
    container: [string, string]
    component: [string, string]
    external: [string, string]
  }
}

const LIGHT: Palette = {
  bg: '#faf9f5',
  fg: '#141413',
  muted: '#5e5d59',
  faint: '#8f8d86',
  line: '#7d7b74',
  node: '#f4f3ee',
  nodeBorder: '#b9b7ad',
  cluster: '#fbfaf7',
  clusterBorder: '#d6d4ca',
  clay: '#c6613f',
  clayTint: '#f7e4da',
  kraft: '#b7865f',
  kraftTint: '#f6ecdf',
  series: ['#d97757', '#6a9bcc', '#788c5d', '#d4a27f', '#8e88b5', '#c46686', '#5f9e98', '#b7a35e', '#9b8778', '#bfbfba'],
  c4: {
    person: ['#f7e4da', '#c6613f'],
    system: ['#dfe9f4', '#4f7fae'],
    container: ['#e9f0f8', '#6a9bcc'],
    component: ['#f2f6fb', '#93b4d6'],
    external: ['#eeede7', '#a3a198'],
  },
}

const DARK: Palette = {
  bg: '#1f1e1d',
  fg: '#ece9e1',
  muted: '#b0aea5',
  faint: '#85837c',
  line: '#9c9a92',
  node: '#2a2927',
  nodeBorder: '#5b5953',
  cluster: '#242321',
  clusterBorder: '#47453f',
  clay: '#e08a6b',
  clayTint: '#40291f',
  kraft: '#d4a27f',
  kraftTint: '#3a2f25',
  series: ['#e08a6b', '#7fa9d4', '#93a878', '#dcb18f', '#a49fcb', '#d27d9b', '#72b3ad', '#c9b673', '#b09d8e', '#8f8d86'],
  c4: {
    person: ['#40291f', '#e08a6b'],
    system: ['#1f3448', '#7fa9d4'],
    container: ['#1d2c3a', '#6a9bcc'],
    component: ['#1c252f', '#55799e'],
    external: ['#2c2b28', '#77756e'],
  },
}

const C4_FONT_KEYS = [
  'person',
  'external_person',
  'system',
  'external_system',
  'system_db',
  'external_system_db',
  'system_queue',
  'external_system_queue',
  'container',
  'external_container',
  'container_db',
  'external_container_db',
  'container_queue',
  'external_container_queue',
  'component',
  'external_component',
  'component_db',
  'external_component_db',
  'component_queue',
  'external_component_queue',
  'boundary',
  'message',
]

function c4Colors(p: Palette): Record<string, string> {
  const out: Record<string, string> = {}
  const set = (kind: string, [bg, border]: [string, string]) => {
    out[`${kind}_bg_color`] = bg
    out[`${kind}_border_color`] = border
  }
  set('person', p.c4.person)
  set('external_person', p.c4.external)
  for (const level of ['system', 'container', 'component'] as const) {
    for (const variant of ['', '_db', '_queue']) {
      set(`${level}${variant}`, p.c4[level])
      set(`external_${level}${variant}`, p.c4.external)
    }
  }
  return out
}

/** Extra CSS, scoped to the diagram by Mermaid. Colors only: sizes would break its layout. */
function themeCss(p: Palette): string {
  return `
* { filter: none !important; }
marker[id$="sequencenumber"] circle { fill: ${p.clay}; }
.node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1.25px; }
.cluster rect { stroke-width: 1px; }
.cluster-label, .cluster-label span, .cluster-label p { color: ${p.muted} !important; fill: ${p.muted} !important; }
.flowchart-link, .edgePath .path, .relation, .transition { stroke-width: 1.25px; }
.edgeLabel, .edgeLabel p, .edgeLabel span { color: ${p.muted}; }
.edgeLabel rect, .labelBkg { opacity: 1; fill: ${p.bg}; background-color: ${p.bg}; }
.marker, marker path { fill: ${p.line}; stroke: ${p.line}; }
.messageLine0, .messageLine1 { stroke-width: 1.25px; }
.note { stroke-width: 1px; }
line[stroke="#444444"], path[stroke="#444444"] { stroke: ${p.line}; }
text[fill="#444444"] { fill: ${p.muted}; }
text[fill="black"], rect[stroke="#444444"] + text { fill: ${p.muted}; }
rect[stroke="#444444"] { stroke: ${p.faint}; }
.c4-external .label-container, .c4-external .outer-path { stroke-dasharray: 5 4; }
`
}

export function mermaidLookConfig(look: MermaidLook, dark: boolean, fontFamily: string): MermaidConfig {
  if (look === 'default') return { theme: dark ? 'dark' : 'default' }
  if (look === 'neutral') return { theme: dark ? 'dark' : 'neutral' }
  const p = dark ? DARK : LIGHT
  const s = p.series
  const vars: Record<string, string | boolean> = {
    darkMode: dark,
    background: p.bg,
    fontFamily,
    fontSize: '14px',
    textColor: p.fg,
    lineColor: p.line,
    primaryColor: p.node,
    primaryTextColor: p.fg,
    primaryBorderColor: p.nodeBorder,
    secondaryColor: p.clayTint,
    secondaryTextColor: p.fg,
    secondaryBorderColor: p.clay,
    tertiaryColor: p.cluster,
    tertiaryTextColor: p.fg,
    tertiaryBorderColor: p.clusterBorder,
    mainBkg: p.node,
    nodeBorder: p.nodeBorder,
    nodeTextColor: p.fg,
    clusterBkg: p.cluster,
    clusterBorder: p.clusterBorder,
    titleColor: p.fg,
    edgeLabelBackground: p.bg,
    noteBkgColor: p.kraftTint,
    noteTextColor: p.fg,
    noteBorderColor: p.kraft,
    // Sequence
    actorBkg: p.node,
    actorBorder: p.nodeBorder,
    actorTextColor: p.fg,
    actorLineColor: p.clusterBorder,
    signalColor: p.line,
    signalTextColor: p.fg,
    labelBoxBkgColor: p.node,
    labelBoxBorderColor: p.nodeBorder,
    labelTextColor: p.fg,
    loopTextColor: p.muted,
    activationBkgColor: p.clayTint,
    activationBorderColor: p.clay,
    sequenceNumberColor: dark ? p.bg : '#ffffff',
    // State & class
    altBackground: p.cluster,
    compositeBackground: p.cluster,
    compositeTitleBackground: p.node,
    stateBorder: p.nodeBorder,
    specialStateColor: p.clay,
    innerEndBackground: p.clay,
    classText: p.fg,
    // ER
    attributeBackgroundColorOdd: p.bg,
    attributeBackgroundColorEven: p.node,
    // Gantt
    sectionBkgColor: p.cluster,
    altSectionBkgColor: p.bg,
    sectionBkgColor2: p.node,
    gridColor: p.clusterBorder,
    taskBkgColor: p.c4.container[0],
    taskBorderColor: p.c4.container[1],
    taskTextColor: p.fg,
    taskTextOutsideColor: p.fg,
    taskTextLightColor: p.fg,
    taskTextDarkColor: p.fg,
    activeTaskBkgColor: p.clayTint,
    activeTaskBorderColor: p.clay,
    doneTaskBkgColor: p.node,
    doneTaskBorderColor: p.nodeBorder,
    critBkgColor: p.clay,
    critBorderColor: p.clay,
    todayLineColor: p.clay,
    // Pie
    pieStrokeColor: p.bg,
    pieStrokeWidth: '1.5px',
    pieOuterStrokeColor: p.clusterBorder,
    pieOuterStrokeWidth: '1px',
    pieTitleTextColor: p.fg,
    pieSectionTextColor: dark ? p.bg : '#ffffff',
    pieLegendTextColor: p.fg,
    pieOpacity: '1',
  }
  s.forEach((c, i) => {
    vars[`pie${i + 1}`] = c
    vars[`cScale${i}`] = c
    vars[`cScaleLabel${i}`] = dark ? p.bg : '#ffffff'
  })
  for (let i = 0; i < 8; i++) {
    vars[`git${i}`] = s[i]
    vars[`gitBranchLabel${i}`] = dark ? p.bg : '#ffffff'
  }

  const c4: Record<string, string | number> = { ...c4Colors(p) }
  for (const k of C4_FONT_KEYS) c4[`${k}FontFamily`] = fontFamily

  return {
    theme: 'base',
    themeVariables: vars,
    themeCSS: themeCss(p),
    flowchart: { padding: 14 },
    c4: c4 as MermaidConfig['c4'],
  }
}

const CARD_PAD = 24

/**
 * Finishing touches after Mermaid renders: recolor C4 text, then put the diagram on the
 * palette's ivory card, cropped to what's actually drawn plus some breathing room. The SVG
 * must be in the document so it can be measured. Returns the new size.
 */
export function polishClaude(svg: SVGSVGElement, dark: boolean) {
  const p = dark ? DARK : LIGHT
  polishC4(svg, p)
  const bb = svg.getBBox()
  const x = Math.floor(bb.x - CARD_PAD)
  const y = Math.floor(bb.y - CARD_PAD)
  const width = Math.ceil(bb.width + CARD_PAD * 2)
  const height = Math.ceil(bb.height + CARD_PAD * 2)
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.width = `${width}px`
  svg.style.height = `${height}px`
  svg.style.backgroundColor = p.bg
  svg.classList.add('is-card')
  return { width, height }
}

/**
 * Mermaid writes C4 shape text as white with an inline !important, which CSS can't beat.
 * Recolor it to suit the tinted fills: name and description in the foreground, the
 * [type] line muted. Shapes given an explicit $fontColor keep it.
 */
function polishC4(svg: SVGSVGElement, p: Palette) {
  if (svg.getAttribute('aria-roledescription') !== 'c4') return
  for (const shape of svg.querySelectorAll<SVGGElement>('.c4-shape')) {
    const label = shape.querySelector<SVGGElement>(':scope > .label')
    if (!label || !/#ffffff/i.test(label.getAttribute('style') ?? '')) continue
    label.style.setProperty('color', p.fg, 'important')
    for (const text of label.querySelectorAll<SVGTextElement>('text')) {
      const part = text.closest('.c4-name, .c4-type, .c4-techn, .c4-descr')
      const muted = !part || part.classList.contains('c4-type') || part.classList.contains('c4-techn')
      text.style.setProperty('fill', muted ? p.muted : p.fg, 'important')
    }
  }
}

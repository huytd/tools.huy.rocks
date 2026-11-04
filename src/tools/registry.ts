import { icon, type IconName } from '../ui/icons'

export interface ToolContext {
  /** Main content area for the tool. */
  root: HTMLElement
  /** Slot in the top bar, right after the tool name (breadcrumbs, filename). */
  crumbs: HTMLElement
  /** Slot on the right side of the top bar for tool actions. */
  actions: HTMLElement
}

export interface ToolInstance {
  unmount(): void
}

export interface Tool {
  id: string
  name: string
  description: string
  icon: IconName
  /** Lazy-loaded so the home screen stays light. */
  load(): Promise<{ mount(ctx: ToolContext): ToolInstance }>
}

export const tools: Tool[] = [
  {
    id: 'markdown',
    name: 'Markdown',
    description: 'Open, read and edit .md files. Reloads live when the file changes on disk.',
    icon: 'fileText',
    load: () => import('./markdown'),
  },
  {
    id: 'diagram',
    name: 'Diagram',
    description: 'Write Mermaid, PlantUML or D2 and see it drawn as you type, C4 models included. Export SVG or PNG.',
    icon: 'diagram',
    load: () => import('./diagram'),
  },
  {
    id: 'svg',
    name: 'SVG',
    description: 'Edit SVG code with a live preview. Format, optimize with SVGO, export PNG or a data URI.',
    icon: 'vector',
    load: () => import('./svg'),
  },
]

export const toolIcon = (t: Tool, size = 16) => icon(t.icon, size)

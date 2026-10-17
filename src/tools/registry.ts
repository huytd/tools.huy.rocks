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
]

export const toolIcon = (t: Tool, size = 16) => icon(t.icon, size)

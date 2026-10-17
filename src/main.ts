import './styles/base.css'
import { tools, toolIcon, type Tool, type ToolInstance } from './tools/registry'
import { h, kbd, toggleMenu, type MenuEntry } from './ui/dom'
import { icon } from './ui/icons'

const app = document.getElementById('app')!

// ---------- Shell ----------
const switcher = h('button', {
  class: 'switcher',
  'aria-haspopup': 'menu',
  'aria-expanded': 'false',
  title: `Switch tool (${kbd('mod+k')})`,
})
const crumbs = h('div', { class: 'crumbs' })
const actions = h('div', { class: 'tool-actions' })
const themeBtn = h('button', { class: 'icon-btn', title: 'Toggle theme', 'aria-label': 'Toggle theme' })
const topbar = h(
  'header',
  { class: 'topbar' },
  h('div', { class: 'tb-left' }, switcher, crumbs),
  h('div', { class: 'tb-right' }, actions, themeBtn),
)
const view = h('main', { class: 'view' })
app.append(topbar, view)

function renderSwitcher(tool: Tool | null) {
  switcher.innerHTML = ''
  switcher.append(
    h('span', { class: 'switcher-logo', html: tool ? toolIcon(tool, 15) : icon('grid', 15) }),
    h('span', { class: 'switcher-name' }, tool ? tool.name : 'tools'),
    h('span', { class: 'switcher-chev', html: icon('chevronDown', 14) }),
  )
}

function appMenu(current: Tool | null): MenuEntry[] {
  return [
    { heading: 'tools.huy.rocks' },
    { label: 'All tools', icon: icon('grid'), checked: !current, onSelect: () => go('') },
    'separator',
    ...tools.map<MenuEntry>((t) => ({
      label: t.name,
      description: t.description,
      icon: toolIcon(t),
      checked: current?.id === t.id,
      onSelect: () => go(t.id),
    })),
  ]
}

switcher.addEventListener('click', () =>
  toggleMenu(switcher, () => appMenu(currentTool), { className: 'menu-wide' }),
)
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    switcher.click()
  }
})

// ---------- Theme ----------
function effectiveTheme(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function renderThemeBtn() {
  themeBtn.innerHTML = icon(effectiveTheme() === 'dark' ? 'sun' : 'moon')
}
themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem('theme', next)
  } catch {}
  renderThemeBtn()
})
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeBtn)
renderThemeBtn()

// ---------- Home ----------
function renderHome() {
  const list = h('ul', { class: 'tool-list' })
  for (const t of tools) {
    list.append(
      h(
        'li',
        {},
        h(
          'a',
          { class: 'tool-row', href: `#/${t.id}` },
          h('span', { class: 'tool-row-icon', html: toolIcon(t, 18) }),
          h(
            'span',
            { class: 'tool-row-text' },
            h('span', { class: 'tool-row-name' }, t.name),
            h('span', { class: 'tool-row-desc' }, t.description),
          ),
          h('span', { class: 'tool-row-go', html: icon('chevronRight') }),
        ),
      ),
    )
  }
  view.append(
    h(
      'div',
      { class: 'home' },
      h('h1', { class: 'home-title' }, 'tools'),
      h('p', { class: 'home-sub' }, 'Small, quiet utilities that run entirely in your browser. Nothing leaves your machine.'),
      list,
      h('p', { class: 'home-foot' }, h('span', {}, `${kbd('mod+k')} to switch tools anywhere`)),
    ),
  )
}

// ---------- Router ----------
let currentTool: Tool | null = null
let instance: ToolInstance | null = null
let routeToken = 0

function go(id: string) {
  location.hash = id ? `#/${id}` : '#/'
}

async function route() {
  const token = ++routeToken
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  const tool = tools.find((t) => t.id === id) ?? null
  if (tool === currentTool && (tool || view.childElementCount)) return

  instance?.unmount()
  instance = null
  view.innerHTML = ''
  crumbs.innerHTML = ''
  actions.innerHTML = ''
  currentTool = tool
  renderSwitcher(tool)
  document.title = tool ? `${tool.name} · tools.huy.rocks` : 'tools.huy.rocks'
  document.body.dataset.tool = tool?.id ?? 'home'

  if (!tool) {
    if (id) history.replaceState(null, '', '#/')
    renderHome()
    return
  }
  const mod = await tool.load()
  if (token !== routeToken) return
  instance = mod.mount({ root: view, crumbs, actions })
}

window.addEventListener('hashchange', route)
route()

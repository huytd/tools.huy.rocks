// Minimal stroke icons (24x24 grid, 1.75 stroke), inlined as strings.
const svg = (body: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

const paths = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  chevronRight: '<path d="m10 7 5 5-5 5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
  more: '<circle cx="5.5" cy="12" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="18.5" cy="12" r="1.1" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-3.5M4 4v4h4M4 13a8 8 0 0 0 14.8 3.5M20 20v-4h-4"/>',
  width: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M10 5h8M6 19h8M14.5 5l-5 14"/>',
  strike: '<path d="M4 12h16M16.5 7.5A4 3 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 1.2.8 2.2 2.5 2.8M8 16.5c.6 1.5 2.1 2.5 4.2 2.5 2.6 0 4.3-1.3 4.3-3.2 0-.6-.2-1.2-.5-1.6"/>',
  inlineCode: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  text: '<path d="M5 6V5h14v1M12 5v14M9 19h6"/>',
  h1: '<path d="M4 6v12M12 6v12M4 12h8M17 10l2.5-2V18"/>',
  h2: '<path d="M4 6v12M12 6v12M4 12h8M16 10a2.5 2.5 0 1 1 4 2l-4 6h4.5"/>',
  h3: '<path d="M4 6v12M12 6v12M4 12h8M16 8.5a2.3 2.3 0 1 1 2.3 3.2 2.4 2.4 0 1 1-2.3 3.6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="18" r=".9" fill="currentColor"/>',
  listOrdered: '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M4 14.5a1.5 1.5 0 1 1 2.4 1.2L4 19h3"/>',
  todo: '<rect x="3.5" y="4.5" width="6" height="6" rx="1.5"/><path d="m4.8 16 1.4 1.4L9 14.5M13 7.5h7.5M13 16h7.5"/>',
  quote: '<path d="M5 6v12M10 8h9M10 12h9M10 16h6"/>',
  codeBlock: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2"/>',
  divider: '<path d="M4 12h16"/><path d="M8 7h8M8 17h8" opacity=".35"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17M10 4.5v15"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17v.01"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 15.5-4.5-4.5-8.5 8.5"/>',
  highlight: '<path d="m14.5 4.5 5 5-7.5 7.5h-5v-5z"/><path d="M7 12l5 5M4 20h7"/>',
  note: '<path d="M5 4.5h14a1 1 0 0 1 1 1V15l-5 5H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/><path d="M20 15h-4a1 1 0 0 0-1 1v4M8 9h8M8 12.5h5"/>',
  diagram: '<rect x="3.5" y="4" width="6" height="5" rx="1.2"/><rect x="14.5" y="4" width="6" height="5" rx="1.2"/><rect x="9" y="15" width="6" height="5" rx="1.2"/><path d="M6.5 9v2.5h11V9M12 11.5V15"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
} as const

export type IconName = keyof typeof paths

export function icon(name: IconName, size = 16): string {
  return svg(paths[name], size)
}

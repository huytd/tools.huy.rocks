# tools.huy.rocks

Small, quiet utilities that run entirely in your browser. Nothing leaves your machine.

Tools are listed on the home page and in the switcher menu at the top left (`⌘K` / `Ctrl+K`).

## Markdown

A Notion-style viewer and editor for `.md` files.

- **Open any markdown file** with `⌘O`, by dropping it on the page, or from the recent list.
- **Live reload.** The file is polled in the background (a cheap `lastModified`/`size` check every second, slower when the tab is hidden). If the text on disk differs from the version on screen, the page updates in place, keeps your scroll position, and briefly highlights the blocks that changed.
- **Edit like a page.** `/` opens the block menu (headings, lists, to-dos, quotes, code, tables, dividers). Selecting text shows a small toolbar for bold, italic, strike, code and links. Markdown shortcuts (`#`, `-`, `1.`, `[ ]`, `>`, ```` ``` ````) work as you type.
- **Highlights.** Select text and pick the highlighter in the toolbar (or `⌘⇧H`). Stored as `==text==`.
- **Mermaid diagrams.** A ```` ```mermaid ```` code block renders as a diagram (`/diagram` inserts one). Click the diagram to edit its source; it re-renders as you type and follows the light/dark theme.
- **Side notes.** Select text and click the note button in the toolbar, press `⌘⌥M`, or type `/side note`. Notes sit in the right margin next to their numbered reference (on narrow screens, click the number to show one). Click a note to edit it, `Enter` to save, and the `×` to remove it. They're saved as standard markdown footnotes (`[^1]` plus `[^1]: note` at the end of the file), so existing footnotes show up as side notes too.
- **Contents.** The list button in the top bar (or `⌘⌥O`) shows the page's headings in the left margin, marks the section you're reading, and jumps to a heading on click. On narrow screens it opens as a floating panel instead.
- **Autosave** writes back to the same file shortly after you stop typing (toggle it in the `⋯` menu). If the file changes on disk while you have unsaved edits, you get a choice instead of a silent overwrite.
- **Source view** (`⌘/`) shows the raw markdown, exactly as it is on disk.
- **Front matter** is kept verbatim and shown as a small property list.
- **Relative images and links.** The app works on one file at a time. If a page embeds images stored next to it, a "Show images" prompt asks for access to the file's folder once (the picker opens right there). The grant is remembered, so later visits just work. `⌘`-click a relative `.md` link to open that file.

### Browser support

Saving in place and reliable live reload use the [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API), available in Chrome, Edge, Arc, Brave and other Chromium browsers. In Firefox and Safari you can still open, read and edit files; saving downloads a copy.

### Notes on fidelity

Opening a file never writes to it. Once you edit in the rich view, the document is re-serialized as GitHub-flavored markdown, so stylistic details (for example `*` vs `-` bullets, table column padding) may be normalized. Use the source view when byte-exact control matters.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

Stack: [Vite](https://vite.dev), TypeScript, [Tiptap](https://tiptap.dev) (ProseMirror) with `@tiptap/markdown`, `lowlight` for code highlighting, and `mermaid` (loaded on demand) for diagrams. No UI framework.

```
src/
  main.ts                 shell: router, tool switcher, theme
  tools/registry.ts       list of tools (add new ones here)
  tools/markdown/
    index.ts              the Markdown tool: open/save, status, menus
    editor.ts             Tiptap setup, bubble menu, change highlighting
    slash.ts              "/" block menu
    mermaid.ts            code block node view that renders mermaid diagrams
    sidenote.ts           side notes, stored as markdown footnotes
    outline.ts            contents panel built from the headings
    watcher.ts            background file polling
    files.ts              File System Access helpers, recents, folder grants
    frontmatter.ts        YAML front matter passthrough
```

### Adding a tool

Add an entry to `src/tools/registry.ts` with an `id`, `name`, `description`, `icon` and a lazy `load()` that returns `{ mount(ctx) }`. The tool gets a content area plus two slots in the top bar, and is reachable at `#/<id>`.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. One-time setup:

```sh
gh api -X POST repos/huytd/tools.huy.rocks/pages -f build_type=workflow   # Pages source: GitHub Actions
gh api -X PUT  repos/huytd/tools.huy.rocks/pages -f cname=tools.huy.rocks  # custom domain
```

Then add a DNS `CNAME` record for `tools` → `huytd.github.io`.

## License

MIT

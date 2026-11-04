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

## Diagram

Write diagram source on the left and see it drawn on the right as you type. Supports three languages, each with [C4 model](https://c4model.com) diagrams (pick one from **Examples**):

| Language | Renders | C4 support |
| --- | --- | --- |
| [Mermaid](https://mermaid.js.org) | In your browser | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` |
| [D2](https://d2lang.com) | In your browser, via D2's official WebAssembly build (~6 MB, loaded the first time you pick D2) | The built-in C4 theme (`theme-id: 303`) and the `c4-person` shape |
| [PlantUML](https://plantuml.com) | On a PlantUML server | [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) from the standard library (`!include <C4/C4_Container>`) |

- **PlantUML needs a server.** It's a Java program with no practical browser build, so its source is sent to a PlantUML server to render. Nothing is sent until you agree, and you can point it at your own server instead of plantuml.com (`docker run -p 8080:8080 plantuml/plantuml-server`, then `http://localhost:8080`). Change it later from the `⋯` menu.
- **Claude theme for Mermaid.** Mermaid diagrams default to a look modeled on Claude's own diagrams: warm neutral surfaces, thin warm-gray lines and a single clay accent (people in C4, notes, activations, sequence numbers), drawn on an ivory card, in light and dark. C4 elements get tinted fills: clay for people, slate blue for your systems, containers and components, dashed gray for external ones. Switch to Mermaid's own themes from the `⋯` menu.
- **Errors** show under the source with the offending line marked in the gutter; the last good drawing stays on screen, dimmed.
- **Pan and zoom.** Drag or scroll to pan, `⌘`/`Ctrl` + scroll or pinch to zoom, `0` to fit, `1` for actual size. Until you move it, the view keeps the diagram fitted.
- **Export** as SVG or PNG (2×), or copy either to the clipboard.
- **Files.** `⌘O` (or drop a file) opens `.mmd`, `.mermaid`, `.puml`, `.plantuml`, `.d2` and picks the language from the extension. `⌘S` downloads the source.
- **Share links.** `⋯ → Copy link` puts the whole diagram, compressed, in the URL fragment, so it never reaches a server.
- D2 options in the `⋯` menu: ELK or Dagre layout, sketch style. Settings written in the file (`vars: { d2-config: … }`) take precedence.
- Your source for each language is kept in the browser's local storage between visits.

## SVG

An SVG code editor with a live preview: write or paste markup on the left and see it drawn on the right as you type.

- **Isolated preview.** The SVG is drawn as an image, so its `<style>` can't restyle the page and its scripts never run. As in any `<img>`, external images and web fonts it links to aren't loaded; embedded ones (`data:` URIs) are. CSS and SMIL animations play.
- **Errors** show under the source with the line marked; the last good drawing stays on screen, dimmed.
- **Missing `xmlns`** (common in hand-written or copied snippets) is added for the preview and exports, and the info line says so.
- **Info line**: size, `viewBox`, file size and element count.
- **Backgrounds**: transparent (checkerboard), light or dark behind the artboard.
- **Pan and zoom** as in the Diagram tool. Zooming redraws the vector, so it stays sharp; small icons fit at up to 8×.
- **Format** (`⇧⌥F`) re-indents the markup and leaves the inside of `<text>`/`<style>` alone. **Optimize** shrinks it with [SVGO](https://github.com/svg/svgo) (default preset, multipass) and reports the saving; both are undoable.
- **Export**: download SVG or PNG at 1×, 2× or 4× (transparent background), or copy the SVG, a PNG, a `data:` URI, or a CSS `background-image` rule.
- **Files and links**: `⌘O` or drop a `.svg`, `⌘S` downloads it, `⋯ → Copy link` puts the SVG in the URL fragment. Your work is kept in local storage between visits.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

Stack: [Vite](https://vite.dev), TypeScript, [Tiptap](https://tiptap.dev) (ProseMirror) with `@tiptap/markdown`, `lowlight` for code highlighting, `mermaid` and `@terrastruct/d2` for diagrams and `svgo` for SVG optimizing (all loaded on demand). No UI framework.

```
src/
  main.ts                 shell: router, tool switcher, theme
  tools/registry.ts       list of tools (add new ones here)
  ui/mermaid.ts           shared mermaid renderer (one queue, global config)
  ui/workbench/           shared shell for source + live preview tools
    index.ts              layout, resizable split, drop/open, status, prefs, share links
    code-editor.ts        source textarea with line numbers
    viewport.ts           pan and zoom
    svg.ts                SVG sanitizing, sizing and PNG export
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
  tools/diagram/
    index.ts              the Diagram tool: panes, menus, export, share links
    engines.ts            Mermaid, PlantUML (server) and D2 (WebAssembly) renderers
    mermaid-theme.ts      the Claude look for Mermaid, including C4
    examples.ts           examples per language, C4 included
  tools/svg/
    index.ts              the SVG tool: preview, backdrops, optimize, export
    svgdoc.ts             parsing, size, error lines, formatting, data URIs
    examples.ts           example SVGs
```

### Adding a tool

Add an entry to `src/tools/registry.ts` with an `id`, `name`, `description`, `icon` and a lazy `load()` that returns `{ mount(ctx) }`. The tool gets a content area plus two slots in the top bar, and is reachable at `#/<id>`. For a "source on the left, live preview on the right" tool, start from `createWorkbench()` in `src/ui/workbench`, as the Diagram and SVG tools do.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. One-time setup:

```sh
gh api -X POST repos/huytd/tools.huy.rocks/pages -f build_type=workflow   # Pages source: GitHub Actions
gh api -X PUT  repos/huytd/tools.huy.rocks/pages -f cname=tools.huy.rocks  # custom domain
```

Then add a DNS `CNAME` record for `tools` → `huytd.github.io`.

## License

MIT

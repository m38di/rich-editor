# Rich Editor — a Telegram iOS–style article editor for the web

A faithful web reconstruction of the Android **Rich Editor** module
(`org.telegram.ui.iv`, 41 files / 23,510 lines), rebuilt as a modern React app
with the **Telegram iOS** look: SF typography, translucent vibrancy bars,
grabber sheets, spring animations and the blue circular send button.

The messaging pipeline is fully replaced by:

```
Import ↑ (.html)  →  edit  →  Generate → Preview (rendered ⇄ HTML source)
                  →  Download .html / Copy HTML
```

**Import** closes the loop: the ↑ button in the title bar opens any `.html`
file back into the editor. Files produced by the Download step round-trip
fully — headings, marks, lists (incl. checkboxes), quotes, code, tables,
details, `tg-spoiler`, `tg-emoji`, `tg-time`, `tg-math(-block)`, `tg-map`,
galleries, figures and buttons all survive. Arbitrary semantic HTML degrades
to plain blocks. Replacing the document is a single undo step (`Ctrl+Z`
restores the previous article).

The exported HTML uses **only** the provided tag reference — `tg-spoiler`,
`tg-emoji`, `tg-time`, `tg-math(-block)`, `tg-map`, `tg-collage`, `tg-slideshow`,
`aside`/`cite`, `<table bordered striped>`, checkbox `<li>`, `details/summary`,
figures with captions — clean, semantic, no editor attributes.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the production build locally
npm run typecheck  # TypeScript compiler check (no emit)
```

> Zero-build alternative: open `rich-editor-demo.html` (sibling artifact)
> directly in a browser — same workflow, no dependencies.

## The iOS interface

- **Navigation bar** — translucent vibrancy, back chevron, live character
  counter, undo/redo.
- **Compose bar** — attach (+), emoji, `Aa` text style, lists, table, math,
  and the blue circular **↑ Generate** button (the old "send").
- **Formatting strip** — floats above the compose bar whenever text is
  selected: B I U S, spoiler, mono, sub/sup, highlight, quote, link, date,
  inline math, clear. Selection-safe (buttons never steal your selection).
- **Grabber sheets** — every menu and dialog is an iOS bottom sheet with a
  grabber, grouped cards, hairline separators and Telegram-style colored
  circle icons.
- **Preview sheet** — full-screen with a segmented Preview ⇄ HTML switch,
  Copy HTML and Download .html.
- **Motion** — iOS spring curves (`cubic-bezier(0.32, 0.72, 0, 1)`), press
  scale feedback, animated spoiler shimmer, content scrolling under the
  blurred bars.

## Deploy (free)

The built app is **100% static** — no backend, no database, no env vars —
so every free static host works. `npm run build` outputs to `dist/`.

### Vercel (easiest)
1. Push this folder to a GitHub repo.
2. [vercel.com](https://vercel.com) → **New Project** → import the repo.
   Vite is auto-detected (build `npm run build`, output `dist`) → Deploy.
   Free Hobby tier, HTTPS + custom domain included.
   *No repo?* Run `npx vercel` inside the folder instead.

### Netlify
- Drag the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop),
  or connect the repo (build `npm run build`, publish `dist`). Free tier.

### GitHub Pages (one-push — workflow included)
1. Create a repo with **this folder as the root**, so
   `.github/workflows/deploy.yml` sits at the repo root.
2. Repo → **Settings → Pages** → Source: **GitHub Actions**.
3. `git push` — the workflow builds and deploys automatically to
   `https://<user>.github.io/<repo>/`.
   `base: './'` in `vite.config.ts` makes asset paths relative, so the
   project sub-path works out of the box.

```bash
cd rich-editor-web
git init && git add -A && git commit -m "Rich Editor"
git branch -M main
git remote add origin https://github.com/<you>/rich-editor.git
git push -u origin main
```

### Cloudflare Pages / Surge
- **Cloudflare Pages**: connect the repo (build `npm run build`, output
  `dist`) — free tier with unmetered bandwidth.
- **Surge**: `npm run build && npx surge dist` — one command, free subdomain.

### Runtime notes
- Inserted media uses local object URLs — files live in the browser session
  only; nothing is uploaded anywhere (there is no server).
- The app is a single page with no router, so no redirect rules are needed
  on any host.

## Feature parity map

| Android | Web |
|---|---|
| `RichEditorListView` row model + nesting (quoteIds, list runs, details stack) | ProseMirror schema — nodes mirror the `PageBlock` taxonomy |
| `RichTextStyle` 9 flags + 4 entities | marks: bold/italic/underline/strike/mono/spoiler/sub/sup/mark + link, `math_inline`, `time_inline`, `anchor` |
| Formatting panel (420 ms slide, scale .8→1) | iOS formatting strip with spring pop + selection-safe buttons |
| Text-type & list menus, indent/outdent | `Aa` and list sheets (+ Tab / Shift+Tab) |
| `TableModel` (spans, align/valign, header, bordered/striped, merge/unmerge, row/col ops) | `tableCommands.ts` — occupancy-grid port with identical semantics |
| `RichMediaCell` single / collage / slideshow, per-item spoiler, captions | `media_figure` / `media_group` node views (mode toggle from 2 items; caption typing never restarts media) |
| `RichMapCell` (zoom 15 default) | `map_block` + location sheet with geolocation |
| `RichMathCell` / `MathSpan` (JLatexMath live preview) | KaTeX live-preview sheet, block + inline |
| `RichDetailsCell` animated toggle | `details` node view with arrow toggle (editable summary) |
| 21 slash commands (`RichCommand`) + 5-row suggestion popup | `SlashMenu` — same 21 commands and aliases |
| Markdown line-start shortcuts (`#…######`, `- * +`, `[]`, `1.`, `|`, `---`, ` ``` `, `>`) | ProseMirror input rules |
| `RichEditorHistory` (800 ms debounce, 150 steps, focus restore) | `prosemirror-history` tuned to `newGroupDelay: 800, depth: 150` |
| Send / schedule / silent | **removed** → Generate → Preview → Download |
| Upload pipeline (`RichMediaUploader`) | File picker → object URLs, same empty→done states |
| — (new in web) | **Import .html** — top-bar ↑ opens any exported file back into the editor (full round-trip) |
| AI compose sheet | omitted (requires the Telegram backend) |

## Keyboard

`Ctrl+B/I/U` bold/italic/underline · `Ctrl+Shift+X` strike · `Ctrl+E` mono ·
`Ctrl+Shift+S` spoiler · `Ctrl+Shift+H` highlight · `Ctrl+K` link ·
`Ctrl+Alt+1…6` headings · `Ctrl+Shift+7/8` numbered/bulleted ·
`Tab`/`Shift+Tab` next cell / indent · `Ctrl+Z/Y` undo/redo (800 ms coalescing)

## Architecture

```
src/
  editor/    schema.ts (PageBlock ⇄ node taxonomy) · serializer.ts (doc → reference HTML)
             importHtml.ts (.html file → doc — the Download inverse) · commands.ts ·
             tableCommands.ts (TableModel port) · plugins.ts (keymap,
             markdown rules, slash detection, selection reporter) · nodeviews.ts (cells)
             createEditor.ts · exportHtml.ts (standalone doc + download) · bus.ts
  components/ ivIcons.tsx (the REAL Telegram iv_*/formatting_* drawables, auto-
              converted from github.com/DrKLO/Telegram) · icons.tsx (SF-style chrome) ·
              TopBar · BottomPanel · FormattingPanel · Menus
              Dialogs · PreviewSheet · ErrorBoundary
  hooks/useEditorBridge.ts   lib/util.ts (21-command table, emoji, tg-time formats)
```

React hosts the chrome; ProseMirror owns the document, selection and IME —
the same separation as `RichEditor` (orchestration) vs. the list view (model).
An `ErrorBoundary` renders an iOS-style diagnostic card on any runtime error
instead of a blank page.

## Verified

Static audit (see the project notebook): all relative imports resolve, all
named imports are exported, and the serializer emits **only** tags from the
allowed reference — no `data-*` attributes, `class=` only for `language-*`.
Runtime verification requires `npm install && npm run dev` on a machine with
Node (the authoring sandbox is Python-only).
test

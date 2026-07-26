// src/editor/exportHtml.ts
//
// The replacement for the Android send pipeline:
//
//     editor doc → serializeRichHtml() → Preview → Download .html
//
// The standalone document embeds a small stylesheet so the custom tags
// (tg-spoiler, tg-map, tg-collage, tg-slideshow, tg-math…) render
// beautifully when the file is opened on its own. The article fragment
// itself stays clean and semantic — no editor attributes, no wrappers.

import { Node } from 'prosemirror-model'
import { serializeRichHtml } from './serializer'

/** Styles for the preview pane AND the downloaded standalone document. */
export const PREVIEW_CSS = `
:root {
  --accent: #3390ec;
  --ink: #1a1a1a;
  --muted: #707579;
  --line: #dde1e6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f2f5f8;
  color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
article {
  max-width: 720px;
  margin: 24px auto;
  background: #fff;
  border-radius: 14px;
  padding: 36px 44px 44px;
  box-shadow: 0 1px 2px rgba(16,24,40,.05), 0 8px 28px rgba(16,24,40,.08);
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.1em 0 .45em; font-weight: 800; }
h1 { font-size: 1.75em; } h2 { font-size: 1.5em; } h3 { font-size: 1.3em; }
h4 { font-size: 1.15em; } h5 { font-size: 1.05em; } h6 { font-size: 1em; color: var(--muted); }
p { margin: .55em 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
b, strong { font-weight: 700; }
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .92em; background: rgba(51,144,236,.09);
  border-radius: 5px; padding: .1em .35em;
}
pre {
  background: #f6f8fa; border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px; overflow-x: auto; margin: .8em 0;
}
pre code { background: none; padding: 0; font-size: .9em; line-height: 1.5; }
mark { background: #ffe9a8; border-radius: 3px; padding: 0 .15em; }
blockquote {
  margin: .8em 0; padding: 8px 14px 8px 16px;
  border-left: 3px solid var(--accent);
  background: rgba(51,144,236,.06); border-radius: 4px 10px 10px 4px;
}
blockquote cite, aside cite, figcaption cite {
  display: block; margin-top: 6px; font-size: .85em;
  color: var(--accent); font-style: normal; font-weight: 600;
}
aside {
  margin: 1.1em auto; padding: 6px 22px; max-width: 85%;
  font-style: italic; font-size: 1.18em; text-align: center;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
hr { border: none; border-top: 1px solid rgba(0,0,0,.14); margin: 1.4em auto; width: 34%; }
ul, ol { margin: .55em 0; padding-left: 1.7em; }
li { margin: .2em 0; }
li > input[type="checkbox"] { margin-right: .5em; accent-color: var(--accent); transform: translateY(1px); }
details {
  margin: .8em 0; border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 16px; background: #fbfcfe;
}
details summary { font-weight: 700; cursor: pointer; user-select: none; }
details[open] summary { margin-bottom: 6px; }
footer { margin-top: 1.6em; color: var(--muted); font-size: .92em; }
figure { margin: .9em 0; }
figure img, figure video { max-width: 100%; border-radius: 10px; display: block; }
figcaption { margin-top: 6px; font-size: .9em; color: var(--muted); }
img, video { max-width: 100%; border-radius: 10px; }
audio { width: 100%; margin: .4em 0; }
table { border-collapse: collapse; margin: .9em 0; width: auto; min-width: 40%; }
table caption { caption-side: top; text-align: left; font-weight: 700; padding: 4px 8px; }
th, td { padding: 7px 12px; text-align: left; vertical-align: top; }
table[bordered] th, table[bordered] td { border: 1px solid var(--line); }
th { background: rgba(51,144,236,.07); font-weight: 700; }
table[striped] tr:nth-child(even) td { background: #f7f9fb; }
tg-spoiler {
  background: #b9c2cd; color: transparent; border-radius: 4px;
  cursor: pointer; transition: background .25s ease, color .25s ease;
  user-select: none; padding: 0 .1em;
}
tg-spoiler.revealed { background: rgba(185,194,205,.28); color: inherit; user-select: auto; }
tg-time { color: var(--accent); font-weight: 600; white-space: nowrap; }
tg-math {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: rgba(51,144,236,.08); border-radius: 5px; padding: .05em .4em;
  font-size: .95em;
}
tg-math-block {
  display: block; text-align: center; margin: .9em 0; padding: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: #f6f8fa; border: 1px solid var(--line); border-radius: 10px;
  white-space: pre-wrap;
}
tg-map {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 180px; border-radius: 10px; margin: .6em 0;
  background:
    radial-gradient(circle at 30% 30%, rgba(51,144,236,.16), transparent 45%),
    linear-gradient(135deg, #dcebf9, #eef4fb);
  border: 1px solid #cfe2f5; color: #2b6cb0; font-weight: 600;
}
tg-map::before { content: "📍"; font-size: 1.6em; }
tg-collage { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: .6em 0; }
tg-collage img, tg-collage video { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
tg-collage figcaption, tg-slideshow figcaption { grid-column: 1 / -1; }
tg-slideshow {
  display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 3px;
  margin: .6em 0; border-radius: 10px;
}
tg-slideshow img, tg-slideshow video { flex: 0 0 100%; scroll-snap-align: start; border-radius: 10px; }
tg-slideshow figcaption { flex: 0 0 100%; }
tg-emoji { display: inline-block; }
@media (max-width: 640px) { article { margin: 0; border-radius: 0; padding: 22px 18px 30px; } }
`

/** Tiny runtime for the standalone file: spoiler tap-to-reveal. */
const PREVIEW_JS = `
document.addEventListener('click', function (e) {
  var t = e.target;
  if (t && t.tagName && t.tagName.toLowerCase() === 'tg-spoiler') {
    t.classList.toggle('revealed');
  }
});
`

export function buildStandaloneHtml(title: string, fragment: string): string {
  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;') || 'Rich document'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle}</title>
<style>${PREVIEW_CSS}</style>
</head>
<body>
<article>
${fragment}
</article>
<script>${PREVIEW_JS}</script>
</body>
</html>`
}

/** First heading text, used as the document title. */
export function docTitle(doc: Node): string {
  let title = ''
  doc.descendants((node) => {
    if (title) return false
    if (node.type.name === 'heading' || node.type.name === 'paragraph') {
      const text = node.textContent.trim()
      if (text) title = text.slice(0, 80)
    }
    return true
  })
  return title || 'Rich document'
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'rich-document'
  )
}

export function downloadHtml(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Full pipeline helper: doc → standalone HTML string. */
export function docToStandaloneHtml(doc: Node): string {
  const fragment = serializeRichHtml(doc)
  return buildStandaloneHtml(docTitle(doc), fragment)
}

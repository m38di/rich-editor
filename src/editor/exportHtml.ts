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
/* ---------- design tokens ---------- */
:root {
  color-scheme: light dark;
  --accent: #2563eb;
  --accent-ink: #1d4ed8;
  --accent-soft: rgba(37, 99, 235, .10);
  --accent-line: rgba(37, 99, 235, .30);
  --ink: #101720;
  --ink-soft: #333e4d;
  --muted: #6b7688;
  --surface: #ffffff;
  --surface-alt: #f6f8fc;
  --surface-sunken: #eff3f9;
  --border: #e3e8f0;
  --hairline: rgba(16, 24, 40, .09);
  --canvas: #eaeff6;
  --canvas-tint: #dfe8f4;
  --mark: #fde68a;
  --mark-ink: #4a3208;
  --spoiler: #b3bdcb;
  --shadow:
    0 1px 1px rgba(16, 24, 40, .04),
    0 8px 22px -10px rgba(16, 24, 40, .18),
    0 30px 60px -32px rgba(16, 24, 40, .30);
  --radius: 20px;
  --radius-sm: 12px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --accent: #60a5fa;
    --accent-ink: #93c5fd;
    --accent-soft: rgba(96, 165, 250, .14);
    --accent-line: rgba(96, 165, 250, .45);
    --ink: #e7edf6;
    --ink-soft: #c3cede;
    --muted: #93a0b4;
    --surface: #151a22;
    --surface-alt: #1b222c;
    --surface-sunken: #10151d;
    --border: #29313d;
    --hairline: rgba(255, 255, 255, .10);
    --canvas: #090c11;
    --canvas-tint: #0f1620;
    --mark: rgba(250, 204, 21, .28);
    --mark-ink: #fde68a;
    --spoiler: #3c4655;
    --shadow:
      0 1px 1px rgba(0, 0, 0, .5),
      0 12px 30px -12px rgba(0, 0, 0, .65),
      0 34px 70px -34px rgba(0, 0, 0, .9);
  }
}
/* ---------- shell ---------- */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  padding: 40px 20px 64px;
  min-height: 100%;
  color: var(--ink);
  background-color: var(--canvas);
  background-image:
    radial-gradient(1200px 620px at 12% -10%, var(--accent-soft), transparent 60%),
    linear-gradient(180deg, var(--canvas-tint), var(--canvas) 42%);
  background-attachment: fixed;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
  font-size: 17px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-kerning: normal;
  font-variant-ligatures: common-ligatures contextual;
}
article {
  max-width: 740px;
  margin: 0 auto;
  padding: 48px 56px 52px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow-wrap: break-word;
}
article > :first-child { margin-top: 0; }
article > :last-child { margin-bottom: 0; }
::selection { background: var(--accent-soft); color: var(--ink); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
/* ---------- typography ---------- */
h1, h2, h3, h4, h5, h6 {
  margin: 1.6em 0 .5em;
  line-height: 1.22;
  font-weight: 700;
  letter-spacing: -.021em;
  text-wrap: balance;
  color: var(--ink);
}
h1 { font-size: 2.15em; letter-spacing: -.03em; margin-top: .2em; }
h2 { font-size: 1.6em; letter-spacing: -.025em; }
h3 { font-size: 1.3em; }
h4 { font-size: 1.12em; }
h5 { font-size: 1em; }
h6 { font-size: .88em; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
h2 + p, h3 + p, h1 + p { margin-top: 0; }
p { margin: 0 0 1.05em; text-wrap: pretty; color: var(--ink-soft); }
article > p:first-of-type { font-size: 1.06em; color: var(--ink); }
a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: var(--accent-line);
  text-decoration-thickness: 1px;
  text-underline-offset: .18em;
  border-radius: 3px;
  transition: color .15s ease, text-decoration-color .15s ease;
}
a:hover { color: var(--accent-ink); text-decoration-color: currentColor; }
a:not([href]) { color: inherit; text-decoration: none; }
b, strong { font-weight: 680; color: var(--ink); }
i, em { font-style: italic; }
u { text-decoration-thickness: 1px; text-underline-offset: .16em; }
s { text-decoration-color: var(--muted); }
sub, sup { font-size: .72em; line-height: 0; }
mark {
  background: var(--mark);
  color: var(--mark-ink);
  border-radius: 4px;
  padding: .06em .28em;
  box-decoration-break: clone;
}
small { font-size: .86em; color: var(--muted); }
abbr { text-underline-offset: .2em; }
/* ---------- code ---------- */
code, kbd, samp, tg-math, tg-math-block, pre {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-variant-ligatures: none;
}
code {
  font-size: .88em;
  background: var(--accent-soft);
  color: var(--accent-ink);
  border-radius: 6px;
  padding: .14em .38em;
  box-decoration-break: clone;
}
pre {
  margin: 1.5em 0;
  padding: 18px 20px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  font-size: .9em;
  line-height: 1.6;
  color: var(--ink);
  tab-size: 2;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  box-shadow: inset 0 1px 0 var(--hairline);
}
pre code {
  background: none;
  color: inherit;
  padding: 0;
  font-size: 1em;
  border-radius: 0;
}
pre::-webkit-scrollbar { height: 8px; }
pre::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }
/* ---------- quotes ---------- */
blockquote {
  margin: 1.5em 0;
  padding: 14px 20px;
  color: var(--ink);
  background: linear-gradient(90deg, var(--accent-soft), transparent 88%);
  border-left: 3px solid var(--accent);
  border-radius: 4px var(--radius-sm) var(--radius-sm) 4px;
}
blockquote > :first-child { margin-top: 0; }
blockquote > :last-child { margin-bottom: 0; }
blockquote p { color: inherit; }
blockquote cite, aside cite, figcaption cite {
  display: block;
  margin-top: .5em;
  font-size: .84em;
  font-style: normal;
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--muted);
}
blockquote cite::before, aside cite::before, figcaption cite::before {
  content: '— ';
  color: var(--accent);
}
aside {
  margin: 2em 0;
  padding: 4px 0 4px 0;
  max-width: 100%;
  border: none;
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  padding-block: 22px;
  text-align: center;
  text-wrap: balance;
  font-size: 1.3em;
  line-height: 1.45;
  font-weight: 500;
  font-style: normal;
  letter-spacing: -.015em;
  color: var(--ink);
}
aside cite { text-align: center; }
/* ---------- rules, lists, details, footer ---------- */
hr {
  width: 120px;
  height: 1px;
  margin: 2.4em auto;
  border: none;
  background: linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent);
}
ul, ol { margin: 1.05em 0; padding-left: 1.5em; }
li { margin: .3em 0; color: var(--ink-soft); text-wrap: pretty; }
li::marker { color: var(--accent); }
ol > li::marker { font-variant-numeric: tabular-nums; font-weight: 600; }
li > ul, li > ol { margin: .3em 0; }
ul.task-list { list-style: none; padding-left: .1em; }
ul.task-list > li { display: flex; align-items: flex-start; gap: .6em; }
li > input[type="checkbox"] {
  flex: 0 0 auto;
  width: 1.05em;
  height: 1.05em;
  margin: .32em .45em 0 0;
  accent-color: var(--accent);
  cursor: default;
}
ul.task-list > li > input[type="checkbox"] { margin-right: 0; }
li > input[type="checkbox"]:checked + * { color: var(--muted); }
details {
  margin: 1.4em 0;
  padding: 14px 18px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: background .2s ease;
}
details:hover { background: var(--surface-sunken); }
details summary {
  display: flex;
  align-items: center;
  gap: .5em;
  font-weight: 650;
  color: var(--ink);
  cursor: pointer;
  list-style: none;
  user-select: none;
}
details summary::-webkit-details-marker { display: none; }
details summary::before {
  content: '';
  width: .42em; height: .42em;
  border-right: 2px solid var(--accent);
  border-bottom: 2px solid var(--accent);
  transform: rotate(-45deg);
  transition: transform .2s ease;
  flex: 0 0 auto;
}
details[open] summary::before { transform: rotate(45deg); }
details[open] summary { margin-bottom: .7em; }
details > :last-child { margin-bottom: 0; }
footer {
  margin-top: 2.4em;
  padding-top: 1.2em;
  border-top: 1px solid var(--hairline);
  color: var(--muted);
  font-size: .9em;
}
/* ---------- media ---------- */
figure { margin: 1.7em 0; }
figure > :first-child { margin-top: 0; }
img, video {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
}
figure img, figure video { display: block; width: 100%; box-shadow: 0 1px 2px var(--hairline); }
figcaption {
  margin-top: .7em;
  font-size: .88em;
  line-height: 1.55;
  color: var(--muted);
  text-wrap: pretty;
}
audio {
  width: 100%;
  margin: 1.2em 0;
  border-radius: 999px;
  background: var(--surface-alt);
}
img[tg-spoiler], video[tg-spoiler] {
  filter: blur(22px) saturate(1.25);
  cursor: pointer;
  transition: filter .3s ease;
}
img[tg-spoiler]:hover, video[tg-spoiler]:hover,
img[tg-spoiler].revealed, video[tg-spoiler].revealed { filter: none; }
/* ---------- tables ---------- */
table {
  margin: 1.6em 0;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: .95em;
  font-variant-numeric: tabular-nums lining-nums;
  overflow: hidden;
}
table caption {
  caption-side: top;
  text-align: left;
  padding: 0 0 .6em;
  font-weight: 650;
  color: var(--ink);
  letter-spacing: -.01em;
}
th, td {
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--hairline);
}
tr:last-child > th, tr:last-child > td { border-bottom: none; }
th {
  background: var(--surface-alt);
  color: var(--ink);
  font-weight: 650;
  font-size: .92em;
  letter-spacing: .01em;
  border-bottom: 1px solid var(--border);
}
td { color: var(--ink-soft); }
tr:first-child > *:first-child { border-top-left-radius: 11px; }
tr:first-child > *:last-child { border-top-right-radius: 11px; }
tr:last-child > *:first-child { border-bottom-left-radius: 11px; }
tr:last-child > *:last-child { border-bottom-right-radius: 11px; }
table[striped] tr:nth-of-type(even) > td { background: var(--surface-alt); }
table[bordered] th, table[bordered] td { border-right: 1px solid var(--hairline); }
table[bordered] th { border-right-color: var(--border); }
table[bordered] tr > *:last-child { border-right: none; }
th[align="center"], td[align="center"] { text-align: center; }
th[align="right"], td[align="right"] { text-align: right; }
th[valign="middle"], td[valign="middle"] { vertical-align: middle; }
th[valign="bottom"], td[valign="bottom"] { vertical-align: bottom; }
/* ---------- telegram custom tags ---------- */
tg-spoiler {
  background: var(--spoiler);
  color: transparent;
  border-radius: 5px;
  padding: 0 .16em;
  cursor: pointer;
  user-select: none;
  text-shadow: none;
  box-decoration-break: clone;
  transition: background .25s ease, color .25s ease;
}
tg-spoiler * { color: transparent !important; }
tg-spoiler.revealed {
  background: var(--accent-soft);
  color: inherit;
  user-select: auto;
  cursor: auto;
}
tg-spoiler.revealed * { color: inherit !important; }
tg-time {
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
tg-emoji { display: inline-block; line-height: 1; vertical-align: -.06em; }
tg-math {
  background: var(--accent-soft);
  color: var(--accent-ink);
  border-radius: 6px;
  padding: .08em .4em;
  font-size: .92em;
}
tg-math-block {
  display: block;
  margin: 1.5em 0;
  padding: 20px 18px;
  text-align: center;
  white-space: pre-wrap;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 1.02em;
  line-height: 1.6;
  overflow-x: auto;
}
tg-map {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  margin: 1.5em 0;
  padding: 18px;
  border: 1px solid var(--accent-line);
  border-radius: var(--radius-sm);
  color: var(--accent-ink);
  font-weight: 600;
  letter-spacing: .01em;
  background-color: var(--surface-alt);
  background-image:
    radial-gradient(circle at 30% 25%, var(--accent-soft), transparent 55%),
    linear-gradient(135deg, var(--accent-soft), transparent 70%),
    repeating-linear-gradient(0deg, var(--hairline) 0 1px, transparent 1px 34px),
    repeating-linear-gradient(90deg, var(--hairline) 0 1px, transparent 1px 34px);
}
tg-map::before { content: '📍'; font-size: 1.8em; line-height: 1; }
tg-map::after { content: 'Location'; font-size: .82em; color: var(--muted); font-weight: 500; }
tg-map figcaption { color: var(--muted); font-weight: 400; text-align: center; }
tg-collage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 1.5em 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
tg-collage img, tg-collage video {
  width: 100%;
  height: 100%;
  min-height: 140px;
  object-fit: cover;
  border-radius: 6px;
}
tg-slideshow {
  display: flex;
  gap: 4px;
  margin: 1.5em 0;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
tg-slideshow img, tg-slideshow video {
  flex: 0 0 100%;
  scroll-snap-align: start;
  border-radius: var(--radius-sm);
  object-fit: cover;
}
tg-collage figcaption, tg-slideshow figcaption { grid-column: 1 / -1; flex: 0 0 100%; }
/* ---------- responsive ---------- */
@media (max-width: 860px) {
  article { padding: 40px 36px 44px; }
}
@media (max-width: 640px) {
  body { padding: 0; background-attachment: scroll; }
  article {
    max-width: none;
    margin: 0;
    padding: 26px 20px 34px;
    border: none;
    border-radius: 0;
    box-shadow: none;
    min-height: 100vh;
  }
  h1 { font-size: 1.8em; }
  h2 { font-size: 1.4em; }
  aside { font-size: 1.15em; }
  pre, tg-math-block { border-radius: 10px; }
}
/* ---------- accessibility ---------- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
/* ---------- print ---------- */
@media print {
  :root { --shadow: none; }
  body {
    padding: 0;
    background: none;
    background-color: #fff;
    color: #000;
    font-size: 11.5pt;
  }
  article {
    max-width: none;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: none;
  }
  a { color: #000; text-decoration: underline; }
  pre, tg-math-block, details, table, figure, blockquote { break-inside: avoid; box-shadow: none; }
  pre, tg-math-block, details { background: none; border: 1px solid #bbb; }
  tg-spoiler, tg-spoiler * { background: none; color: inherit !important; }
  tg-map { min-height: 120px; background: none; border: 1px dashed #bbb; }
  img, video { max-height: 60vh; object-fit: contain; }
}
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

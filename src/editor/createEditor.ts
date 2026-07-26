// src/editor/createEditor.ts
//
// Editor factory — wires schema, plugins and node views into a ProseMirror
// view. History is tuned to the Android RichEditorHistory behaviour:
// 800 ms typing coalescing window, 150-step cap.

import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history } from 'prosemirror-history'
import { schema, N } from './schema'
import { buildKeymap, markdownRules, slashCommandPlugin, selectionReporter, SlashState, SelectionInfo } from './plugins'
import { nodeViews } from './nodeviews'

export interface EditorOptions {
  onSlash: (s: SlashState) => void
  onSelection: (info: SelectionInfo) => void
  onOpenLink: () => void
}

/** Opening document — a heading and a hint line, like a fresh article. */
function initialDoc() {
  const hint = N.paragraph.create(null, [
    schema.text('Select text to format it · type '),
    schema.text('/', [schema.marks.code.create()]),
    schema.text(' for commands · '),
    schema.text('Markdown', [schema.marks.bold.create()]),
    schema.text(' shortcuts work at the start of a line.'),
  ])
  return N.doc.create(null, [
    N.heading.create({ level: 1 }, [schema.text('Untitled article')]),
    hint,
    N.paragraph.create(),
  ])
}

export function createEditor(mount: HTMLElement, opts: EditorOptions): EditorView {
  const state = EditorState.create({
    schema,
    doc: initialDoc(),
    plugins: [
      // Android parity: 800ms typing debounce, 150 snapshots
      history({ newGroupDelay: 800, depth: 150 }),
      ...buildKeymap({ onOpenLink: opts.onOpenLink }),
      markdownRules(),
      slashCommandPlugin(opts.onSlash),
      selectionReporter(opts.onSelection),
    ],
  })

  return new EditorView(mount, {
    state,
    nodeViews,
    attributes: {
      class: 'rich-editor',
      spellcheck: 'false',
      'aria-label': 'Rich article editor',
    },
  })
}

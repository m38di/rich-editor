// src/components/PreviewSheet.tsx
//
// The messaging replacement, iOS-style: a full-screen sheet with a
// segmented Preview ⇄ HTML switch, Copy and Download actions.

import { useState } from 'react'
import { copyToClipboard, downloadHtml, slugify } from '../editor/exportHtml'
import { Download, Copy } from './icons'

interface PreviewSheetProps {
  title: string
  fragment: string
  standalone: string
  onClose: () => void
  notify: (t: string) => void
}

export function PreviewSheet({ title, fragment, standalone, onClose, notify }: PreviewSheetProps) {
  const [tab, setTab] = useState<'preview' | 'html'>('preview')
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await copyToClipboard(fragment)
    setCopied(ok)
    notify(ok ? 'HTML fragment copied' : 'Copy failed — select and copy manually')
    setTimeout(() => setCopied(false), 1600)
  }

  const download = () => {
    downloadHtml(`${slugify(title)}.html`, standalone)
    notify('Downloading standalone .html')
  }

  return (
    <div className="full-sheet" role="dialog" aria-label="Generated HTML">
      {/* header */}
      <div className="ios-vibrancy border-b border-ios-sep px-2 pb-2 pt-[calc(8px+env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-[720px] items-center">
          <button type="button" className="sheet-action" onClick={onClose}>
            Done
          </button>
          <div className="flex flex-1 justify-center">
            <div className="ios-seg">
              <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
                Preview
              </button>
              <button type="button" className={tab === 'html' ? 'on' : ''} onClick={() => setTab('html')}>
                HTML
              </button>
            </div>
          </div>
          <button type="button" className="ios-icon-btn" onClick={download} title="Download .html" aria-label="Download .html">
            <Download size={21} />
          </button>
        </div>
        <div className="mx-auto max-w-[720px] truncate px-16 text-center text-[11px] font-medium text-ios-secondary">
          {title} · {(fragment.length / 1024).toFixed(1)} KB · reference tags only
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1">
        {tab === 'preview' ? (
          <iframe
            title="HTML preview"
            className="h-full w-full border-0 bg-ios-grouped"
            srcDoc={standalone}
            sandbox="allow-same-origin allow-scripts"
          />
        ) : (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap bg-white p-4 font-mono text-[12.5px] leading-relaxed text-ios-label">
            {fragment}
          </pre>
        )}
      </div>

      {/* footer actions */}
      <div className="ios-vibrancy border-t border-ios-sep px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-[720px] items-center justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            className="press flex items-center gap-2 rounded-full bg-ios-fill px-4 py-2.5 text-[14px] font-semibold text-ios-label"
          >
            <Copy size={16} />
            {copied ? 'Copied' : 'Copy HTML'}
          </button>
          <button
            type="button"
            onClick={download}
            className="press flex items-center gap-2 rounded-full bg-ios-blue px-5 py-2.5 text-[14px] font-semibold text-white shadow-send"
          >
            <Download size={16} />
            Download .html
          </button>
        </div>
      </div>
    </div>
  )
}

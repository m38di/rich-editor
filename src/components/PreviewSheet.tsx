// src/components/PreviewSheet.tsx
//
// Full-screen result view: a segmented Preview ⇄ HTML switch, copy and
// download actions, and the document's size at a glance.

import { useEffect, useState } from 'react'
import { copyToClipboard, downloadHtml, slugify } from '../editor/exportHtml'
import { Download, Copy, Xmark, Check } from './icons'
import { useAnimatedClose } from '../hooks/useAnimatedClose'

interface PreviewSheetProps {
  title: string
  fragment: string
  standalone: string
  onClose: () => void
  notify: (t: string) => void
}

export function PreviewSheet({
  title,
  fragment,
  standalone,
  onClose,
  notify,
}: PreviewSheetProps) {
  const [tab, setTab] = useState<'preview' | 'html'>('preview')
  const [copied, setCopied] = useState(false)
  const { closing, close } = useAnimatedClose(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const copy = async () => {
    const ok = await copyToClipboard(fragment)
    setCopied(ok)
    notify(ok ? 'HTML fragment copied' : 'Copy failed — select and copy manually')
    setTimeout(() => setCopied(false), 1800)
  }

  const download = () => {
    downloadHtml(`${slugify(title)}.html`, standalone)
    notify('Downloading standalone .html')
  }

  return (
    <div
      className={`full-sheet${closing ? ' closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Generated HTML"
    >
      <header className="app-bar">
        <button
          type="button"
          className="icon-btn"
          onClick={close}
          title="Close"
          aria-label="Close preview"
        >
          <Xmark size={19} />
        </button>

        <span className="min-w-0">
          <span className="brand-title block truncate">{title}</span>
          <span className="brand-sub block">
            {(new Blob([standalone]).size / 1024).toFixed(1)} KB · semantic HTML
          </span>
        </span>

        <div className="flex-1" />

        <div className="ios-seg">
          <button
            type="button"
            className={tab === 'preview' ? 'on' : ''}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={tab === 'html' ? 'on' : ''}
            onClick={() => setTab('html')}
          >
            HTML
          </button>
        </div>

        <div className="flex-1" />

        <button type="button" onClick={copy} className="pill-btn" title="Copy the HTML fragment">
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button
          type="button"
          onClick={download}
          className="pill-btn primary ml-1.5"
          title="Download a standalone .html file"
        >
          <Download size={15} />
          <span className="hidden sm:inline">Download</span>
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {tab === 'preview' ? (
          <iframe
            title="HTML preview"
            className="h-full w-full border-0 bg-ios-canvas"
            srcDoc={standalone}
            sandbox="allow-same-origin allow-scripts"
          />
        ) : (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap bg-ios-card p-5 font-mono text-[12.5px] leading-relaxed text-ios-label">
            {fragment}
          </pre>
        )}
      </div>
    </div>
  )
}

// src/components/ErrorBoundary.tsx
//
// Catches any runtime error and renders a readable, actionable card instead
// of a blank page. Uses the design tokens so it matches the active theme.

import React from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[RichEditor] crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error.message || String(this.state.error)
    const stack = (this.state.error.stack || '').split('\n').slice(0, 6).join('\n')

    return (
      <div className="grid min-h-screen place-items-center bg-ios-canvas p-6">
        <div className="w-full max-w-[440px] rounded-sheet border border-ios-sep bg-ios-card p-7 text-center shadow-ios-sheet">
          <div
            className="mx-auto grid h-12 w-12 place-items-center rounded-full text-[24px]"
            style={{ background: 'var(--fill)' }}
          >
            ⚠️
          </div>
          <h1 className="mt-3 text-[19px] font-bold tracking-[-0.4px] text-ios-label">
            The editor hit a snag
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ios-secondary">
            The crash is contained. Copy the details below and report them, or reload for a
            fresh session — your unsaved document cannot be recovered.
          </p>
          <pre
            className="mt-4 max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-card bg-ios-grouped p-3 text-left font-mono text-[11.5px] leading-relaxed"
            style={{ color: 'var(--red)' }}
          >
            {message}
            {'\n\n'}
            {stack}
          </pre>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="pill-btn primary flex-1 justify-center"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="pill-btn flex-1 justify-center"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }
}

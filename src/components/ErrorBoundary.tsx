// src/components/ErrorBoundary.tsx
//
// Catches any runtime error and renders an iOS-style alert card instead
// of a blank page — so a crash is always readable and actionable.

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
      <div
        className="grid min-h-screen place-items-center p-6"
        style={{
          background: '#f2f2f7',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div
          className="w-full max-w-[400px] rounded-[14px] bg-white p-6 text-center"
          style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
        >
          <div className="text-[36px]">⚠️</div>
          <h1 className="mt-2 text-[19px] font-bold tracking-[-0.3px] text-black">
            The editor hit a snag
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: 'rgba(60,60,67,0.6)' }}>
            The crash is contained — copy the details below and report them, or reload for a
            fresh session.
          </p>
          <pre
            className="mt-4 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] p-3 text-left font-mono text-[11.5px] leading-relaxed"
            style={{ background: '#f2f2f7', color: '#ff3b30' }}
          >
            {message}
            {'\n\n'}
            {stack}
          </pre>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-[10px] py-2.5 text-[15px] font-semibold text-white transition active:scale-95"
              style={{ background: '#007aff' }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="flex-1 rounded-[10px] py-2.5 text-[15px] font-semibold text-black transition active:scale-95"
              style={{ background: 'rgba(120,120,128,0.12)' }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }
}

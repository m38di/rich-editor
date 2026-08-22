// src/hooks/useTheme.ts
//
// Light / dark / system theme with no first-paint flash: index.html applies
// the resolved class before React mounts, and this hook keeps it in sync.

import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 're-theme'

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    /* private mode — fall through to system */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0b0e14' : '#f4f5f8')
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    readChoice() === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : (readChoice() as ResolvedTheme),
  )

  useEffect(() => {
    const next: ResolvedTheme =
      choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice
    setResolved(next)
    apply(next)
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {
      /* ignore */
    }
  }, [choice])

  // follow the OS while on "system"
  useEffect(() => {
    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? 'dark' : 'light'
      setResolved(next)
      apply(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  /** Cycles light → dark → system. */
  const cycle = useCallback(() => {
    setChoice((cur) => (cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light'))
  }, [])

  return { choice, resolved, setChoice, cycle }
}

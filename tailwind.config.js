/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Every token resolves to a CSS variable, so the same utility class
        // works in both themes (see src/styles/tokens.css).
        // `blue` keeps bare RGB channels so `bg-ios-blue/10` still works.
        ios: {
          blue: 'rgb(var(--c-accent) / <alpha-value>)',
          bluedeep: 'var(--accent-strong)',
          canvas: 'var(--canvas)',
          card: 'var(--surface)',
          grouped: 'var(--surface-2)',
          sunken: 'var(--surface-3)',
          elevated: 'var(--elevated)',
          label: 'var(--text)',
          secondary: 'var(--muted)',
          tertiary: 'var(--faint)',
          sep: 'var(--sep)',
          sepstrong: 'var(--sep-strong)',
          fill: 'var(--fill)',
          fill2: 'var(--fill-2)',
          fill3: 'var(--fill-3)',
          bar: 'var(--bar)',
          green: 'var(--green)',
          red: 'var(--red)',
          orange: 'var(--orange)',
          yellow: 'var(--yellow)',
          purple: 'var(--purple)',
          pink: 'var(--pink)',
          teal: 'var(--teal)',
          indigo: 'var(--indigo)',
        },
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        ios: 'var(--shadow-sm)',
        'ios-md': 'var(--shadow-md)',
        'ios-pop': 'var(--shadow-pop)',
        'ios-sheet': 'var(--shadow-lg)',
        paper: 'var(--shadow-paper)',
        send: 'var(--accent-glow)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        smooth: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      borderRadius: {
        ios: 'var(--r-sm)',
        sheet: 'var(--r-xl)',
        card: 'var(--r-md)',
      },
    },
  },
  plugins: [],
}

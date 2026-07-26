/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Telegram iOS light palette
        ios: {
          blue: '#007AFF',
          bluedeep: '#0064D2',
          grouped: '#F2F2F7',
          card: '#FFFFFF',
          label: '#000000',
          secondary: 'rgba(60,60,67,0.6)',
          tertiary: 'rgba(60,60,67,0.33)',
          sep: 'rgba(60,60,67,0.14)',
          fill: 'rgba(120,120,128,0.12)',
          fill2: 'rgba(120,120,128,0.18)',
          green: '#34C759',
          red: '#FF3B30',
          orange: '#FF9500',
          yellow: '#FFCC00',
          purple: '#AF52DE',
          pink: '#FF2D55',
          teal: '#5AC8FA',
          indigo: '#5856D6',
          bar: 'rgba(249,249,249,0.92)',
        },
      },
      fontFamily: {
        // SF Pro on Apple devices; closest system faces elsewhere
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'ios': '0 0 0 0.5px rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.08)',
        'ios-pop': '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        'ios-sheet': '0 -8px 40px rgba(0,0,0,0.16)',
        'send': '0 3px 10px rgba(0,122,255,0.42)',
      },
      // iOS spring curves
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'spring-soft': 'cubic-bezier(0.25, 0.9, 0.35, 1)',
      },
      keyframes: {
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.86) translateY(12px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'banner-down': {
          '0%': { opacity: '0', transform: 'translate(-50%, -18px) scale(0.94)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0) scale(1)' },
        },
        'spoiler-shimmer': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '220px 0' },
        },
      },
      animation: {
        'sheet-up': 'sheet-up 0.46s cubic-bezier(0.32,0.72,0,1) both',
        'fade-in': 'fade-in 0.28s ease-out both',
        'pop-in': 'pop-in 0.3s cubic-bezier(0.32,0.72,0,1) both',
        'banner-down': 'banner-down 0.42s cubic-bezier(0.32,0.72,0,1) both',
      },
      borderRadius: {
        'ios': '10px',
        'sheet': '13px',
      },
    },
  },
  plugins: [],
}

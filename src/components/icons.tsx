// src/components/icons.tsx
// SF Symbols–inspired icon set (thin 1.7px strokes, round caps) — the
// visual language of Telegram iOS.

import React from 'react'

export interface IconProps {
  size?: number
  stroke?: number
  className?: string
}

function S({
  size = 22,
  stroke = 1.7,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const ChevronLeft = (p: IconProps) => (
  <S {...p} stroke={2.1}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </S>
)

export const ChevronRight = (p: IconProps) => (
  <S {...p} stroke={2}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </S>
)

export const Undo = (p: IconProps) => (
  <S {...p}>
    <path d="M8.5 13.5L4 9l4.5-4.5" />
    <path d="M4 9h9.5a6 6 0 0 1 0 12H10" />
  </S>
)

export const Redo = (p: IconProps) => (
  <S {...p}>
    <path d="M15.5 13.5L20 9l-4.5-4.5" />
    <path d="M20 9h-9.5a6 6 0 0 0 0 12H14" />
  </S>
)

export const Plus = (p: IconProps) => (
  <S {...p} stroke={2}>
    <path d="M12 5.5v13M5.5 12h13" />
  </S>
)

export const Xmark = (p: IconProps) => (
  <S {...p} stroke={2.1}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </S>
)

export const Check = (p: IconProps) => (
  <S {...p} stroke={2.2}>
    <path d="M5 12.5l4.3 4.3L19 7.5" />
  </S>
)

export const Smiley = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M8.6 14.4s1.2 1.9 3.4 1.9 3.4-1.9 3.4-1.9" />
    <path d="M9.2 9.6h.01M14.8 9.6h.01" strokeWidth={2.4} />
  </S>
)

export const ListBullet = (p: IconProps) => (
  <S {...p}>
    <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
    <path d="M4.4 6.5h.01M4.4 12h.01M4.4 17.5h.01" strokeWidth={2.6} />
  </S>
)

export const Table = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
    <path d="M3.5 9.5h17M9.7 4.5v15" />
  </S>
)

export const SendArrow = (p: IconProps) => (
  <S {...p} stroke={2.4}>
    <path d="M12 18.5V6.5" />
    <path d="M6 12.5l6-6 6 6" />
  </S>
)

export const EyeSlash = (p: IconProps) => (
  <S {...p}>
    <path d="M4 4l16 16" />
    <path d="M10.7 5.3c.4-.05.85-.08 1.3-.08 4.9 0 8.4 4.1 9.5 6.78-.55 1.3-1.7 2.9-3.3 4.1M6.9 6.9C4.6 8.3 3.1 10.4 2.5 12c1.1 2.68 4.6 6.78 9.5 6.78 1.6 0 3.1-.45 4.35-1.2" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </S>
)

export const Link = (p: IconProps) => (
  <S {...p}>
    <path d="M10.2 13.8a4.2 4.2 0 0 0 5.94 0l3-3a4.2 4.2 0 0 0-5.94-5.94l-1.5 1.5" />
    <path d="M13.8 10.2a4.2 4.2 0 0 0-5.94 0l-3 3a4.2 4.2 0 0 0 5.94 5.94l1.5-1.5" />
  </S>
)

export const Calendar = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.75h17M8.25 3v4M15.75 3v4" />
  </S>
)

export const Quote = (p: IconProps) => (
  <S {...p} stroke={0}>
    <path
      fill="currentColor"
      d="M7.2 5.6C4.9 7 3.5 9.3 3.5 12.4c0 3 1.8 5 4.3 5 2.2 0 3.7-1.5 3.7-3.6 0-2-1.4-3.4-3.3-3.4-.4 0-.9.07-1 .1.3-1.7 1.7-3.4 3.3-4.3L7.2 5.6zm9 0c-2.3 1.4-3.7 3.7-3.7 6.8 0 3 1.8 5 4.3 5 2.2 0 3.7-1.5 3.7-3.6 0-2-1.4-3.4-3.3-3.4-.4 0-.9.07-1 .1.3-1.7 1.7-3.4 3.3-4.3l-3.3-.6z"
    />
  </S>
)

export const Highlighter = (p: IconProps) => (
  <S {...p}>
    <path d="M13.7 4.2l6.1 6.1-7.6 7.6H8.6v-3.6l5.1-5.1z" />
    <path d="M11 6.9l6.1 6.1M8.6 20.5H3.5" />
  </S>
)

export const ClearFormat = (p: IconProps) => (
  <S {...p}>
    <path d="M9.5 5.5H19a1.8 1.8 0 0 1 1.8 1.8v9.4a1.8 1.8 0 0 1-1.8 1.8H9.5L3.2 12l6.3-6.5z" />
    <path d="M12.8 10l4.6 4M17.4 10l-4.6 4" />
  </S>
)

export const Download = (p: IconProps) => (
  <S {...p}>
    <path d="M12 4v9.5" />
    <path d="M7.75 10.25L12 14.5l4.25-4.25" />
    <path d="M5 19h14" />
  </S>
)

export const Copy = (p: IconProps) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.2" />
    <path d="M5.5 14.5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2v.5" />
  </S>
)

export const Camera = (p: IconProps) => (
  <S {...p}>
    <path d="M4 8.25h2.9L8.8 5.9h6.4l1.9 2.35H19.9a1.6 1.6 0 0 1 1.6 1.6v8.3a1.6 1.6 0 0 1-1.6 1.6H4.1a1.6 1.6 0 0 1-1.6-1.6V9.85a1.6 1.6 0 0 1 1.5-1.55z" />
    <circle cx="12" cy="13.4" r="3.4" />
  </S>
)

export const Video = (p: IconProps) => (
  <S {...p}>
    <rect x="2.75" y="7" width="12.5" height="10" rx="2.2" />
    <path d="M15.25 10.8l6-3.05v8.5l-6-3.05" />
  </S>
)

export const MusicNote = (p: IconProps) => (
  <S {...p}>
    <path d="M9.5 17.5V6.2l9.5-2v11" />
    <circle cx="7" cy="17.7" r="2.5" />
    <circle cx="16.5" cy="15.4" r="2.5" />
  </S>
)

export const MapPin = (p: IconProps) => (
  <S {...p}>
    <path d="M12 21s-6.8-5.4-6.8-10.8a6.8 6.8 0 0 1 13.6 0C18.8 15.6 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.4" />
  </S>
)

export const Photo = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M5.5 17l4.3-4.3 2.9 2.9 2.4-2.4 3.4 3.4" />
  </S>
)

export const Collage = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" />
    <rect x="13" y="13" width="7.5" height="7.5" rx="1.8" />
  </S>
)

export const Slideshow = (p: IconProps) => (
  <S {...p}>
    <rect x="5.5" y="6.5" width="13" height="11" rx="2" />
    <path d="M3 9v6M21 9v6" />
    <path d="M10.5 9.75l4 2.25-4 2.25z" fill="currentColor" stroke="none" />
  </S>
)

export const Toggle = (p: IconProps) => (
  <S {...p}>
    <path d="M9.5 6.5L15 12l-5.5 5.5" />
    <path d="M4 6.5L9.5 12 4 17.5" opacity={0.45} />
  </S>
)

export const Divider = (p: IconProps) => (
  <S {...p}>
    <path d="M4 12h16" />
    <path d="M4 6.5h16M4 17.5h16" opacity={0.3} />
  </S>
)

export const Function = (p: IconProps) => (
  <S {...p}>
    <path d="M9.5 19.5c2.5 0 3-2.5 3.6-5.5l1-5c.5-2.5 1.2-4.5 3.9-4.5" />
    <path d="M7 9.5h9" />
  </S>
)

export const Minus = (p: IconProps) => (
  <S {...p} stroke={2}>
    <path d="M6 12h12" />
  </S>
)

export const TextBlock = (p: IconProps) => (
  <S {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h10" />
  </S>
)

export const Location = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <circle cx="12" cy="12" r="3.25" />
    <path d="M12 3.25v2.5M12 18.25v2.5M3.25 12h2.5M18.25 12h2.5" />
  </S>
)

/* ── shell chrome ──────────────────────────────────────────────────── */

export const Sun = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4.25" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </S>
)

export const Moon = (p: IconProps) => (
  <S {...p}>
    <path d="M20.5 14.4A8.6 8.6 0 1 1 9.6 3.5a7 7 0 0 0 10.9 10.9z" />
  </S>
)

export const Auto = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 3.25a8.75 8.75 0 0 1 0 17.5z" fill="currentColor" stroke="none" />
  </S>
)

export const Sparkle = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z" />
    <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </S>
)

export const Eye = (p: IconProps) => (
  <S {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3.1" />
  </S>
)

export const Bold = (p: IconProps) => (
  <S {...p} stroke={2.2}>
    <path d="M7 4.5h6.2a3.75 3.75 0 0 1 0 7.5H7z" />
    <path d="M7 12h7a3.75 3.75 0 0 1 0 7.5H7z" />
  </S>
)

export const Italic = (p: IconProps) => (
  <S {...p} stroke={2}>
    <path d="M15.5 4.5h-5M13.5 19.5h-5M14.2 4.5L9.8 19.5" />
  </S>
)

export const Underline = (p: IconProps) => (
  <S {...p} stroke={2}>
    <path d="M7 4.5v6.8a5 5 0 0 0 10 0V4.5" />
    <path d="M5.5 20h13" />
  </S>
)

export const Strike = (p: IconProps) => (
  <S {...p} stroke={2}>
    <path d="M4.5 12h15" />
    <path d="M16.5 7.4C16 5.8 14.3 4.7 12 4.7c-2.6 0-4.4 1.3-4.4 3.2 0 1.5 1 2.6 3 3.2M7.5 16.4c.6 1.7 2.3 2.9 4.7 2.9 2.8 0 4.6-1.4 4.6-3.4 0-1.2-.6-2.2-1.8-2.9" />
  </S>
)

export const CodeTag = (p: IconProps) => (
  <S {...p}>
    <path d="M9 8.5L5 12l4 3.5M15 8.5l4 3.5-4 3.5" />
  </S>
)

export const Trash = (p: IconProps) => (
  <S {...p}>
    <path d="M4.5 7h15M9.5 7V5.2c0-.6.5-1.2 1.2-1.2h2.6c.7 0 1.2.6 1.2 1.2V7" />
    <path d="M6.5 7l.9 11.6c.05.8.7 1.4 1.5 1.4h6.2c.8 0 1.45-.6 1.5-1.4L17.5 7" />
    <path d="M10.5 11v5.5M13.5 11v5.5" />
  </S>
)


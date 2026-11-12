/**
 * Interface icons, drawn inline so they look the same on every device. Symbol
 * characters such as ☀ or ⛶ depend on which fonts a phone or PC happens to have, and
 * show up as empty boxes when it has none.
 */
import type { ReactNode } from 'react'

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const SunIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.8" fill="currentColor" stroke="none" />
    <path d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M3.3 12.7l1.1-1.1M11.6 4.4l1.1-1.1" />
  </Icon>
)

export const MoonIcon = () => (
  <Icon>
    <path
      d="M12.9 9.7A5.6 5.6 0 0 1 6.3 3.1a5.6 5.6 0 1 0 6.6 6.6Z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
)

export const FullscreenIcon = () => (
  <Icon>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Icon>
)

export const PauseIcon = () => (
  <Icon>
    <path d="M5.5 3.2v9.6M10.5 3.2v9.6" strokeWidth="2.4" />
  </Icon>
)

export const ChevronLeftIcon = () => (
  <Icon size={14}>
    <path d="M10 3 5 8l5 5" />
  </Icon>
)

export const ChevronRightIcon = () => (
  <Icon size={14}>
    <path d="m6 3 5 5-5 5" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </Icon>
)

export const NorthIcon = () => (
  <Icon size={12}>
    <path d="M8 13.5v-11M3.8 6.6 8 2.4l4.2 4.2" />
  </Icon>
)

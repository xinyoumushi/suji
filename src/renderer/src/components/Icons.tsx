import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2c.6 0 1.2.25 1.7.7l1 1c.4.4 1 .7 1.6.7h5.5A2.5 2.5 0 0 1 21 10v6.5A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
  </Svg>
)

export const IconFolderOpen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2c.6 0 1.2.25 1.7.7l1 1c.4.4 1 .7 1.6.7h5.5A2.5 2.5 0 0 1 21 10" />
    <path d="M3 16.5V7.5M3.5 18.5h14.2a2 2 0 0 0 1.9-1.4l1.7-5.6H6.1a2 2 0 0 0-1.9 1.4l-1.7 5.6Z" />
  </Svg>
)

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)

export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7 10h6M7 14h10" />
  </Svg>
)

export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1 1 0 0 1 0 1.4Z" transform="translate(0.5 -0.5) scale(0.94)" />
    <circle cx="8" cy="8" r="1.4" />
  </Svg>
)

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
)

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
    <path d="m14 6 4 4" />
  </Svg>
)

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v12M7 11l5 5 5-5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Svg>
)

export const IconFlip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v16" />
    <path d="M8 8H5.5A1.5 1.5 0 0 0 4 9.5v5A1.5 1.5 0 0 0 5.5 16H8" />
    <path d="M16 8h2.5A1.5 1.5 0 0 1 20 9.5v5a1.5 1.5 0 0 1-1.5 1.5H16" />
  </Svg>
)

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 13 4 4L19 7" />
  </Svg>
)

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 3 20h18L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
)

export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
  </Svg>
)

export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4M6.7 6.7l2.8 2.8M14.5 14.5l2.8 2.8M17.3 6.7l-2.8 2.8M9.5 14.5l-2.8 2.8" />
  </Svg>
)

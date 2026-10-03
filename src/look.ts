export const ACCENT = '#00FF41'

export const LOOK = {
  meta: { dimColor: true },
  live: { color: 'cyan' },
  hint: { dimColor: true },
  error: { color: 'red' },
  warn: { color: 'yellow' },
  heading: { bold: true, color: ACCENT },
  accent: { color: ACCENT },
  badge: { color: ACCENT, bold: true },
  rule: { color: ACCENT, dimColor: true },
} as const

export const OPEN = '▾ '
export const CLOSED = '▸ '
export const LIVE = '●'
export const GONE = '∙'

export function fit(text: string, width: number): string {
  if (width <= 1) return text.slice(0, Math.max(0, width))
  return text.length > width ? `${text.slice(0, width - 1)}…` : text
}

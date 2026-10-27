/** Formats a count without grouping, preserving the compact catalog layout. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN', { useGrouping: false, maximumFractionDigits: 0 }).format(
    value,
  )
}

/** Formats a two-digit section number. */
export function formatIndex(index: number): string {
  return formatCount(index + 1).padStart(2, '0')
}

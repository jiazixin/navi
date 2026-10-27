export function monogramOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase()
}

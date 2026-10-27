// Browser storage can be unavailable (private mode, blocked site data); preferences then
// fall back to configured defaults for the current page only.
/** Reads a non-secret preference, returning null when browser storage is unavailable. */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Saves a non-secret preference; blocked storage leaves the current UI usable. */
export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
}

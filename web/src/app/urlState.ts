import { useSyncExternalStore } from 'react'

const maxURLValueLength = 1000
const urlChangeEvent = 'navi:url-change'
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(urlChangeEvent, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(urlChangeEvent, listener)
  }
}

/** Keeps shareable UI selections in the URL and responds to browser history. */
export function useURLString(key: string, fallback = ''): [string, (value: string) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  const value = (new URLSearchParams(search).get(key) ?? fallback).slice(0, maxURLValueLength)
  return [
    value,
    (next) => {
      const url = new URL(window.location.href)
      if (next) url.searchParams.set(key, next.slice(0, maxURLValueLength))
      else url.searchParams.delete(key)
      window.history.replaceState(window.history.state, '', url)
      window.dispatchEvent(new Event(urlChangeEvent))
    },
  ]
}

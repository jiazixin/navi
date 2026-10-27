import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useURLString } from './urlState'

describe('shareable URL state', () => {
  it('restores selections and preserves unrelated parameters on edits', () => {
    window.history.replaceState(null, '', '/?page=work&q=docs')
    const { result } = renderHook(() => useURLString('q'))
    expect(result.current[0]).toBe('docs')
    act(() => result.current[1]('中文 & docs'))
    expect(new URLSearchParams(window.location.search).get('q')).toBe('中文 & docs')
    expect(new URLSearchParams(window.location.search).get('page')).toBe('work')
    act(() => result.current[1](''))
    expect(new URLSearchParams(window.location.search).has('q')).toBe(false)
  })

  it('responds to history changes and bounds hostile URL values', () => {
    const { result } = renderHook(() => useURLString('q'))
    act(() => {
      window.history.replaceState(null, '', '/?q=restored')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current[0]).toBe('restored')
    act(() => result.current[1]('x'.repeat(2000)))
    expect(result.current[0]).toHaveLength(1000)
    expect(new URLSearchParams(window.location.search).get('q')).toHaveLength(1000)
  })
})

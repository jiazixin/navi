import { describe, expect, it } from 'vitest'
import { getNextMenuIndex, isMenuNavigationKey } from './menuNavigation'

describe('menu keyboard navigation', () => {
  it.each([
    ['ArrowDown', 0, 1],
    ['ArrowDown', 3, 0],
    ['ArrowUp', 0, 3],
    ['ArrowUp', 2, 1],
    ['Home', 2, 0],
    ['End', 1, 3],
  ] as const)('%s moves focus from %i to %i', (key, currentIndex, expectedIndex) => {
    expect(getNextMenuIndex(key, currentIndex, 4)).toBe(expectedIndex)
  })

  it('keeps focus on the only option', () => {
    expect(getNextMenuIndex('ArrowDown', 0, 1)).toBe(0)
    expect(getNextMenuIndex('ArrowUp', 0, 1)).toBe(0)
  })

  it('leaves selection, dismissal and typing keys to the caller', () => {
    for (const key of ['Enter', 'Escape', 'Tab', 'a', 'ArrowLeft']) {
      expect(isMenuNavigationKey(key)).toBe(false)
    }
    expect(isMenuNavigationKey('ArrowDown')).toBe(true)
  })
})

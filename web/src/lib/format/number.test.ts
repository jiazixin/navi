import { describe, expect, it } from 'vitest'
import { formatCount, formatIndex } from './number'

describe('display numbers', () => {
  it('formats counts without grouping and pads one-based section numbers', () => {
    expect(formatCount(1000)).toBe('1000')
    expect(formatCount(0)).toBe('0')
    expect(formatIndex(0)).toBe('01')
    expect(formatIndex(19)).toBe('20')
  })
})

import { greeting } from './greeting'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { HeroClock } from './HeroClock'
import { describeDate, isoWeek } from '../../lib/format/time'

afterEach(() => {
  vi.useRealTimers()
})

describe('clock text', () => {
  it('greets by time of day', () => {
    expect(greeting(2)).toBe('夜深了，早些休息。')
    expect(greeting(8)).toBe('早上好，今天从哪里出发？')
    expect(greeting(12)).toBe('中午好，稍作停留。')
    expect(greeting(15)).toBe('下午好，继续前行。')
    expect(greeting(21)).toBe('晚上好，慢慢来。')
  })

  it('uses ISO week numbers across year boundaries', () => {
    expect(isoWeek(new Date(2026, 9, 16))).toBe(42)
    expect(isoWeek(new Date(2021, 0, 1))).toBe(53)
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1)
    expect(describeDate(new Date(2026, 9, 16))).toEqual({
      latin: 'FRI · 2026.10.16',
      chinese: '星期五 · 第 42 周',
    })
  })
})

describe('HeroClock', () => {
  it('ticks every second and exposes the time to assistive technology', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 9, 41, 59, 500))
    render(<HeroClock />)
    expect(screen.getByText('当前时间 09:41')).toBeInTheDocument()
    expect(screen.getByText('早上好，今天从哪里出发？')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByText('当前时间 09:42')).toBeInTheDocument()
  })
})

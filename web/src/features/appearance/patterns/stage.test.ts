import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecordingContext, installPath2D } from '../../../test/canvas'
import { PatternStage } from './stage'

let frames: FrameRequestCallback[] = []

function runFrame(time: number): void {
  const pending = frames
  frames = []
  for (const callback of pending) callback(time)
}

function createCanvas() {
  const canvas = document.createElement('canvas')
  const context = createRecordingContext()
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 200))
  return { canvas, context }
}

beforeEach(() => {
  installPath2D()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PatternStage', () => {
  it('draws a still frame once and animates at the renderer frame rate', () => {
    const { canvas, context } = createCanvas()
    const stage = new PatternStage(canvas, { isInteractive: true })
    stage.setPattern('contour')
    expect(canvas.width).toBe(320)

    runFrame(16)
    runFrame(32)
    expect(context.stroke).toHaveBeenCalledTimes(2)

    stage.setAnimated(true)
    window.dispatchEvent(
      Object.assign(new Event('pointermove'), { pointerType: 'mouse', clientX: 10, clientY: 20 }),
    )
    runFrame(100)
    runFrame(110)
    runFrame(140)
    expect(context.stroke).toHaveBeenCalledTimes(6)

    stage.dispose()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('clears the canvas for the plain pattern and redraws after a palette change', async () => {
    const { canvas, context } = createCanvas()
    const stage = new PatternStage(canvas, { virtualSize: { width: 960, height: 600 } })
    stage.setPattern('none')
    runFrame(16)
    expect(context.stroke).not.toHaveBeenCalled()

    stage.setPattern('ridge')
    runFrame(32)
    const strokes = context.stroke.mock.calls.length
    expect(strokes).toBeGreaterThan(0)
    document.documentElement.dataset.theme = 'dusk'
    await Promise.resolve()
    runFrame(48)
    expect(context.stroke.mock.calls.length).toBeGreaterThan(strokes)
    stage.dispose()
  })

  it('stays inert without a 2D context', () => {
    const canvas = document.createElement('canvas')
    const stage = new PatternStage(canvas)
    stage.setPattern('flow')
    stage.setAnimated(true)
    stage.tick(10)
    expect(frames).toHaveLength(0)
    stage.dispose()
  })
})

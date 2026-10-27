import { useEffect, useRef } from 'react'
import type { PatternID } from '../../app/appearance/options'
import { PatternStage } from './patterns/stage'

type PatternCanvasProps = {
  pattern: PatternID
  isAnimated: boolean
  className?: string | undefined
  /** Previews draw a fixed 960×600 scene scaled into the canvas and ignore the pointer. */
  isPreview?: boolean
}

const previewSize = { width: 960, height: 600 }

export function PatternCanvas({
  pattern,
  isAnimated,
  className,
  isPreview = false,
}: PatternCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<PatternStage | null>(null)
  // Latest props, read when the stage is (re)created.
  const latest = useRef({ pattern, isAnimated })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return undefined
    const stage = new PatternStage(
      canvas,
      isPreview ? { virtualSize: previewSize } : { isInteractive: true },
    )
    stage.setPattern(latest.current.pattern)
    stage.setAnimated(latest.current.isAnimated)
    stageRef.current = stage
    let resizeTimer: number | undefined
    const handleResize = (): void => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => stage.resize(), 150)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleResize)
      stage.dispose()
      stageRef.current = null
    }
  }, [isPreview])

  useEffect(() => {
    latest.current.pattern = pattern
    stageRef.current?.setPattern(pattern)
  }, [pattern])

  useEffect(() => {
    latest.current.isAnimated = isAnimated
    stageRef.current?.setAnimated(isAnimated)
  }, [isAnimated])

  return <canvas aria-hidden="true" className={className} data-pattern={pattern} ref={canvasRef} />
}

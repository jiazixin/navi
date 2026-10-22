import { useEffect, useRef } from 'react';
import type { PatternID } from './options';
import { PatternStage } from './patterns/stage';

type PatternCanvasProps = {
  pattern: PatternID;
  animated: boolean;
  className?: string | undefined;
  /** Previews draw a fixed 960×600 scene scaled into the canvas and ignore the pointer. */
  preview?: boolean;
};

const previewSize = { width: 960, height: 600 };

export function PatternCanvas({ pattern, animated, className, preview = false }: PatternCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<PatternStage | null>(null);
  // Latest props, read when the stage is (re)created.
  const latest = useRef({ pattern, animated });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const stage = new PatternStage(canvas, preview ? { virtualSize: previewSize } : { interactive: true });
    stage.setPattern(latest.current.pattern);
    stage.setAnimated(latest.current.animated);
    stageRef.current = stage;
    let resizeTimer: number | undefined;
    const handleResize = (): void => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => stage.resize(), 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      stage.dispose();
      stageRef.current = null;
    };
  }, [preview]);

  useEffect(() => {
    latest.current.pattern = pattern;
    stageRef.current?.setPattern(pattern);
  }, [pattern]);

  useEffect(() => {
    latest.current.animated = animated;
    stageRef.current?.setAnimated(animated);
  }, [animated]);

  return <canvas aria-hidden="true" className={className} data-pattern={pattern} ref={canvasRef} />;
}

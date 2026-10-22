import type { PatternID } from '../options';
import { patternRenderers, type PatternColors, type PatternPointer, type PatternRenderer } from './renderers';

const STILL_TIME = 180_000;
const POINTER_HOLD = 2_600;

type StageOptions = {
  /** Fixed drawing space for previews; the canvas shows it scaled to fit. */
  virtualSize?: { width: number; height: number };
  interactive?: boolean;
};

/** One canvas bound to one pattern renderer; all stages share a single animation loop. */
export class PatternStage {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D | null;
  readonly #virtualSize: StageOptions['virtualSize'];
  readonly #interactive: boolean;
  #renderer: PatternRenderer | null = null;
  #fps = 30;
  #lastFrameTime = 0;
  #animated = false;
  #dirty = true;
  #scale = 1;
  #lineScale = 1;

  constructor(canvas: HTMLCanvasElement, options: StageOptions = {}) {
    this.#canvas = canvas;
    this.#context = canvas.getContext('2d');
    this.#virtualSize = options.virtualSize;
    this.#interactive = options.interactive ?? false;
    if (this.#context !== null) register(this);
  }

  setPattern(pattern: PatternID): void {
    const definition = pattern === 'none' ? undefined : patternRenderers[pattern];
    this.#renderer = definition?.create() ?? null;
    this.#fps = definition?.fps ?? 30;
    this.resize();
  }

  setAnimated(animated: boolean): void {
    this.#animated = animated;
    this.invalidate();
  }

  invalidate(): void {
    this.#renderer?.reset?.();
    this.#dirty = true;
  }

  resize(): void {
    const context = this.#context;
    if (context === null) return;
    const rect = this.#canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.#canvas.width = Math.round(cssWidth * pixelRatio);
    this.#canvas.height = Math.round(cssHeight * pixelRatio);
    const width = this.#virtualSize?.width ?? cssWidth;
    const height = this.#virtualSize?.height ?? cssHeight;
    this.#scale = (cssWidth / width) * pixelRatio;
    this.#lineScale = width / cssWidth;
    this.#renderer?.resize(width, height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    this.#dirty = true;
  }

  tick(now: number): void {
    const context = this.#context;
    if (context === null) return;
    if (this.#renderer === null) {
      if (this.#dirty) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#dirty = false;
      }
      return;
    }
    if (!this.#animated) {
      if (!this.#dirty) return;
      this.#dirty = false;
      this.#draw(context, STILL_TIME, true);
      return;
    }
    if (now - this.#lastFrameTime < 1000 / this.#fps - 3) return;
    this.#lastFrameTime = now;
    this.#dirty = false;
    this.#draw(context, now, false);
  }

  dispose(): void {
    unregister(this);
  }

  #draw(context: CanvasRenderingContext2D, time: number, still: boolean): void {
    context.setTransform(this.#scale, 0, 0, this.#scale, 0, 0);
    this.#renderer?.frame(context, time, this.#interactive && !still ? pointer : idlePointer, colors, {
      lineScale: this.#lineScale,
      still,
    });
  }
}

const stages = new Set<PatternStage>();
const pointer: PatternPointer = { x: 0, y: 0, strength: 0 };
const idlePointer: PatternPointer = { x: 0, y: 0, strength: 0 };
const pointerTarget = { x: 0, y: 0, time: Number.NEGATIVE_INFINITY };
let colors: PatternColors = { line: '238, 236, 230', accent: '233, 196, 126' };
let frameRequest: number | undefined;
let themeObserver: MutationObserver | undefined;

function readColors(): PatternColors {
  const style = getComputedStyle(document.documentElement);
  return {
    line: style.getPropertyValue('--pattern-rgb').trim() || colors.line,
    accent: style.getPropertyValue('--accent-rgb').trim() || colors.accent,
  };
}

function trackPointer(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return;
  pointerTarget.x = event.clientX;
  pointerTarget.y = event.clientY;
  pointerTarget.time = performance.now();
}

function loop(now: number): void {
  frameRequest = requestAnimationFrame(loop);
  const active = now - pointerTarget.time < POINTER_HOLD;
  pointer.x += (pointerTarget.x - pointer.x) * 0.07;
  pointer.y += (pointerTarget.y - pointer.y) * 0.07;
  pointer.strength += ((active ? 1 : 0) - pointer.strength) * 0.035;
  for (const stage of stages) stage.tick(now);
}

function register(stage: PatternStage): void {
  stages.add(stage);
  if (stages.size > 1) return;
  colors = readColors();
  pointer.x = pointerTarget.x = window.innerWidth * 0.7;
  pointer.y = pointerTarget.y = window.innerHeight * 0.4;
  window.addEventListener('pointermove', trackPointer, { passive: true });
  // Palette switches only change CSS variables; redraw every stage with the new colours.
  themeObserver = new MutationObserver(() => {
    colors = readColors();
    for (const registered of stages) registered.invalidate();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  frameRequest = requestAnimationFrame(loop);
}

function unregister(stage: PatternStage): void {
  stages.delete(stage);
  if (stages.size > 0) return;
  window.removeEventListener('pointermove', trackPointer);
  themeObserver?.disconnect();
  themeObserver = undefined;
  if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
  frameRequest = undefined;
}

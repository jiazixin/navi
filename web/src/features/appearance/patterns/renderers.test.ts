import { createRecordingContext, installPath2D } from '../../../test/canvas';
import { patternIDs, type AnimatedPatternID } from '../options';
import { createNoise } from './noise';
import { patternRenderers } from './renderers';

const colors = { line: '1, 2, 3', accent: '4, 5, 6' };
const animated = patternIDs.filter((id): id is AnimatedPatternID => id !== 'none');

beforeEach(() => {
  installPath2D();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('noise', () => {
  it('is deterministic per seed and stays within the simplex range', () => {
    const first = createNoise(7);
    const second = createNoise(7);
    const other = createNoise(8);
    const samples = Array.from({ length: 200 }, (_, index) => [index * 0.37, index * 0.11, index * 0.05] as const);
    for (const [x, y, z] of samples) {
      const value = first(x, y, z);
      expect(value).toBe(second(x, y, z));
      expect(Math.abs(value)).toBeLessThanOrEqual(1.1);
    }
    expect(samples.some(([x, y, z]) => first(x, y, z) !== other(x, y, z))).toBe(true);
  });
});

describe('pattern renderers', () => {
  it.each(animated)('%s draws visible strokes for still and animated frames', (id) => {
    const renderer = patternRenderers[id].create();
    const context = createRecordingContext();
    renderer.resize(480, 300);
    const draw = (time: number, still: boolean, strength: number): void =>
      renderer.frame(context as unknown as CanvasRenderingContext2D, time, { x: 240, y: 150, strength }, colors, {
        lineScale: 1,
        still,
      });

    draw(1000, true, 0);
    draw(2000, false, 1);
    draw(2033, false, 1);
    renderer.reset?.();
    draw(2066, false, 0);

    const drawn = [...context.stroke.mock.calls, ...context.fill.mock.calls].map(([path]) => path.commands.length);
    expect(drawn.some((count) => count > 0)).toBe(true);
    expect(context.strokeStyle).toMatch(/^rgba\((1, 2, 3|4, 5, 6), [\d.]+\)$/);
    expect(patternRenderers[id].fps).toBeGreaterThanOrEqual(30);
  });

  it('places focal patterns differently on narrow screens', () => {
    for (const id of ['guilloche', 'stars', 'ridge'] as const) {
      const renderer = patternRenderers[id].create();
      const context = createRecordingContext();
      renderer.resize(360, 720);
      renderer.frame(context as unknown as CanvasRenderingContext2D, 500, { x: 0, y: 0, strength: 0 }, colors, {
        lineScale: 2,
        still: false,
      });
      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 360, 720);
    }
  });
});

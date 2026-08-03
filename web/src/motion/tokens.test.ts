import { motionTokens } from './tokens';

describe('motion tokens', () => {
  it('keeps common interactions inside the documented duration ceiling', () => {
    expect(motionTokens.maximum).toBe(0.48);
    expect(motionTokens.emphasis).toBeLessThanOrEqual(motionTokens.maximum);
    expect(motionTokens.fast).toBeLessThan(motionTokens.standard);
    expect(motionTokens.ambient).toEqual({ fast: 18, standard: 36, slow: 72, orbit: 108 });
    expect(motionTokens.ambient.fast).toBeGreaterThan(motionTokens.maximum);
    expect(motionTokens.ambient.fast).toBeLessThan(motionTokens.ambient.standard);
    expect(motionTokens.ambient.standard).toBeLessThan(motionTokens.ambient.slow);
    expect(motionTokens.ambient.slow).toBeLessThan(motionTokens.ambient.orbit);
    expect(motionTokens.spring).toMatchObject({ stiffness: 420, damping: 36, mass: 0.8 });
  });
});

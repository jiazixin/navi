import {
  backgroundPatternIDs,
  catalogBackgroundPatternSchema,
  DEFAULT_BACKGROUND_PATTERN,
} from './backgroundPattern';

describe('background pattern schema', () => {
  it('accepts every documented pattern', () => {
    for (const pattern of backgroundPatternIDs) {
      expect(catalogBackgroundPatternSchema.parse(pattern)).toBe(pattern);
    }
  });

  it('rejects unknown values and exposes the documented default', () => {
    expect(catalogBackgroundPatternSchema.safeParse('random-lines').success).toBe(false);
    expect(DEFAULT_BACKGROUND_PATTERN).toBe('meridian-grid');
  });
});

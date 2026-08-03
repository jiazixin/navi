export const motionTokens = {
  instant: 0.08,
  fast: 0.14,
  standard: 0.22,
  emphasis: 0.36,
  maximum: 0.48,
  favicon: 0.18,
  stagger: 0.028,
  ambient: {
    fast: 18,
    standard: 36,
    slow: 72,
    orbit: 108,
  },
  spring: {
    type: 'spring',
    stiffness: 420,
    damping: 36,
    mass: 0.8,
  },
} as const;

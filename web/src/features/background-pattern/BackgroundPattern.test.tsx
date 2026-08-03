import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackgroundPattern } from './BackgroundPattern';
import { BackgroundPatternArtwork } from './BackgroundPatternArtwork';
import { backgroundPatternOptions } from './backgroundPatternOptions';

describe('BackgroundPattern', () => {
  it('renders every visible pattern deterministically outside the accessibility tree', () => {
    for (const option of backgroundPatternOptions) {
      const first = renderToStaticMarkup(<BackgroundPatternArtwork pattern={option.id} />);
      const second = renderToStaticMarkup(<BackgroundPatternArtwork pattern={option.id} />);
      expect(first).toBe(second);
      expect(first).toContain('aria-hidden="true"');
    }
  });

  it('keeps the layer present while none removes visible SVG geometry', () => {
    const { container, rerender } = render(<BackgroundPattern pattern="orbital-rings" />);
    expect(container.querySelector('[data-background-pattern-layer]')).toHaveAttribute(
      'data-pattern',
      'orbital-rings',
    );
    expect(container.querySelector('svg')).not.toBeNull();

    rerender(<BackgroundPattern pattern="none" />);
    expect(container.querySelector('[data-background-pattern-layer]')).toHaveAttribute(
      'data-pattern',
      'none',
    );
  });

  it('assigns each visible pattern its own deterministic semantic motion layers', () => {
    const expectedMotionLayers = {
      'meridian-grid': ['meridian-field', 'meridian-axis', 'meridian-probe'],
      'orbital-rings': [
        'orbital-primary-plane',
        'orbital-secondary-plane',
        'orbital-outer-body',
        'orbital-polar-body',
        'orbital-inner-body',
        'orbital-reverse-body',
      ],
      pisces: [
        'pisces-left-fish',
        'pisces-left-tail',
        'pisces-right-fish',
        'pisces-right-tail',
        'pisces-constellation',
      ],
      sagittarius: ['sagittarius-bow', 'sagittarius-arrow', 'sagittarius-stars'],
      'roman-meander': ['roman-meander-flow'],
      'rose-window': ['rose-petals', 'rose-spokes', 'rose-nodes'],
      'eight-point-star': ['eight-point-flow'],
      'star-trails': [
        'star-trails-field',
        'star-trails-slow',
        'star-trails-medium',
        'star-trails-fast',
        'star-trails-stars',
      ],
    } as const;

    for (const [pattern, expectedLayers] of Object.entries(expectedMotionLayers)) {
      const { container, unmount } = render(
        <BackgroundPatternArtwork pattern={pattern as keyof typeof expectedMotionLayers} />,
      );
      const actualLayers = [...container.querySelectorAll('[data-pattern-motion]')].map((layer) =>
        layer.getAttribute('data-pattern-motion'),
      );
      expect(actualLayers).toEqual(expectedLayers);
      unmount();
    }

    const { container } = render(<BackgroundPatternArtwork pattern="none" />);
    expect(container.querySelectorAll('[data-pattern-motion]')).toHaveLength(0);
  });

  it('anchors star trails to the lower-left viewBox edge', () => {
    const { container } = render(<BackgroundPatternArtwork pattern="star-trails" />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'preserveAspectRatio',
      'xMinYMax slice',
    );
    expect(container.querySelector('[data-star-trails-origin]')).toHaveAttribute(
      'data-star-trails-origin',
      '90 950',
    );
  });
});

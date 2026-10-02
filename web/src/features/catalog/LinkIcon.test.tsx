import { fireEvent, render } from '@testing-library/react';
import { LinkCard } from './LinkCard';

it('retries a failed icon when a favicon event changes its URL', () => {
  const link = { runtimeId: 'one', name: 'One', publicUrl: 'https://example.com/', tags: [] };
  const { container, rerender } = render(<LinkCard link={link} iconURL="/api/icons/one?v=0" />);
  const first = container.querySelector('img');
  expect(first).not.toBeNull();
  if (first === null) throw new Error('Missing initial icon');
  fireEvent.error(first);
  expect(container.querySelector('img')).toBeNull();
  rerender(<LinkCard link={link} iconURL="/api/icons/one?v=1" />);
  const updated = container.querySelector('img');
  expect(updated).toHaveAttribute('src', '/api/icons/one?v=1');
  if (updated === null) throw new Error('Missing updated icon');
  fireEvent.load(updated);
  expect(updated.parentElement).toHaveAttribute('data-state', 'loaded');
});

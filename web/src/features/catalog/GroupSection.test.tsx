import { render, screen, waitFor } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import { infrastructureGroup } from '../../../tests/fixtures/catalog';
import { GroupSection } from './GroupSection';
import { LinkIcon } from './LinkIcon';

vi.mock('motion/react', async (importOriginal) => {
  const original = await importOriginal<typeof MotionReact>();
  return { ...original, useReducedMotion: () => false };
});

vi.mock('./LinkIcon', async (importOriginal) => {
  const original = await importOriginal<{ LinkIcon: typeof LinkIcon }>();
  return { ...original, LinkIcon: vi.fn(original.LinkIcon) };
});

it('finishes the group entrance animation when motion is enabled', async () => {
  render(<GroupSection group={infrastructureGroup} />);
  const group = screen.getByRole('region', { name: '基础设施' });
  await waitFor(() => expect(group).toHaveStyle({ opacity: '1', transform: 'none' }));
});

it('updates only the affected card when one favicon arrives in a large group', () => {
  const source = infrastructureGroup.links[0];
  if (source === undefined) throw new Error('Missing infrastructure fixture');
  const group = {
    ...infrastructureGroup,
    links: Array.from({ length: 100 }, (_, index) => ({ ...source, runtimeId: `link-${index}` })),
  };
  const { rerender } = render(<GroupSection group={group} enableLayoutMotion={false} />);
  vi.mocked(LinkIcon).mockClear();
  rerender(<GroupSection group={group} enableLayoutMotion={false} faviconVersions={{ 'link-1': 1 }} />);
  expect(LinkIcon).toHaveBeenCalledTimes(1);
  expect(vi.mocked(LinkIcon).mock.calls[0]?.[0].runtimeId).toBe('link-1');
});

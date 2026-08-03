import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { catalogFixture } from '../../test/fixtures';
import { SearchOverlay } from './SearchOverlay';

function SearchOverlayDemo(): React.JSX.Element {
  const [query, setQuery] = useState('');
  return (
    <SearchOverlay
      catalog={catalogFixture}
      onChange={setQuery}
      onClose={() => undefined}
      query={query}
    />
  );
}

const meta = {
  title: 'Search/SearchOverlay',
  component: SearchOverlay,
  args: {
    catalog: catalogFixture,
    query: '',
    onChange: () => undefined,
    onClose: () => undefined,
  },
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
} satisfies Meta<typeof SearchOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <SearchOverlayDemo />,
};

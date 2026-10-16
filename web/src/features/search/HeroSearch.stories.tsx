import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { mockCatalog } from '../../../tests/fixtures/mockCatalog';
import { HeroSearch } from './HeroSearch';
import { buildSearchIndex } from './linkSearch';

const meta = {
  title: 'Search/HeroSearch',
  component: HeroSearch,
  args: {
    index: buildSearchIndex(mockCatalog.pages),
    providerID: 'baidu',
    onProviderChange: fn(),
    faviconVersions: {},
    inputRef: createRef<HTMLInputElement>(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 700, padding: 32 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

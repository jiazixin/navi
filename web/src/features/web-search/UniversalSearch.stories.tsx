import type { Meta, StoryObj } from '@storybook/react-vite';
import { UniversalSearch } from './UniversalSearch';

const meta = {
  title: 'Search/UniversalSearch',
  component: UniversalSearch,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof UniversalSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const GitHubConfigured: Story = {
  args: {
    configuredProviderID: 'github',
  },
};

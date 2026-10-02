import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtureIcon, grafanaLink, longLink } from '../../../tests/fixtures/catalog';
import { LinkCard } from './LinkCard';

const meta = {
  title: 'Catalog/LinkCard',
  component: LinkCard,
  args: {
    link: grafanaLink,
    iconURL: fixtureIcon,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongContent: Story = {
  args: { link: longLink },
};

export const HostnameFallback: Story = {
  args: {
    link: {
      runtimeId: 'github-hostname',
      name: 'GitHub',
      publicUrl: 'https://github.com',
      tags: ['code'],
    },
  },
};

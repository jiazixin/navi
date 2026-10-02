import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtureIcon } from '../../../tests/fixtures/catalog';
import { LinkIcon } from './LinkIcon';

const meta = {
  title: 'Catalog/LinkIcon',
  component: LinkIcon,
  args: {
    name: 'Grafana',
    runtimeId: 'grafana',
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LinkIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Monogram: Story = {
  args: { iconURL: 'data:image/png;base64,invalid' },
};

export const Cached: Story = {
  args: { iconURL: fixtureIcon },
};

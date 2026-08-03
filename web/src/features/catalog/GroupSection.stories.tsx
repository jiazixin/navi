import type { Meta, StoryObj } from '@storybook/react-vite';
import { infrastructureGroup, longLink } from '../../test/fixtures';
import { GroupSection } from './GroupSection';

const meta = {
  title: 'Catalog/GroupSection',
  component: GroupSection,
  args: {
    group: infrastructureGroup,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(1120px, calc(100vw - 32px))' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dense: Story = {
  args: {
    group: {
      name: '基础设施ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      links: Array.from({ length: 20 }, (_, index) => ({
        ...longLink,
        runtimeId: `long-link-${index}`,
      })),
    },
  },
};

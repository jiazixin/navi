import type { Meta, StoryObj } from '@storybook/react-vite';
import { primaryPageFixture } from '../../test/fixtures';
import { CatalogView } from './CatalogView';

const meta = {
  title: 'Catalog/CatalogView',
  component: CatalogView,
  args: {
    page: primaryPageFixture,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(1120px, calc(100vw - 32px))' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatalogView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoResults: Story = {
  args: {
    page: { ...primaryPageFixture, groups: [] },
    searching: true,
  },
};

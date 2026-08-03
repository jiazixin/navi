import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingCatalog } from './LoadingCatalog';

const meta = {
  title: 'Catalog/LoadingCatalog',
  component: LoadingCatalog,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ padding: 32 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoadingCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

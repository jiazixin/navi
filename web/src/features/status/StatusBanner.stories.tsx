import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBanner } from './StatusBanner';

const meta = {
  title: 'Status/StatusBanner',
  component: StatusBanner,
  args: {
    kind: 'degraded',
    message: '目录刷新失败，当前仍显示最近一次有效内容。',
    onDismiss: () => undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(960px, calc(100vw - 32px))' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Degraded: Story = {};

export const Offline: Story = {
  args: {
    kind: 'offline',
    message: '实时更新暂时中断，正在后台重新连接。',
  },
};

export const Restored: Story = {
  args: {
    kind: 'restored',
    message: '目录已恢复为最新有效内容。',
  },
};

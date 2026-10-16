import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatePanel } from './StatePanel';

const meta = {
  title: 'Components/StatePanel',
  component: StatePanel,
  args: {
    eyebrow: 'UNAVAILABLE',
    title: '目录暂时无法加载',
    description: '服务暂时没有返回导航目录，请检查连接后重试。',
    children: (
      <>
        <button type="button">重新加载</button>
        <a href="/">返回导航</a>
      </>
    ),
  },
} satisfies Meta<typeof StatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Failure: Story = {};

export const Empty: Story = {
  args: { eyebrow: 'EMPTY', title: '目录还是空的', description: '在 urls.yaml 中添加链接后，这里会自动更新。', children: undefined },
};

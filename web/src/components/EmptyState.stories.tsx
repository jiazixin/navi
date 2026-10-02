import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState, FailurePage } from './EmptyState';

const meta = {
  title: 'Shared/EmptyState',
  component: EmptyState,
  args: {
    title: '没有匹配的链接',
    description: '换一个关键词，或清空搜索后查看全部链接。',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchEmpty: Story = {};

export const EmptyCatalog: Story = {
  args: {
    title: '目录还是空的',
    description: '在 urls.yaml 中添加链接后，这里会自动更新。',
  },
};

export const Failure = {
  render: () => <FailurePage onRetry={() => undefined} />,
};

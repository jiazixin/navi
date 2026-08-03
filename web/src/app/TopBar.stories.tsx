import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TopBar } from './TopBar';

function TopBarDemo(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <TopBar
      backgroundPatternPreference="meridian-grid"
      connection={{ kind: 'live' }}
      isRefreshing={false}
      onMoveToResults={() => undefined}
      onOpenFirstResult={() => undefined}
      onOpenSearch={() => undefined}
      onBackgroundPatternChange={() => undefined}
      onQueryChange={setQuery}
      onRefresh={() => undefined}
      onSearchEscape={() => setQuery('')}
      onThemeChange={() => undefined}
      query={query}
      searchInputRef={inputRef}
      subtitle="工作、服务与常用资源"
      themePreference="default"
      title="我的导航"
    />
  );
}

const meta = {
  title: 'App/TopBar',
  component: TopBar,
  args: {
    title: '我的导航',
    subtitle: '工作、服务与常用资源',
    query: '',
    connection: { kind: 'live' },
    isRefreshing: false,
    backgroundPatternPreference: 'meridian-grid',
    themePreference: 'default',
    searchInputRef: { current: null },
    onQueryChange: () => undefined,
    onSearchEscape: () => undefined,
    onMoveToResults: () => undefined,
    onOpenFirstResult: () => undefined,
    onOpenSearch: () => undefined,
    onBackgroundPatternChange: () => undefined,
    onRefresh: () => undefined,
    onThemeChange: () => undefined,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <TopBarDemo />,
};

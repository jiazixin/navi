import { fireEvent, render, screen } from '@testing-library/react';
import { StatusBanner } from './StatusBanner';

describe('StatusBanner', () => {
  it('announces degraded state and provides a reachable dismiss action', () => {
    const onDismiss = vi.fn();
    render(
      <StatusBanner
        kind="degraded"
        message="目录刷新失败，当前仍显示最近一次有效内容。"
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭状态提示' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it.each([
    ['offline', '实时更新暂时中断，正在后台重新连接。', 'alert'],
    ['restored', '目录已恢复为最新有效内容。', 'status'],
  ] as const)('renders the %s semantic state', (kind, message, role) => {
    render(<StatusBanner kind={kind} message={message} onDismiss={() => undefined} />);
    expect(screen.getByRole(role)).toHaveTextContent(message);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceProvider } from '../appearance/AppearanceProvider';
import { StatusBanner } from '../status/StatusBanner';
import { NavigationFailure } from './NavigationFailure';

describe('NavigationFailure', () => {
  it('offers retry and return links with the configured palette', () => {
    render(
      <AppearanceProvider configuredPattern="ridge" configuredTheme="dusk">
        <NavigationFailure message="部署测试 当前无法访问" retryPath="/go/deploy?retry=1" />
      </AppearanceProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: '部署测试 当前无法访问' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '重试访问' })).toHaveAttribute('href', '/go/deploy?retry=1');
    expect(screen.getByRole('link', { name: '返回导航' })).toHaveAttribute('href', '/');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dusk');
    expect(document.title).toBe('部署测试 当前无法访问 · Navi');
  });
});

describe('StatusBanner', () => {
  it('announces degraded and offline states and can be dismissed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<StatusBanner kind="degraded" message="服务处于降级状态" onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toHaveTextContent('DEGRADED服务处于降级状态');
    rerender(<StatusBanner kind="offline" message="实时更新暂时中断" onDismiss={onDismiss} />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-kind', 'offline');
    await user.click(screen.getByRole('button', { name: '关闭提示' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

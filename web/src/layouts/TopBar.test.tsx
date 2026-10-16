import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockBrowserLocation } from '../test/browserLocation';
import { AuthRequiredContext } from '../features/auth/AuthContext';
import type { ConnectionState } from '../features/status/useCatalogEvents';
import { TopBar } from './TopBar';

const pages = [
  { id: 'one', title: '我的导航' },
  { id: 'two', title: '灵感收藏' },
];

function renderTopBar(overrides: { connection?: ConnectionState; isRefreshing?: boolean; authRequired?: boolean } = {}) {
  const handlers = { onSelectPage: vi.fn(), onRefresh: vi.fn(), onOpenSearch: vi.fn(), onToggleAppearance: vi.fn() };
  render(
    <AuthRequiredContext value={overrides.authRequired ?? true}>
      <TopBar
        appearanceButtonRef={createRef()}
        appearanceOpen={false}
        appearancePanelID="appearance"
        connection={overrides.connection ?? { kind: 'live' }}
        currentIndex={0}
        isRefreshing={overrides.isRefreshing ?? false}
        pages={pages}
        scrolled
        searchButtonRef={createRef()}
        {...handlers}
      />
    </AuthRequiredContext>,
  );
  return handlers;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TopBar', () => {
  it('switches pages and opens search and appearance', async () => {
    const user = userEvent.setup();
    const handlers = renderTopBar();
    expect(screen.getByRole('button', { name: '我的导航' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: '灵感收藏' }));
    expect(handlers.onSelectPage).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: '搜索链接' }));
    expect(handlers.onOpenSearch).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '外观：纹样与色调' }));
    expect(handlers.onToggleAppearance).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '实时更新已连接，点击刷新' }));
    expect(handlers.onRefresh).toHaveBeenCalledOnce();
  });

  it.each([
    [{ kind: 'connecting' } as const, false, '正在连接实时更新，点击刷新'],
    [{ kind: 'reconnecting', attempt: 3 } as const, false, '实时更新正在重连，第 3 次，点击刷新'],
    [{ kind: 'live' } as const, true, '正在刷新目录'],
  ])('labels the refresh control for %o', (connection, isRefreshing, label) => {
    renderTopBar({ connection, isRefreshing });
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('logs out only when authentication is required', async () => {
    const user = userEvent.setup();
    const location = mockBrowserLocation('/');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    renderTopBar();
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(location.replace).toHaveBeenCalledWith('/login');
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(alert).toHaveBeenCalledWith('退出失败，请检查网络后重试。');
  });

  it('hides logout without authentication', () => {
    renderTopBar({ authRequired: false });
    expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { mockBrowserLocation } from '../test/browserLocation';
import { AuthRequiredContext } from '../features/auth/AuthContext';
import { TopBar } from './TopBar';

const props: ComponentProps<typeof TopBar> = {
  title: '我的导航',
  subtitle: '工作与服务',
  query: '',
  connection: { kind: 'live' },
  isRefreshing: false,
  backgroundPatternPreference: 'none',
  themePreference: 'default',
  searchInputRef: { current: null },
  onQueryChange: vi.fn(),
  onSearchEscape: vi.fn(),
  onMoveToResults: vi.fn(),
  onOpenFirstResult: vi.fn(),
  onOpenSearch: vi.fn(),
  onRefresh: vi.fn(),
  onBackgroundPatternChange: vi.fn(),
  onThemeChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TopBar', () => {
  it('returns to login only after the server accepts logout', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })));
    const location = mockBrowserLocation();
    render(<TopBar {...props} />);
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(location.replace).toHaveBeenCalledWith('/login');
  });

  it('hides logout when authentication is disabled and invokes search and refresh commands', async () => {
    const user = userEvent.setup();
    render(<AuthRequiredContext value={false}><TopBar {...props} subtitle={undefined} /></AuthRequiredContext>);
    expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument();
    expect(screen.queryByText('工作与服务')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开搜索' }));
    await user.click(screen.getByRole('button', { name: '实时更新已连接，点击刷新' }));
    expect(props.onOpenSearch).toHaveBeenCalledOnce();
    expect(props.onRefresh).toHaveBeenCalledOnce();
  });

  it.each([
    { connection: { kind: 'connecting' } as const, isRefreshing: false, label: '正在连接实时更新，点击刷新' },
    { connection: { kind: 'reconnecting', attempt: 3 } as const, isRefreshing: false, label: '实时更新正在重连，第 3 次，点击刷新' },
    { connection: { kind: 'live' } as const, isRefreshing: true, label: '正在刷新目录' },
  ])('labels the refresh command as $label', ({ connection, isRefreshing, label }) => {
    render(<TopBar {...props} connection={connection} isRefreshing={isRefreshing} />);
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.getByText('工作与服务')).toBeInTheDocument();
  });

  it.each(['http', 'network'])('shows a retryable failure when logout fails through %s', async (failure) => {
    const user = userEvent.setup();
    const request = vi.fn<typeof fetch>();
    if (failure === 'http') request.mockResolvedValue(new Response(null, { status: 503 }));
    else request.mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', request);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<TopBar {...props} />);
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(request).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST', headers: { 'X-Navi-Request': '1' },
    });
    expect(alert).toHaveBeenCalledWith('退出失败，请检查网络后重试。');
    expect(screen.getByRole('button', { name: '退出登录' })).toBeEnabled();
  });
});

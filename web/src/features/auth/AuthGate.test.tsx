import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContext } from 'react';
import { getSession } from '../../app/api/auth';
import type { CatalogTheme } from '../../app/api/theme';
import { mockBrowserLocation } from '../../test/browserLocation';
import { AuthGate } from './AuthGate';
import { AuthRequiredContext } from './AuthContext';

vi.mock('../../app/api/auth', () => ({ getSession: vi.fn() }));

function CatalogContent(): React.JSX.Element {
  const authRequired = useContext(AuthRequiredContext);
  return <div>目录内容{authRequired ? <button type="button">退出登录</button> : null}</div>;
}

function renderGate(configuredTheme: CatalogTheme = 'default') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <AuthGate configuredTheme={configuredTheme}><CatalogContent /></AuthGate>
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('AuthGate', () => {
  it('keeps the login screen synchronized with the default system theme', async () => {
    window.history.replaceState(null, '', '/login');
    document.documentElement.dataset.theme = 'light';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const subscribe = vi.spyOn(media, 'addEventListener');
    const originalMatchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => (
      query === media.media ? media : originalMatchMedia(query)
    ));
    vi.mocked(getSession).mockResolvedValue({ authenticated: false, authRequired: true });
    renderGate();
    expect(await screen.findByLabelText('账号')).toBeInTheDocument();
    const listener = subscribe.mock.calls[0]?.[1];
    const change = Object.assign(new Event('change'), { matches: true, media: media.media });
    act(() => {
      if (typeof listener === 'function') listener.call(media, change);
      else listener?.handleEvent(change);
    });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('uses the configured theme on the login screen', async () => {
    window.history.replaceState(null, '', '/login');
    vi.mocked(getSession).mockResolvedValue({ authenticated: false, authRequired: true });
    renderGate('navy-blossom');
    expect(await screen.findByLabelText('账号')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'navy-blossom');
  });

  it.each([
    { pathname: '/', authenticated: false, destination: '/login' },
    { pathname: '/login', authenticated: true, destination: '/' },
  ])('redirects $pathname to $destination for the resolved session', async ({ pathname, authenticated, destination }) => {
    const location = mockBrowserLocation(pathname);
    vi.mocked(getSession).mockResolvedValue({ authenticated, authRequired: true });
    renderGate();
    await waitFor(() => expect(location.replace).toHaveBeenCalledWith(destination));
  });

  it('revalidates a page restored from the back-forward cache', async () => {
    const location = mockBrowserLocation();
    vi.mocked(getSession).mockResolvedValue({ authenticated: true, authRequired: true });
    const { unmount } = renderGate();
    expect(await screen.findByText('目录内容')).toBeInTheDocument();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(location.reload).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(location.reload).toHaveBeenCalledOnce();
    unmount();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(location.reload).toHaveBeenCalledOnce();
  });

  it('keeps both the login form and catalog unmounted while checking authentication', () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => undefined));
    renderGate();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
    expect(screen.queryByLabelText('账号')).not.toBeInTheDocument();
    expect(screen.queryByText('目录内容')).not.toBeInTheDocument();
  });

  it.each([false, true])('passes authRequired=%s to authenticated content', async (authRequired) => {
    vi.mocked(getSession).mockResolvedValue({ authenticated: true, authRequired });
    renderGate();
    expect(await screen.findByText('目录内容')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退出登录' }) !== null).toBe(authRequired);
    expect(screen.queryByLabelText('账号')).not.toBeInTheDocument();
  });

  it('shows login only after the service confirms authentication is required', async () => {
    window.history.replaceState(null, '', '/login');
    vi.mocked(getSession).mockResolvedValue({ authenticated: false, authRequired: true });
    renderGate();
    expect(await screen.findByLabelText('账号')).toBeInTheDocument();
    expect(screen.queryByText('目录内容')).not.toBeInTheDocument();
  });

  it('offers a connection retry without exposing login or catalog on a failed check', async () => {
    const user = userEvent.setup();
    vi.mocked(getSession).mockRejectedValueOnce(new Error('offline'));
    renderGate();
    const retry = await screen.findByRole('button', { name: '重新连接' });
    expect(screen.queryByLabelText('账号')).not.toBeInTheDocument();
    expect(screen.queryByText('目录内容')).not.toBeInTheDocument();
    vi.mocked(getSession).mockResolvedValue({ authenticated: true, authRequired: true });
    await user.click(retry);
    expect(await screen.findByText('目录内容')).toBeInTheDocument();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('unmounts protected content when a later session check detects expiry', async () => {
    vi.mocked(getSession).mockResolvedValue({ authenticated: true, authRequired: true });
    const { queryClient } = renderGate();
    expect(await screen.findByText('目录内容')).toBeInTheDocument();
    window.history.replaceState(null, '', '/login');
    vi.mocked(getSession).mockResolvedValue({ authenticated: false, authRequired: true });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['session'] }); });
    await waitFor(() => expect(screen.queryByText('目录内容')).not.toBeInTheDocument());
    expect(await screen.findByLabelText('账号')).toBeInTheDocument();
  });
});

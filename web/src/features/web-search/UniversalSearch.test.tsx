import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pointerExpansionHoldDuration, UniversalSearch } from './UniversalSearch';

describe('UniversalSearch', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    open.mockClear();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('holds a pointer-triggered expansion until its eight-second timer completes', () => {
    const timeout = vi.spyOn(window, 'setTimeout');
    render(<UniversalSearch />);
    const cluster = screen.getByTestId('external-search-cluster');

    expect(cluster).toHaveAttribute('data-expanded', 'false');
    fireEvent.pointerEnter(cluster, { pointerType: 'mouse' });
    fireEvent.pointerLeave(cluster, { pointerType: 'mouse' });
    expect(cluster).toHaveAttribute('data-expanded', 'true');

    const timerIndex = timeout.mock.calls.findIndex(
      ([, delay]) => delay === pointerExpansionHoldDuration,
    );
    const timerCallback = timeout.mock.calls[timerIndex]?.[0] as (() => void) | undefined;
    const timerID = timeout.mock.results[timerIndex]?.value as number | undefined;
    expect(timerCallback).toBeDefined();
    expect(timerID).toBeDefined();

    window.clearTimeout(timerID);
    act(() => timerCallback?.());
    expect(cluster).toHaveAttribute('data-expanded', 'false');
    timeout.mockRestore();
  });

  it('restarts the eight-second timer when the pointer visits again', () => {
    const timeout = vi.spyOn(window, 'setTimeout');
    const clearTimeout = vi.spyOn(window, 'clearTimeout');
    render(<UniversalSearch />);
    const cluster = screen.getByTestId('external-search-cluster');

    fireEvent.pointerEnter(cluster, { pointerType: 'mouse' });
    fireEvent.pointerLeave(cluster, { pointerType: 'mouse' });
    fireEvent.pointerEnter(cluster, { pointerType: 'mouse' });

    const timerCalls = timeout.mock.calls
      .map(([, delay], index) => ({ delay, index }))
      .filter(({ delay }) => delay === pointerExpansionHoldDuration);
    const firstTimerID = timeout.mock.results[timerCalls[0]?.index ?? -1]?.value as
      | number
      | undefined;
    const secondTimerIndex = timerCalls[1]?.index ?? -1;
    const secondTimerID = timeout.mock.results[secondTimerIndex]?.value as number | undefined;
    const secondTimerCallback = timeout.mock.calls[secondTimerIndex]?.[0] as
      | (() => void)
      | undefined;

    expect(timerCalls).toHaveLength(2);
    expect(clearTimeout).toHaveBeenCalledWith(firstTimerID);
    expect(cluster).toHaveAttribute('data-expanded', 'true');

    window.clearTimeout(secondTimerID);
    act(() => secondTimerCallback?.());
    expect(cluster).toHaveAttribute('data-expanded', 'false');
    clearTimeout.mockRestore();
    timeout.mockRestore();
  });

  async function openProviderMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole('button', { name: /搜索入口：/ }));
    expect(screen.getByRole('menu', { name: '选择搜索入口' })).toBeInTheDocument();
  }

  it('scopes the current provider brand token to the provider SVG', () => {
    const { container } = render(<UniversalSearch />);
    const providerIcon = screen
      .getByTestId('current-provider-icon')
      .querySelector<SVGElement>('[data-provider-icon="baidu"]');

    expect(providerIcon).not.toBeNull();
    expect(providerIcon?.style.getPropertyValue('--provider-brand')).toBe('#2932E1');
    expect(providerIcon?.querySelector('path')).toHaveAttribute('fill', 'currentColor');
    expect(container.querySelectorAll('[data-provider-icon="baidu"]')).toHaveLength(1);
  });

  it('renders Google and Gemini with stable multicolor brand marks', async () => {
    const user = userEvent.setup();
    const { container } = render(<UniversalSearch configuredProviderID="google" />);
    const providerTrigger = screen.getByTestId('current-provider-icon');
    const google = providerTrigger.querySelector('[data-provider-icon="google"]');

    expect(providerTrigger.querySelectorAll('svg')).toHaveLength(1);
    expect(
      Array.from(google?.querySelectorAll('path') ?? [], (path) => path.getAttribute('fill')),
    ).toEqual(['#4285F4', '#34A853', '#FBBC05', '#EA4335']);

    await openProviderMenu(user);
    await user.click(screen.getByRole('menuitemradio', { name: 'Gemini' }));
    await openProviderMenu(user);

    const geminiIcons = container.querySelectorAll('[data-provider-icon="gemini"]');
    const definitionIDs = Array.from(
      container.querySelectorAll('[data-provider-icon="gemini"] [id]'),
      (definition) => definition.id,
    );

    expect(geminiIcons).toHaveLength(2);
    expect(new Set(definitionIDs).size).toBe(8);
    for (const icon of geminiIcons) {
      const clipPathID = icon.querySelector('clipPath')?.id;
      const gradients = Array.from(icon.querySelectorAll('radialGradient'));
      const gradientIDs = gradients.map((gradient) => gradient.id);

      expect(clipPathID).toBeTruthy();
      expect(gradients).toHaveLength(3);
      expect(icon.querySelector('g')).toHaveAttribute('clip-path', `url(#${clipPathID})`);
      expect(icon.querySelector('rect')).toHaveAttribute('fill', '#3186FF');
      expect(
        gradients.map((gradient) => gradient.querySelector('stop')?.getAttribute('stop-color')),
      ).toEqual(['#FC413D', '#FBBC04', '#00B95C']);
      expect(
        Array.from(icon.querySelectorAll('circle'), (circle) => circle.getAttribute('fill')),
      ).toEqual(gradientIDs.map((gradientID) => `url(#${gradientID})`));
    }
    expect(providerTrigger.querySelectorAll('svg')).toHaveLength(1);
  });

  it('submits the configured default provider with Enter and ignores empty queries', async () => {
    const user = userEvent.setup();
    render(<UniversalSearch configuredProviderID="github" />);
    const input = screen.getByRole('searchbox', { name: '搜索互联网或询问模型' });

    expect(screen.getByRole('button', { name: '搜索入口：GitHub' })).toBeInTheDocument();
    await user.type(input, '{Enter}');
    expect(open).not.toHaveBeenCalled();

    await user.type(input, '视觉 设计{Enter}');
    const target = new URL(open.mock.calls[0]?.[0] ?? '');
    expect(target.hostname).toBe('github.com');
    expect(target.searchParams.get('q')).toBe('视觉 设计');
  });

  it('opens the grouped provider menu and launches Bing international search', async () => {
    const user = userEvent.setup();
    render(<UniversalSearch />);

    await openProviderMenu(user);
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(8);
    expect(screen.getByRole('group', { name: '网页' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '模型' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: 'Bing 国际版' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索互联网或询问模型' }), 'design');
    await user.click(screen.getByRole('button', { name: '使用 Bing 国际版 搜索' }));

    const target = new URL(open.mock.calls[0]?.[0] ?? '');
    expect(target.hostname).toBe('www.bing.com');
    expect(target.searchParams.get('mkt')).toBe('en-US');
  });

  it('keeps only the current icon while closed and shows every mark in the menu', async () => {
    const user = userEvent.setup();
    const { container } = render(<UniversalSearch />);

    await waitFor(() =>
      expect(container.querySelectorAll('[data-provider-icon]')).toHaveLength(1),
    );
    expect(
      screen.getByTestId('current-provider-icon').querySelector('[data-provider-icon="baidu"]'),
    ).not.toBeNull();

    await openProviderMenu(user);
    expect(container.querySelectorAll('[data-provider-icon]')).toHaveLength(9);
    await user.click(screen.getByRole('menuitemradio', { name: 'Bing 国际版' }));

    await waitFor(() =>
      expect(container.querySelectorAll('[data-provider-icon]')).toHaveLength(1),
    );
    expect(
      screen.getByTestId('current-provider-icon').querySelector('[data-provider-icon="bing"]'),
    ).not.toBeNull();
  });

  it('follows later configured defaults until the user selects manually', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<UniversalSearch configuredProviderID="baidu" />);

    rerender(<UniversalSearch configuredProviderID="github" />);
    expect(screen.getByRole('button', { name: '搜索入口：GitHub' })).toBeInTheDocument();

    await openProviderMenu(user);
    await user.click(screen.getByRole('menuitemradio', { name: 'Google' }));
    rerender(<UniversalSearch configuredProviderID="claude" />);

    expect(screen.getByRole('button', { name: '搜索入口：Google' })).toBeInTheDocument();
  });

  it('supports menu keyboard navigation, Escape, Tab, and outside dismissal', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <UniversalSearch />
        <button type="button">外部目标</button>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: '搜索入口：百度' });

    trigger.focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: '百度' })).toHaveFocus();
    await user.keyboard('{End}{Enter}');
    expect(screen.getByRole('button', { name: '搜索入口：Gemini' })).toBeInTheDocument();

    await openProviderMenu(user);
    await user.keyboard('{Escape}');
    const geminiTrigger = screen.getByRole('button', { name: '搜索入口：Gemini' });
    expect(geminiTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(geminiTrigger).toHaveFocus();
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: '选择搜索入口' })).not.toBeInTheDocument(),
    );

    await openProviderMenu(user);
    await user.keyboard('{Tab}');
    expect(geminiTrigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: '选择搜索入口' })).not.toBeInTheDocument(),
    );

    await openProviderMenu(user);
    await user.click(screen.getByRole('button', { name: '外部目标' }));
    expect(geminiTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('copies the query when a model has no stable web query URL', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<UniversalSearch />);

    await openProviderMenu(user);
    await user.click(screen.getByRole('menuitemradio', { name: 'Claude' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索互联网或询问模型' }), '解释这段代码');
    await user.click(screen.getByRole('button', { name: '使用 Claude 搜索' }));

    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener,noreferrer');
    expect(await screen.findByText('问题已复制，请在 Claude 中粘贴发送。')).toBeVisible();
    expect(writeText).toHaveBeenCalledWith('解释这段代码');
  });
});

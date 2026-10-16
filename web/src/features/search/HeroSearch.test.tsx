import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { catalogFixture } from '../../../tests/fixtures/catalog';
import type { WebSearchProviderID } from '../../app/api/webSearch';
import { CommandPalette } from './CommandPalette';
import { HeroSearch } from './HeroSearch';
import { present } from '../../test/present';
import { buildSearchIndex } from './linkSearch';

const index = buildSearchIndex(catalogFixture.pages);

function Harness(): React.JSX.Element {
  const [providerID, setProviderID] = useState<WebSearchProviderID>('baidu');
  return (
    <>
      <HeroSearch
        faviconVersions={{ github: 2 }}
        index={index}
        inputRef={createRef<HTMLInputElement>()}
        onProviderChange={setProviderID}
        providerID={providerID}
      />
      <button type="button">外部</button>
    </>
  );
}

let openWindow: { mock: { calls: unknown[][] } };

beforeEach(() => {
  openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HeroSearch', () => {
  it('lists matching links across pages followed by a web search row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '搜索网页或筛选链接' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.type(input, 'git');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('href', '/go/github');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveTextContent('灵感收藏 · 收藏');
    expect(options[2]).toHaveTextContent('在 百度 中搜索「git」');
    expect(screen.getByText('站内链接 · 2')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  it('moves the selection with arrow keys and opens the selected link', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '搜索网页或筛选链接' });
    await user.type(input, 'git');
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    const click = vi.fn((event: MouseEvent) => event.preventDefault());
    options[1]?.addEventListener('click', click);
    await user.keyboard('{Enter}');
    expect(click).toHaveBeenCalledOnce();
    fireEvent.pointerMove(present(options[0], 'option'));
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('switches provider and submits web searches from the last row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'GitHub' }));
    expect(screen.getByRole('button', { name: 'GitHub' })).toHaveAttribute('aria-pressed', 'true');
    const input = screen.getByRole('combobox', { name: '搜索网页或筛选链接' });
    expect(input).toHaveFocus();
    await user.type(input, 'nothing-here');
    expect(screen.getByText('没有匹配「nothing-here」的链接')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(openWindow).toHaveBeenCalledWith(expect.stringContaining('github.com/search'), '_blank', 'noopener,noreferrer');
    await user.click(screen.getByRole('option', { name: /在 GitHub 中搜索/ }));
    expect(openWindow).toHaveBeenCalledTimes(2);
  });

  it('reports clipboard providers and clears or closes with Escape and outside clicks', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Gemini' }));
    const input = screen.getByRole('combobox', { name: '搜索网页或筛选链接' });
    expect(input).toHaveAttribute('placeholder', '向模型提问，或筛选链接');
    await user.type(input, 'explain{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('问题已复制，请在 Gemini 中粘贴发送。');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(input).not.toHaveFocus();
    await user.type(input, 'git');
    fireEvent.pointerDown(screen.getByRole('button', { name: '外部' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('collapses results when keyboard focus leaves for the engine row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: '搜索网页或筛选链接' }), 'git');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '百度' })).toHaveFocus();
  });
});

describe('CommandPalette', () => {
  it('searches links, opens the selection and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette faviconVersions={{}} index={index} onClose={onClose} providerID="bing" />);
    const input = screen.getByRole('combobox', { name: '搜索链接' });
    expect(input).toHaveFocus();
    expect(screen.getByText(/在 3 个链接中查找；回车也可在 Bing 国际版 中搜索/)).toBeInTheDocument();
    await user.type(input, 'grafana');
    const option = present(screen.getAllByRole('option')[0], 'option');
    option.addEventListener('click', (event) => event.preventDefault());
    await user.keyboard('{End}{Home}{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
    await user.click(option);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps focus inside, submits web searches and closes on Escape or backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.stubGlobal('navigator', {});
    const { rerender } = render(<CommandPalette faviconVersions={{}} index={index} onClose={onClose} providerID="bing" />);
    const input = screen.getByRole('combobox', { name: '搜索链接' });
    await user.tab();
    expect(input).toHaveFocus();
    await user.type(input, 'zzz{Enter}');
    expect(openWindow).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<CommandPalette faviconVersions={{}} index={index} onClose={onClose} providerID="claude" />);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('请手动粘贴');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(present(screen.getByRole('dialog').parentElement, 'overlay'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

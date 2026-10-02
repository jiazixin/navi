import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { primaryPageFixture } from '../../../tests/fixtures/catalog';
import { SearchOverlay } from './SearchOverlay';

describe('SearchOverlay', () => {
  it('clears a query and closes with Escape from a focused result', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <SearchOverlay page={primaryPageFixture} query="Grafana" onChange={onChange} onClose={onClose} />,
    );
    screen.getByRole('link', { name: '打开 Grafana' }).focus();
    await user.keyboard('{Escape}');
    expect(onChange).toHaveBeenCalledWith('');
    expect(onClose).not.toHaveBeenCalled();

    rerender(<SearchOverlay page={primaryPageFixture} query="" onChange={onChange} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('traps focus and restores the opener when dismissed', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <SearchOverlay page={primaryPageFixture} query="" onChange={vi.fn()} onClose={vi.fn()} />,
    );
    const input = screen.getByRole('searchbox', { name: '搜索导航' });
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('link', { name: '打开 GitHub' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('restores desktop search after a breakpoint change and releases the shell', () => {
    const shell = document.createElement('div');
    shell.id = 'navi-shell';
    const desktopInput = document.createElement('input');
    const mobileOpener = document.createElement('button');
    shell.append(desktopInput, mobileOpener);
    document.body.append(shell);
    mobileOpener.focus();
    const { unmount } = render(
      <SearchOverlay
        desktopSearchInputRef={{ current: desktopInput }}
        page={primaryPageFixture}
        query="Grafana"
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(shell).toHaveAttribute('inert');
    const desktopMedia = window.matchMedia('(min-width: 768px)');
    Object.defineProperty(desktopMedia, 'matches', { value: true });
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue(desktopMedia);
    unmount();
    expect(shell).not.toHaveAttribute('inert');
    expect(shell).not.toHaveAttribute('aria-hidden');
    expect(desktopInput).toHaveFocus();
    media.mockRestore();
    shell.remove();
  });

  it('restores the mobile launcher even when clicking it did not focus the button', () => {
    const launcher = document.createElement('button');
    document.body.append(launcher);
    const { unmount } = render(
      <SearchOverlay
        mobileSearchButtonRef={{ current: launcher }}
        page={primaryPageFixture}
        query=""
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    unmount();
    expect(launcher).toHaveFocus();
    launcher.remove();
  });
});

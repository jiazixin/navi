import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackgroundPatternButton } from './BackgroundPatternButton';

describe('BackgroundPatternButton', () => {
  it('moves Tab and Shift+Tab outside the menu while it closes', async () => {
    const user = userEvent.setup();
    render(<>
      <button type="button">之前</button>
      <BackgroundPatternButton onChange={vi.fn()} preference="rose-window" />
      <button type="button">之后</button>
    </>);
    const trigger = screen.getByRole('button', { name: '背景纹样：玫瑰窗' });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('button', { name: '之后' })).toHaveFocus();
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();
  });

  it('shows all documented patterns with previews and selects one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BackgroundPatternButton onChange={onChange} preference="meridian-grid" />);

    await user.click(screen.getByRole('button', { name: '背景纹样：经纬阵' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(9);
    expect(document.querySelectorAll('[data-pattern-artwork]')).toHaveLength(9);

    await user.click(screen.getByRole('menuitemradio', { name: '玫瑰窗' }));
    expect(onChange).toHaveBeenCalledWith('rose-window');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('supports arrow navigation, home, end and escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BackgroundPatternButton onChange={onChange} preference="meridian-grid" />);

    const trigger = screen.getByRole('button', { name: '背景纹样：经纬阵' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{End}{Enter}');
    expect(onChange).toHaveBeenCalledWith('star-trails');

    await user.click(trigger);
    await user.keyboard('{Home}{Enter}');
    expect(onChange).toHaveBeenCalledWith('none');

    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('wraps backward and closes on tab or outside click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BackgroundPatternButton onChange={onChange} preference="none" />);

    const trigger = screen.getByRole('button', { name: '背景纹样：素幕' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenCalledWith('star-trails');

    await user.click(trigger);
    await user.keyboard('{Tab}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(trigger);
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

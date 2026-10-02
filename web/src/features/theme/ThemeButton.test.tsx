import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeButton } from './ThemeButton';

describe('ThemeButton', () => {
  it('moves Tab and Shift+Tab outside the menu while it closes', async () => {
    const user = userEvent.setup();
    render(<>
      <button type="button">之前</button>
      <ThemeButton onChange={vi.fn()} preference="tea-mist" />
      <button type="button">之后</button>
    </>);
    const trigger = screen.getByRole('button', { name: '主题：茶雾青' });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('button', { name: '之后' })).toHaveFocus();
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();
  });

  it('shows all themes and selects one from the menu', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeButton onChange={onChange} preference="default" />);

    await user.click(screen.getByRole('button', { name: '主题：默认' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(8);

    await user.click(screen.getByRole('menuitemradio', { name: '茶雾青' }));
    expect(onChange).toHaveBeenCalledWith('tea-mist');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('supports keyboard navigation and escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeButton onChange={onChange} preference="default" />);

    const trigger = screen.getByRole('button', { name: '主题：默认' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{End}{Enter}');
    expect(onChange).toHaveBeenCalledWith('violet-lime');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('wraps backward and closes on tab or an outside click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeButton onChange={onChange} preference="default" />);

    const trigger = screen.getByRole('button', { name: '主题：默认' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenCalledWith('violet-lime');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(trigger);
    await user.keyboard('{Tab}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(trigger);
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

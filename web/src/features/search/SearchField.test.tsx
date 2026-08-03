import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from './SearchField';

describe('SearchField', () => {
  it('updates the controlled query and handles keyboard commands', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onEscape = vi.fn();
    const onMoveToResults = vi.fn();
    const onOpenFirstResult = vi.fn();
    const { rerender } = render(
      <SearchField
        onChange={onChange}
        onEscape={onEscape}
        onMoveToResults={onMoveToResults}
        onOpenFirstResult={onOpenFirstResult}
        value=""
      />,
    );
    const input = screen.getByRole('searchbox', { name: '搜索导航' });

    await user.type(input, 'GitHub');
    expect(onChange).toHaveBeenCalled();

    rerender(
      <SearchField
        onChange={onChange}
        onEscape={onEscape}
        onMoveToResults={onMoveToResults}
        onOpenFirstResult={onOpenFirstResult}
        value="GitHub"
      />,
    );
    await user.type(input, '{ArrowDown}{Enter}{Escape}');
    expect(onMoveToResults).toHaveBeenCalledOnce();
    expect(onOpenFirstResult).toHaveBeenCalledOnce();
    expect(onEscape).toHaveBeenCalledOnce();
  });
});

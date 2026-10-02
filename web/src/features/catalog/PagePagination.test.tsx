import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { catalogFixture, primaryPageFixture } from '../../../tests/fixtures/catalog';
import { PagePagination } from './PagePagination';

describe('PagePagination', () => {
  it('uses icon controls and announces the current page', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PagePagination currentIndex={0} onChange={onChange} pages={catalogFixture.pages} />);

    const previous = screen.getByRole('button', { name: '上一页' });
    const currentPage = screen.getByRole('button', { name: '第 1 页：我的导航' });
    expect(previous).toBeDisabled();
    expect(currentPage).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(currentPage.querySelector('[data-page-indicator="active"]')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('stays out of the layout for a single page', () => {
    const { container } = render(
      <PagePagination currentIndex={0} onChange={vi.fn()} pages={[primaryPageFixture]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

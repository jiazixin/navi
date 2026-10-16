import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { primaryPageFixture } from '../../../tests/fixtures/catalog';
import { iconSource } from '../../app/api/routes';
import { LinkIcon } from '../../components/LinkIcon';
import { present } from '../../test/present';
import { CatalogView } from './CatalogView';
import { LoadingCatalog } from './LoadingCatalog';

describe('CatalogView', () => {
  it('renders numbered sections, an index and cards that navigate through the server', () => {
    render(<CatalogView faviconVersions={{ grafana: 3 }} page={primaryPageFixture} />);
    expect(screen.getByRole('heading', { level: 2, name: '基础设施' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '开发' })).toBeInTheDocument();

    const grafana = screen.getByRole('link', { name: '打开 Grafana' });
    expect(grafana).toHaveAttribute('href', '/go/grafana');
    expect(grafana).toHaveAttribute('target', '_blank');
    expect(grafana).toHaveAttribute('title', 'Grafana — grafana.example.com');
    expect(within(grafana).getByText('内网')).toBeInTheDocument();
    expect(within(grafana).getByText('Metrics and dashboards')).toBeInTheDocument();
    expect(grafana.querySelector('img')).toHaveAttribute('src', '/api/icons/grafana?v=3');
    expect(within(screen.getByRole('link', { name: '打开 GitHub' })).queryByText('内网')).not.toBeInTheDocument();

    const index = screen.getByRole('navigation', { name: '分区目录' });
    const entries = within(index).getAllByRole('link');
    expect(entries.map((entry) => entry.getAttribute('href'))).toEqual(['#section-page1-0', '#section-page1-1']);
    expect(entries[0]).toHaveAttribute('aria-current', 'location');
    expect(within(index).getAllByLabelText('1 个链接')).toHaveLength(2);
  });

  it('tracks the pointer across a hovered grid for the shared spotlight', async () => {
    render(<CatalogView faviconVersions={{}} page={primaryPageFixture} />);
    const card = screen.getByRole('link', { name: '打开 Grafana' });
    const grid = present(card.parentElement, 'grid');
    fireEvent.pointerEnter(grid);
    expect(grid).toHaveAttribute('data-spotlight', 'on');
    fireEvent.pointerMove(grid, { clientX: 30, clientY: 12 });
    fireEvent.pointerMove(grid, { clientX: 31, clientY: 12 });
    await waitFor(() => expect(card.style.getPropertyValue('--spot-x')).toBe('31px'));
    fireEvent.pointerLeave(grid);
    expect(grid).not.toHaveAttribute('data-spotlight');
  });

  it('announces the loading skeleton', () => {
    render(<LoadingCatalog />);
    expect(screen.getByRole('status', { name: '正在加载目录' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('LinkIcon', () => {
  it('shows the monogram until the favicon loads and retries when the version changes', () => {
    const { container, rerender } = render(<LinkIcon name="grafana" src={iconSource('grafana')} />);
    const tile = present(container.firstElementChild, 'tile');
    expect(tile).toHaveTextContent('G');
    expect(tile).toHaveAttribute('data-state', 'pending');
    fireEvent.error(present(tile.querySelector('img'), 'image'));
    expect(tile).toHaveAttribute('data-state', 'fallback');
    expect(tile.querySelector('img')).toBeNull();

    rerender(<LinkIcon name="grafana" src={iconSource('grafana', 1)} />);
    const image = present(tile.querySelector('img'), 'image');
    expect(image).toHaveAttribute('src', '/api/icons/grafana?v=1');
    fireEvent.load(image);
    expect(tile).toHaveAttribute('data-state', 'loaded');
  });
});

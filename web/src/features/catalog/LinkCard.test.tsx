import { fireEvent, render, screen } from '@testing-library/react';
import { githubLink } from '../../test/fixtures';
import { LinkCard } from './LinkCard';

describe('LinkCard', () => {
  it('uses the local resolver and keeps a stable hostname fallback', () => {
    render(<LinkCard link={{ ...githubLink, description: undefined }} />);

    const link = screen.getByRole('link', { name: '打开 GitHub' });
    expect(link).toHaveAttribute('href', '/go/github');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('github.com')).toBeInTheDocument();

    fireEvent.click(link);
    expect(link).toHaveAttribute('data-opening', 'true');
  });

  it('falls back to the link name when a hostname cannot be parsed', () => {
    render(
      <LinkCard
        link={{
          runtimeId: 'fallback',
          name: 'Fallback',
          publicUrl: 'https://example.com',
          tags: [],
        }}
      />,
    );
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('uses a versioned local icon URL when a favicon update arrives', () => {
    render(
      <LinkCard
        iconURL="/api/icons/github?v=2"
        link={githubLink}
      />,
    );
    expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('src', '/api/icons/github?v=2');
  });
});

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { catalogFixture } from '../../../tests/fixtures/catalog';
import { PagePagination } from './PagePagination';

function PaginationDemo(): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(0);
  return (
    <PagePagination
      currentIndex={currentIndex}
      onChange={setCurrentIndex}
      pages={catalogFixture.pages}
    />
  );
}

const meta = {
  title: 'Catalog/PagePagination',
  component: PagePagination,
  args: {
    currentIndex: 0,
    onChange: () => undefined,
    pages: catalogFixture.pages,
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof PagePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => <PaginationDemo />,
};

export const LastPage: Story = {
  args: { currentIndex: 1 },
};

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchField } from './SearchField';

function SearchFieldDemo(): React.JSX.Element {
  const [value, setValue] = useState('');
  return <SearchField onChange={setValue} value={value} />;
}

const meta = {
  title: 'Search/SearchField',
  component: SearchField,
  args: {
    value: '',
    onChange: () => undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <SearchFieldDemo />,
};

export const Typing: Story = {
  args: { value: 'Grafana' },
};

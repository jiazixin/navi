import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeButton } from './ThemeButton';

const meta = {
  title: 'Theme/ThemeButton',
  component: ThemeButton,
  args: {
    preference: 'default',
    onChange: () => undefined,
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ThemeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NavyBlossom: Story = { args: { preference: 'navy-blossom' } };
export const TeaMist: Story = { args: { preference: 'tea-mist' } };
export const VioletLime: Story = { args: { preference: 'violet-lime' } };

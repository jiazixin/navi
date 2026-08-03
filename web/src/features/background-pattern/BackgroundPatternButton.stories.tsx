import type { Meta, StoryObj } from '@storybook/react-vite';
import { BackgroundPatternButton } from './BackgroundPatternButton';

const meta = {
  title: 'Background Pattern/BackgroundPatternButton',
  component: BackgroundPatternButton,
  args: {
    preference: 'meridian-grid',
    onChange: () => undefined,
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof BackgroundPatternButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const OrbitalRings: Story = { args: { preference: 'orbital-rings' } };
export const StarTrails: Story = { args: { preference: 'star-trails' } };
export const None: Story = { args: { preference: 'none' } };

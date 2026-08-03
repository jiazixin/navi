import type { Meta, StoryObj } from '@storybook/react-vite';
import { BackgroundPattern } from './BackgroundPattern';

const meta = {
  title: 'Background Pattern/BackgroundPattern',
  component: BackgroundPattern,
  args: { pattern: 'meridian-grid' },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BackgroundPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MeridianGrid: Story = {};
export const OrbitalRings: Story = { args: { pattern: 'orbital-rings' } };
export const Pisces: Story = { args: { pattern: 'pisces' } };
export const Sagittarius: Story = { args: { pattern: 'sagittarius' } };
export const RomanMeander: Story = { args: { pattern: 'roman-meander' } };
export const RoseWindow: Story = { args: { pattern: 'rose-window' } };
export const EightPointStar: Story = { args: { pattern: 'eight-point-star' } };
export const StarTrails: Story = { args: { pattern: 'star-trails' } };

import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AppearancePanel } from './AppearancePanel';

const meta = {
  title: 'Appearance/AppearancePanel',
  component: AppearancePanel,
  args: {
    id: 'appearance',
    anchorRef: createRef<HTMLElement>(),
    onClose: fn(),
  },
} satisfies Meta<typeof AppearancePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

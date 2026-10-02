import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoginPage } from './LoginPage';

const meta = { title: 'Authentication/LoginPage', component: LoginPage, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof LoginPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Checking: Story = { args: { checking: true } };
export const ConnectionFailure: Story = { args: { connectionError: true, onRetry: () => undefined } };

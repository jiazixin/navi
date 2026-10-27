import type { Meta, StoryObj } from '@storybook/react-vite'
import { mockCatalog } from '../../../tests/fixtures/mockCatalog'
import { CatalogView } from './CatalogView'
import { LoadingCatalog } from './LoadingCatalog'

const meta = {
  title: 'Catalog/CatalogView',
  component: CatalogView,
  args: {
    page: mockCatalog.pages[0] ?? { id: 'empty', title: '空', groups: [] },
    faviconVersions: {},
  },
} satisfies Meta<typeof CatalogView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = {
  render: () => <LoadingCatalog />,
}

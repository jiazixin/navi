import { createRef } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { mockCatalog } from '../../../tests/fixtures/mockCatalog'
import styles from './HeroSearch.module.css'
import { HeroSearch } from './HeroSearch'
import { buildSearchIndex } from './linkSearch'

const meta = {
  title: 'Search/HeroSearch',
  component: HeroSearch,
  args: {
    index: buildSearchIndex(mockCatalog.pages),
    providerID: 'baidu',
    onProviderChange: fn(),
    faviconVersions: {},
    inputRef: createRef<HTMLInputElement>(),
  },
  decorators: [
    (Story) => (
      <div className={styles.preview}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroSearch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

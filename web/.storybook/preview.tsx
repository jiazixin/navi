import type { Preview } from '@storybook/react-vite'
import { AppearanceProvider } from '../src/app/appearance/AppearanceProvider'
import { paletteIDs, parseThemePreference } from '../src/app/appearance/options'
import '../src/styles/global.css'

const preview: Preview = {
  parameters: {
    a11y: {
      test: 'error',
    },
    backgrounds: {
      disable: true,
    },
    controls: {
      expanded: true,
    },
  },
  decorators: [
    (Story, context) => (
      <AppearanceProvider
        configuredPattern="none"
        configuredTheme={parseThemePreference(context.globals.palette, 'ink')}
      >
        <Story />
      </AppearanceProvider>
    ),
  ],
  globalTypes: {
    palette: {
      description: 'Palette',
      defaultValue: 'ink',
      toolbar: {
        icon: 'paintbrush',
        items: [...paletteIDs],
      },
    },
  },
}

export default preview

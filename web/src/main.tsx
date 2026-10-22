import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { DEFAULT_WEB_SEARCH_PROVIDER, webSearchProviderSchema } from './app/api/webSearch';
import { AppProviders } from './app/providers';
import { AppearanceProvider } from './features/appearance/AppearanceProvider';
import { applyPalette, parsePattern, parseThemePreference, resolvePalette, storageKeys } from './features/appearance/options';
import { AuthGate } from './features/auth/AuthGate';
import { NavigationFailure } from './features/navigation/NavigationFailure';
import { readStored } from './lib/storage/localStorage';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Navi root element was not found.');
}

// The Go server injects configured appearance defaults; apply the palette before the first paint.
const configuredTheme = parseThemePreference(rootElement.dataset.configuredTheme);
const configuredPattern = parsePattern(rootElement.dataset.configuredPattern);
const configuredSearch = webSearchProviderSchema.catch(DEFAULT_WEB_SEARCH_PROVIDER).parse(rootElement.dataset.configuredSearch);
applyPalette(
  resolvePalette(
    parseThemePreference(readStored(storageKeys.theme), configuredTheme),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  ),
);

const navigationError = rootElement.dataset.navigationError;
const retryPath = rootElement.dataset.retryPath;

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <AppearanceProvider configuredPattern={configuredPattern} configuredTheme={configuredTheme}>
        <AuthGate>
          {navigationError === undefined ? (
            <App configuredSearch={configuredSearch} />
          ) : (
            <NavigationFailure message={navigationError} retryPath={retryPath?.startsWith('/go/') === true ? retryPath : '/'} />
          )}
        </AuthGate>
      </AppearanceProvider>
    </AppProviders>
  </StrictMode>,
);

import { AuthGate } from './features/auth/AuthGate';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { NavigationFailure } from './features/navigation/NavigationFailure';
import { catalogThemeSchema } from './app/api/theme';
import { getThemeOption } from './features/theme/themeOptions';
import { AppProviders } from './app/providers';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Navi root element was not found.');
}

const configuredTheme = catalogThemeSchema.catch('default').parse(rootElement.dataset.configuredTheme);
let storedTheme: string | null = null;
try { storedTheme = window.localStorage.getItem('navi.theme'); } catch { /* Use configured defaults. */ }
const theme = catalogThemeSchema.catch(configuredTheme).parse(storedTheme);
const resolvedTheme = theme === 'default'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : theme;
document.documentElement.dataset.theme = resolvedTheme;
document.documentElement.dataset.themePreference = theme;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
  resolvedTheme === 'dark' ? '#0a0a0a' : resolvedTheme === 'light' ? '#ffffff' : getThemeOption(resolvedTheme).metaColor,
);
const message = rootElement.dataset.navigationError;
const retryPath = rootElement.dataset.retryPath;

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <AuthGate>
      {message === undefined ? <App /> : (
        <NavigationFailure message={message} configuredTheme={configuredTheme}
          retryPath={retryPath?.startsWith('/go/') === true ? retryPath : '/'} />
      )}
    </AuthGate>
    </AppProviders>
  </StrictMode>,
);

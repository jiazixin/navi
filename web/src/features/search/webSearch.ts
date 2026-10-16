import type { SearchProvider } from './providers';

/**
 * Opens the provider in a new tab. Providers without query URLs receive the text through
 * the clipboard; the returned message describes what the user still has to do.
 */
export async function submitWebSearch(provider: SearchProvider, query: string): Promise<string> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return '';
  window.open(provider.buildURL(trimmed), '_blank', 'noopener,noreferrer');
  if (provider.submission === 'direct') return '';

  const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
  if (clipboard === undefined) return `已打开 ${provider.label}，请手动粘贴问题。`;
  try {
    await clipboard.writeText(trimmed);
    return `问题已复制，请在 ${provider.label} 中粘贴发送。`;
  } catch {
    return `已打开 ${provider.label}，剪贴板不可用，请手动粘贴问题。`;
  }
}

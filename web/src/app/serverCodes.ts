import { ApiError } from './api'
import { errorText } from './errors'
/*
 * Text for codes sent by the Go server. The server sends stable codes with
 * English developer messages; the interface shows the text mapped here and
 * never the server's message. See docs/API.md.
 */

const statusTexts: Record<string, string> = {
  catalog_unavailable: '目录尚不可用。',
  catalog_reload_failed: '目录更新失败，当前仍显示最近一次有效内容。',
  icon_cache_unavailable: '图标缓存暂不可用，当前使用字标。',
  icon_cache_write_failed:
    '图标缓存写入失败，当前保留已有图标或使用字标。请检查存储权限和磁盘空间。',
}

/** Returns the banner text for a degraded status code, or undefined for an unknown code. */
export function statusText(code: string | undefined): string | undefined {
  return code === undefined || !Object.hasOwn(statusTexts, code)
    ? undefined
    : errorText(new ApiError('service degraded', { status: 503, code, requestId: '' }), statusTexts)
}

const navigationTitles: Record<string, string> = {
  link_not_found: '链接不存在',
  link_unavailable: '链接暂时不可用',
  catalog_unavailable: '目录暂时不可用',
}

/** Returns the title of the navigation failure page for its code. */
export function navigationFailureTitle(code: string): string {
  return errorText(
    new ApiError('navigation failed', {
      status: 503,
      code: Object.hasOwn(navigationTitles, code) ? code : 'link_unavailable',
      requestId: '',
    }),
    navigationTitles,
  )
}

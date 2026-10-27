import { ApiError } from './api'

// Codes every request can fail with, including client codes (status 0).
const commonTexts: Record<string, string> = {
  network_unavailable: '连接失败，请检查网络后重试。',
  timeout: '请求超时，请稍后重试。',
  invalid_response: '服务返回了无法读取的数据。',
  unauthenticated: '登录已过期，请重新登录。',
  permission_denied: '请求被拒绝，请刷新页面后重试。',
  rate_limited: '操作过于频繁，请稍后重试。',
}

// Text by status when no code table knows the code.
const statusTexts: Record<number, string> = {
  400: '请求无效。',
  401: '请先登录。',
  403: '没有权限执行此操作。',
  404: '请求的内容不存在。',
  429: '操作过于频繁，请稍后重试。',
  503: '服务暂时不可用，请稍后重试。',
}

/**
 * Returns the user text of a failure: the caller's code table first, then the
 * common codes, then a text for the HTTP status. An aborted request has no text.
 */
export function errorText(error: unknown, messages: Record<string, string> = {}): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  if (!(error instanceof ApiError)) return '操作失败，请重试。'
  const text = messages[error.code] ?? commonTexts[error.code] ?? statusTexts[error.status]
  if (text !== undefined) return text
  return error.status >= 500 ? '服务暂时无法完成请求，请稍后重试。' : '操作失败，请重试。'
}

/** Reads field paths without trusting arbitrary server details or displaying developer text. */
export function fieldErrorText(error: unknown, path: string): string {
  if (!(error instanceof ApiError) || error.status !== 400) return ''
  const details: unknown = error.details
  if (
    typeof details !== 'object' ||
    details === null ||
    !('fields' in details) ||
    !Array.isArray(details.fields)
  )
    return ''
  return details.fields.some(
    (field: unknown) =>
      typeof field === 'object' && field !== null && 'path' in field && field.path === path,
  )
    ? errorText(error, { invalid_argument: '请检查此项的格式与长度。' })
    : ''
}

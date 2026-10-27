import loginInvalidLength from '../../../tests/fixtures/api/login-invalid-length.json'
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { errorText, fieldErrorText } from './errors'
import { navigationFailureTitle, statusText } from './serverCodes'

function failure(status: number, code: string): ApiError {
  return new ApiError('failed', { status, code, requestId: '' })
}

describe('errorText', () => {
  it('prefers the caller table, then common codes, then the status', () => {
    expect(
      errorText(failure(401, 'invalid_credentials'), { invalid_credentials: '密码错误' }),
    ).toBe('密码错误')
    expect(errorText(failure(0, 'network_unavailable'))).toBe('连接失败，请检查网络后重试。')
    expect(errorText(failure(503, 'unknown_code'))).toBe('服务暂时不可用，请稍后重试。')
    expect(errorText(failure(500, ''))).toBe('服务暂时无法完成请求，请稍后重试。')
  })

  it('has no text for an aborted request and a generic text for other errors', () => {
    expect(errorText(new DOMException('aborted', 'AbortError'))).toBe('')
    expect(errorText(new Error('boom'))).toBe('操作失败，请重试。')
  })

  it.each(['__proto__', 'constructor', 'toString'])('treats %s as an unknown code', (code) => {
    expect(errorText(failure(503, code))).toBe('服务暂时不可用，请稍后重试。')
    expect(statusText(code)).toBeUndefined()
    expect(navigationFailureTitle(code)).toBe('链接暂时不可用')
    expect(
      fieldErrorText(
        new ApiError('developer-only details', {
          status: 400,
          code: 'invalid_argument',
          requestId: '',
          details: { fields: [{ path: 'password', reason: code }] },
        }),
        'password',
      ),
    ).toBe('请检查此项的格式与长度。')
  })
})

it('shows field validation only beside the matching field', () => {
  const failure = new ApiError(loginInvalidLength.response.error.message, {
    status: loginInvalidLength.status,
    code: loginInvalidLength.response.error.code,
    requestId: '',
    details: loginInvalidLength.response.error.details,
  })
  expect(fieldErrorText(failure, 'password')).toBe('此项长度不符合要求。')
  expect(fieldErrorText(failure, 'username')).toBe('')
  expect(fieldErrorText(new Error('internal details'), 'password')).toBe('')
})

it.each([
  { reason: 'unknown_reason', expected: '请检查此项的格式与长度。' },
  { reason: undefined, expected: '' },
  { reason: { message: 'developer-only details' }, expected: '' },
])('handles an unrecognized or invalid field reason: $reason', ({ reason, expected }) => {
  const error = new ApiError('developer-only details', {
    status: 400,
    code: 'invalid_argument',
    requestId: '',
    details: { fields: [{ path: 'password', reason }] },
  })
  expect(fieldErrorText(error, 'password')).toBe(expected)
})

it('does not interpret other error codes as field validation', () => {
  const error = new ApiError('developer-only details', {
    status: 400,
    code: 'other_error',
    requestId: '',
    details: { fields: [{ path: 'password', reason: 'invalid_length' }] },
  })
  expect(fieldErrorText(error, 'password')).toBe('')
})

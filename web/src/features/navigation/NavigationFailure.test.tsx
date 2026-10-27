import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppearanceProvider } from '../../app/appearance/AppearanceProvider'
import { NavigationFailure } from './NavigationFailure'

describe('NavigationFailure', () => {
  it('offers retry and return links with the configured palette', () => {
    render(
      <AppearanceProvider configuredPattern="ridge" configuredTheme="dusk">
        <NavigationFailure message="部署测试 当前无法访问" retryPath="/go/deploy" />
      </AppearanceProvider>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: '部署测试 当前无法访问' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '重试访问' })).toHaveAttribute('href', '/go/deploy')
    expect(screen.getByRole('link', { name: '返回导航' })).toHaveAttribute('href', '/')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dusk')
    expect(document.title).toBe('部署测试 当前无法访问 · Navi')
  })
})

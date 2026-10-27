import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBanner } from './StatusBanner'

describe('StatusBanner', () => {
  it('announces degraded and offline states and can be dismissed', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const { rerender } = render(
      <StatusBanner kind="degraded" message="服务处于降级状态" onDismiss={onDismiss} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('DEGRADED服务处于降级状态')
    rerender(<StatusBanner kind="offline" message="实时更新暂时中断" onDismiss={onDismiss} />)
    expect(screen.getByRole('alert')).toHaveAttribute('data-kind', 'offline')
    await user.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

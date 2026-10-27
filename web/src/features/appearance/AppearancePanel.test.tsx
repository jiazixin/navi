import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppearancePanel } from './AppearancePanel'
import { AppearanceProvider } from '../../app/appearance/AppearanceProvider'
import {
  applyPalette,
  getPalette,
  getPattern,
  parsePattern,
  parseThemePreference,
  resolvePalette,
} from '../../app/appearance/options'

function renderPanel(onClose = vi.fn()) {
  const anchorRef = createRef<HTMLButtonElement>()
  render(
    <AppearanceProvider configuredPattern="contour" configuredTheme="default">
      <button ref={anchorRef} type="button">
        外观
      </button>
      <AppearancePanel anchorRef={anchorRef} id="appearance" onClose={onClose} />
    </AppearanceProvider>,
  )
  return { onClose }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('appearance options', () => {
  it('parses stored values strictly and resolves the default palette from the system', () => {
    expect(parseThemePreference('dusk')).toBe('dusk')
    expect(parseThemePreference('violet-lime', 'ink')).toBe('ink')
    expect(parsePattern('ridge')).toBe('ridge')
    expect(parsePattern(null)).toBe('contour')
    expect(resolvePalette('default', true)).toBe('ink')
    expect(resolvePalette('default', false)).toBe('paper')
    expect(resolvePalette('celadon', false)).toBe('celadon')
    expect(getPattern('flow').name).toBe('流场')
    expect(getPalette('paper').name).toBe('宣纸')
  })

  it('applies the palette and browser theme colour', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    const computedStyle = document.createElement('div').style
    computedStyle.setProperty('--bg', '#07110f')
    const computed = vi.spyOn(window, 'getComputedStyle').mockReturnValue(computedStyle)
    applyPalette('celadon')
    expect(document.documentElement).toHaveAttribute('data-theme', 'celadon')
    expect(meta).toHaveAttribute('content', '#07110f')
    meta.remove()
    computed.mockRestore()
  })
})

describe('AppearancePanel', () => {
  it('selects patterns and palettes with pointer and arrow keys and persists them', async () => {
    const user = userEvent.setup()
    renderPanel()
    const contour = screen.getByRole('radio', { name: '等高线 Contour' })
    expect(contour).toHaveFocus()
    expect(contour).toHaveAttribute('aria-checked', 'true')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '流场 Flow field' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.keyboard('{End}')
    expect(screen.getByRole('radio', { name: '素净 Plain' })).toHaveFocus()
    await user.keyboard('{Home}{ArrowLeft}')
    expect(window.localStorage.getItem('navi.pattern')).toBe('none')

    await user.click(screen.getByRole('radio', { name: /暮紫/ }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dusk')
    expect(window.localStorage.getItem('navi.theme')).toBe('dusk')
    screen.getByRole('radio', { name: /暮紫/ }).focus()
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dusk')
  })

  it('adjusts pattern strength and motion', async () => {
    const user = userEvent.setup()
    renderPanel()
    // user-event cannot set a range input to an exact value.
    fireEvent.change(screen.getByRole('slider', { name: '纹样强度' }), { target: { value: '40' } })
    expect(document.documentElement).toHaveAttribute('data-pattern-strength', '40')
    expect(window.localStorage.getItem('navi.pattern-strength')).toBe('40')

    const motion = screen.getByRole('switch', { name: /动态效果/ })
    expect(motion).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/系统已开启/)).toBeInTheDocument()
    await user.click(motion)
    expect(motion).toHaveAttribute('aria-checked', 'false')
    expect(window.localStorage.getItem('navi.motion')).toBe('off')
  })

  it('closes on Escape with focus restore and on outside pointer without it', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenLastCalledWith(true)
    await user.pointer({ keys: '[MouseLeft]', target: document.body })
    expect(onClose).toHaveBeenLastCalledWith(false)
    onClose.mockClear()
    await user.pointer({
      keys: '[MouseLeft]',
      target: screen.getByRole('button', { name: '外观' }),
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores stored preferences and ignores invalid strength', () => {
    window.localStorage.setItem('navi.theme', 'paper')
    window.localStorage.setItem('navi.pattern', 'stars')
    window.localStorage.setItem('navi.pattern-strength', '900')
    window.localStorage.setItem('navi.motion', 'off')
    renderPanel()
    expect(document.documentElement).toHaveAttribute('data-theme', 'paper')
    expect(screen.getByRole('radio', { name: '星轨 Star trails' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('slider', { name: '纹样强度' })).toHaveValue('90')
    expect(screen.getByRole('switch', { name: /动态效果/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})

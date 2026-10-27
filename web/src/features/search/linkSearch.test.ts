import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogFixture, longLink } from '../../../tests/fixtures/catalog'
import { hostOf } from '../../lib/url/host'
import { buildSearchIndex, highlight, searchLinks } from './linkSearch'
import { getSearchProvider } from './providers'
import { submitWebSearch } from './webSearch'

const index = buildSearchIndex([
  ...catalogFixture.pages,
  { id: 'extra', title: '附加', groups: [{ name: '边界', links: [longLink] }] },
])

describe('link search', () => {
  it('indexes every page with group, page and host context', () => {
    expect(index.map((entry) => entry.link.runtime_id)).toEqual([
      'grafana',
      'github',
      'github-page2',
      'long-link',
    ])
    expect(index[0]).toMatchObject({
      group: '基础设施',
      page: '我的导航',
      host: 'grafana.example.com',
    })
  })

  it('ranks names before tags, hosts, descriptions and groups, keeping catalog order for ties', () => {
    expect(searchLinks(index, 'github', 10).map((entry) => entry.link.runtime_id)).toEqual([
      'github',
      'github-page2',
    ])
    expect(searchLinks(index, 'metrics', 10).map((entry) => entry.link.runtime_id)).toEqual([
      'grafana',
    ])
    expect(searchLinks(index, 'example.com', 10).map((entry) => entry.link.runtime_id)).toEqual([
      'grafana',
      'long-link',
    ])
    expect(searchLinks(index, 'dashboards', 10).map((entry) => entry.link.runtime_id)).toEqual([
      'grafana',
    ])
    expect(searchLinks(index, '收藏', 10).map((entry) => entry.link.runtime_id)).toEqual([
      'github-page2',
    ])
    expect(searchLinks(index, 'monitor', 10).map((entry) => entry.link.runtime_id)).toEqual([
      'grafana',
    ])
    expect(searchLinks(index, 'gfn', 10).map((entry) => entry.link.runtime_id)).toEqual(['grafana'])
    expect(searchLinks(index, '  ', 10)).toEqual([])
    expect(searchLinks(index, 'git', 1)).toHaveLength(1)
  })

  it('highlights the first case-insensitive match', () => {
    expect(highlight('GitHub', 'hub')).toEqual({ before: 'Git', match: 'Hub', after: '' })
    expect(highlight('GitHub', 'lab')).toBeNull()
    expect(highlight('GitHub', ' ')).toBeNull()
  })

  it('derives display hosts from public then private URLs', () => {
    expect(hostOf({ public_url: 'https://www.example.com/a' })).toBe('example.com')
    expect(hostOf({ private_url: 'http://nas.lan:5000' })).toBe('nas.lan')
    expect(hostOf({ public_url: 'not a url' })).toBe('')
    expect(hostOf({})).toBe('')
  })
})

describe('web search submission', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens direct providers without a message and ignores empty queries', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await expect(submitWebSearch(getSearchProvider('bing'), '  ')).resolves.toBe('')
    expect(open).not.toHaveBeenCalled()
    await expect(submitWebSearch(getSearchProvider('bing'), ' navi ')).resolves.toBe('')
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('q=navi'),
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('copies prompts for clipboard providers and reports every outcome', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const claude = getSearchProvider('claude')
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(submitWebSearch(claude, '解释')).resolves.toBe(
      '问题已复制，请在 Claude 中粘贴发送。',
    )
    expect(writeText).toHaveBeenCalledWith('解释')
    await expect(submitWebSearch(claude, '解释')).resolves.toContain('剪贴板不可用')
    vi.stubGlobal('navigator', {})
    await expect(submitWebSearch(claude, '解释')).resolves.toContain('请手动粘贴')
  })
})

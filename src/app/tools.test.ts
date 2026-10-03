import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLS, hostOf, mergeTools, normalizeUrl, processLink } from './tools'

describe('tools links', () => {
  it('accepts web links and adds https when missing', () => {
    expect(normalizeUrl('example.com/lattice')).toBe('https://example.com/lattice')
    expect(normalizeUrl(' http://intranet.local/kit ')).toBe('http://intranet.local/kit')
    expect(normalizeUrl('')).toBeNull()
  })
  it('refuses non-web schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,hi')).toBeNull()
    expect(normalizeUrl('file:///C:/x.html')).toBeNull()
  })
  it('merges saved links over defaults, including clearing one', () => {
    const merged = mergeTools({ lattice: 'https://x.example/lattice', pipeline: null })
    expect(merged.find((t) => t.id === 'lattice')?.url).toBe('https://x.example/lattice')
    expect(merged.find((t) => t.id === 'pipeline')?.url).toBeNull()
    expect(merged.find((t) => t.id === 'catalog')?.url).toBe(DEFAULT_TOOLS[3].url)
  })
  it('builds Atlas deep links for process IDs', () => {
    expect(processLink(DEFAULT_TOOLS, 'OF-05')).toBe(
      'https://claude.ai/artifact/JVU8J4nKU6Sjj35K9TA7Cn#process.OF-05',
    )
    expect(processLink(DEFAULT_TOOLS, 'nope')).toBeNull()
    expect(processLink(mergeTools({ catalog: null }), 'OF-05')).toBeNull()
  })
  it('shows a short host', () => {
    expect(hostOf('https://www.unique.example/a/b')).toBe('unique.example')
  })
})

import { describe, expect, it } from 'vitest'
import { cellAction, safeHref } from './cells'
import type { Column } from './types'

describe('safeHref', () => {
  it('allows web, mail and same-site links', () => {
    expect(safeHref('https://ats.example.com/req/R-1042')).toBe('https://ats.example.com/req/R-1042')
    expect(safeHref(' http://intranet/case/42 ')).toBe('http://intranet/case/42')
    expect(safeHref('mailto:hrbp@example.com')).toBe('mailto:hrbp@example.com')
    expect(safeHref('/people/E10001')).toBe('/people/E10001')
    expect(safeHref('#talent')).toBe('#talent')
  })

  it('drops script and data URLs and blanks', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref(' JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref(undefined)).toBeNull()
  })
})

describe('cellAction', () => {
  type Row = { id: string; url: string | null; n: number }
  const drill = (r: Row) => (r.n > 0 ? { kind: 'employees' as const, title: r.id, rows: [] } : null)
  const row: Row = { id: 'R-1', url: 'https://ats.example.com/R-1', n: 3 }

  it('links when href gives a URL, and href wins over drill', () => {
    const col: Column<Row> = { key: 'id', label: 'Req', href: (r) => r.url, drill: drill as never }
    expect(cellAction(col, row, 'R-1')).toEqual({ kind: 'link', href: 'https://ats.example.com/R-1' })
  })

  it('falls back to the drill when href gives no (safe) link for the row', () => {
    const col: Column<Row> = { key: 'n', label: 'People', href: (r) => r.url, drill: drill as never }
    expect(cellAction(col, { ...row, url: null }, '3')?.kind).toBe('drill')
    expect(cellAction(col, { ...row, url: 'javascript:void(0)' }, '3')?.kind).toBe('drill')
  })

  it('does nothing for blank cells or rows with nothing behind them', () => {
    const col: Column<Row> = { key: 'n', label: 'People', href: (r) => r.url, drill: drill as never }
    expect(cellAction(col, row, '—')).toBeNull()
    expect(cellAction({ key: 'n', label: 'People', drill: drill as never }, { ...row, n: 0 }, '0')).toBeNull()
    expect(cellAction({ key: 'n', label: 'People' }, row, '3')).toBeNull()
  })
})

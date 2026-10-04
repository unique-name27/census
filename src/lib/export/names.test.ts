import { describe, expect, it } from 'vitest'
import { plainText, visibleColumns } from './columns'
import {
  asOfIso,
  asOfLabel,
  dataLine,
  fileStem,
  imageFooter,
  metaLine,
  slug,
  stampLine,
  standardLine,
} from './names'

describe('fileStem', () => {
  it('builds census-<view>-<name>-<as-of>', () => {
    expect(fileStem({ view: 'Recruiting', asOf: '2026-09-30' }, 'rec-time-to-fill')).toBe(
      'census-recruiting-rec-time-to-fill-2026-09-30',
    )
  })
  it('normalizes formatted as-of dates and awkward view names', () => {
    expect(fileStem({ view: 'HR business partners', asOf: '30 Sep 2026' }, 'Span & layers')).toBe(
      'census-hr-business-partners-span-and-layers-2026-09-30',
    )
  })
  it('skips an empty name', () => {
    expect(fileStem({ view: 'Compensation', asOf: '2026-09-30' })).toBe('census-compensation-2026-09-30')
  })
})

describe('slug', () => {
  it('is lowercase ASCII with single dashes', () => {
    expect(slug('  Café — São Paulo / L5+ ')).toBe('cafe-sao-paulo-l5')
  })
})

describe('as-of helpers', () => {
  it('reads ISO and formatted dates', () => {
    expect(asOfIso('2026-09-30')).toBe('2026-09-30')
    expect(asOfIso('1 Oct 2025')).toBe('2025-10-01')
    expect(asOfIso('someday')).toBeNull()
    expect(asOfLabel('2026-09-30')).toBe('30 Sep 2026')
    expect(asOfLabel('30 Sep 2026')).toBe('30 Sep 2026')
  })
  it('stamps context lines', () => {
    const meta = {
      scope: 'Whole company',
      window: '1 Oct 2025 – 30 Sep 2026',
      asOf: '2026-09-30',
      isSample: true,
    }
    expect(metaLine(meta)).toBe('Whole company · 1 Oct 2025 – 30 Sep 2026 · As of 30 Sep 2026')
    expect(stampLine(meta)).toBe('Company confidential · Sample data')
    expect(stampLine({ isSample: false })).toBe('Company confidential')
  })
})

describe('visibleColumns', () => {
  const cols = [
    { key: 'a', label: 'A' },
    { key: 'pay', label: 'Salary', pay: true },
    { key: 'cr', label: 'Compa-ratio', pay: false },
  ]
  it('drops pay amounts unless pay is shown', () => {
    expect(visibleColumns(cols, false).map((c) => c.key)).toEqual(['a', 'cr'])
    expect(visibleColumns(cols, true).map((c) => c.key)).toEqual(['a', 'pay', 'cr'])
  })
  it('returns a copy', () => {
    expect(visibleColumns(cols, true)).not.toBe(cols)
  })
})

describe('plainText', () => {
  it('writes parse-friendly values', () => {
    expect(plainText(0.1234, 'pct')).toBe('12.34%')
    expect(plainText(0.021, 'pts')).toBe('2.1')
    expect(plainText(1234.567, 'moneyFull')).toBe('1234.57')
    expect(plainText(41.6, 'int')).toBe('42')
    expect(plainText(0.1 + 0.2, 'num2')).toBe('0.3')
    expect(plainText(null, 'int')).toBe('')
    expect(plainText(Number.NaN, 'int')).toBe('')
    expect(plainText(true, undefined)).toBe('Yes')
    expect(plainText('2026-09-30', 'date')).toBe('2026-09-30')
  })
})

describe('data standard and tier lines', () => {
  it('names the standard with the tiers it admits', () => {
    expect(standardLine('gold')).toBe('Data standard: Production (gold only)')
    expect(standardLine('silver')).toBe('Data standard: Validated (silver and up)')
    expect(standardLine('bronze')).toBe('Data standard: Everything (bronze and up)')
  })
  it('adds the tier, and says when the standard holds the figure back', () => {
    expect(dataLine('bronze', 'silver')).toBe('Data standard: Everything (bronze and up) · Tier: Silver')
    expect(dataLine('gold', 'bronze', true)).toBe(
      'Data standard: Production (gold only) · Tier: Bronze, not shown under this standard',
    )
    expect(dataLine('silver')).toBe('Data standard: Validated (silver and up)')
    expect(dataLine(undefined, 'gold')).toBe('Tier: Gold')
    expect(dataLine(undefined, null)).toBeNull()
  })
})

describe('imageFooter', () => {
  const meta = { scope: 'Whole company', asOf: '2026-09-30', isSample: true }
  it('adds the tier when the figure has one', () => {
    expect(imageFooter(meta)).toBe('Whole company · As of 30 Sep 2026 · Census · Sample data')
    expect(imageFooter(meta, 'silver')).toBe(
      'Whole company · As of 30 Sep 2026 · Tier: Silver · Census · Sample data',
    )
  })

  it('states the data standard in force, as sheets and slides do', () => {
    expect(imageFooter({ ...meta, standard: 'gold' }, 'gold')).toBe(
      'Whole company · As of 30 Sep 2026 · Production standard · Tier: Gold · Census · Sample data',
    )
  })
})

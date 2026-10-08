/**
 * Finance's rounding of cost amounts (docs/ROLES-V2.md 3.2, rule 8): the rounding itself, how a
 * rounded amount reads on screen ('moneyM'), and that every export writes the rounded amount and
 * nothing finer (CSV, the clipboard, Excel, slides).
 */
import { describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import { plainText } from '@/lib/export/columns'
import { toCsv } from '@/lib/export/csv'
import { excelValue } from '@/lib/export/xlsx'
import {
  addedSteps,
  COST_STEP,
  costIn,
  costRange,
  isRoundedCost,
  perHeadOfRounded,
  ratioOf,
  roundCost,
  roundCostOrNull,
  sumRounded,
  UNDER_COST_STEP,
} from './costRounding'
import { excelNumFmt, fmt, fmtDelta } from './format'

describe('sumRounded', () => {
  it('adds amounts rounded on their own, with a step for every two of $100,000 or more', () => {
    expect(sumRounded([])).toBe(0)
    expect(sumRounded([7_300_000])).toBe(7_300_000)
    expect(sumRounded([7_300_000, 4_500_000])).toBe(11_900_000)
    expect(sumRounded([7_300_000, 4_500_000, 200_000])).toBe(12_100_000)
    // Amounts under a step add no step, so a sum of nothing stays nothing.
    expect(sumRounded([0, 0, 0])).toBe(0)
    expect(sumRounded([0, 0, 300_000])).toBe(300_000)
    expect(addedSteps(6)).toBe(300_000)
    expect(addedSteps(5)).toBe(200_000)
    expect(addedSteps(1)).toBe(0)
  })

  it('stays on the grid and within its reading of the exact total, and does not read low', () => {
    // Six business units, each rounded down: the plain sum reads about $0.3M low, this does not.
    let seed = 7
    const rand = () => {
      seed = (seed * 16_807) % 2_147_483_647
      return seed / 2_147_483_647
    }
    let plain = 0
    let summed = 0
    const runs = 2_000
    for (let i = 0; i < runs; i++) {
      const exact = Array.from({ length: 6 }, () => 200_000 + rand() * 9_000_000)
      const truth = exact.reduce((a, b) => a + b, 0)
      const rounded = exact.map(roundCost)
      const v = sumRounded(rounded)
      expect(isRoundedCost(v)).toBe(true)
      // What it says: at or above it less the steps added, under that plus a step a unit.
      const added = addedSteps(rounded.filter((r) => r >= COST_STEP).length)
      expect(truth >= v - added && truth < v - added + 6 * COST_STEP).toBe(true)
      plain += truth - rounded.reduce((a, b) => a + b, 0)
      summed += truth - v
    }
    expect(plain / runs).toBeGreaterThan(250_000)
    expect(Math.abs(summed / runs)).toBeLessThan(25_000)
  })
})

describe('roundCost', () => {
  it('rounds down to a whole $100,000, and anything under $100,000 to 0', () => {
    expect(roundCost(12_345_678)).toBe(12_300_000)
    expect(roundCost(12_399_999)).toBe(12_300_000)
    expect(roundCost(12_400_000)).toBe(12_400_000)
    expect(roundCost(456_000)).toBe(400_000)
    expect(roundCost(199_999)).toBe(100_000)
    expect(roundCost(100_000)).toBe(100_000)
    expect(roundCost(99_999)).toBe(0)
    expect(roundCost(0)).toBe(0)
    // Toward zero for a difference.
    expect(roundCost(-260_000)).toBe(-200_000)
    expect(roundCost(-40_000)).toBe(0)
    expect(Object.is(roundCost(-40_000), 0)).toBe(true)
    expect(roundCostOrNull(null)).toBeNull()
    expect(costIn(123_456, false)).toBe(123_456)
    expect(costIn(123_456, true)).toBe(100_000)
    expect(costIn(null, true)).toBeNull()
  })

  it('says which exact amounts a rounded one stands for: one $100,000 step of one grid', () => {
    expect(costRange(0)).toEqual([0, COST_STEP])
    expect(costRange(100_000)).toEqual([100_000, 200_000])
    expect(costRange(12_300_000)).toEqual([12_300_000, 12_400_000])
    // Every exact amount lands in the step of its rounded amount, and every step is on the grid.
    for (let v = 0; v < 3_000_000; v += 7_919) {
      const [lo, hi] = costRange(roundCost(v))
      expect(v >= lo && v < hi, String(v)).toBe(true)
      expect(isRoundedCost(lo) && isRoundedCost(hi)).toBe(true)
    }
  })

  it('keeps any sum or difference of rounded amounts on the grid, never narrower than a step', () => {
    // Exact amounts a, b, c behind three rounded totals; a − b − c is what a three-way difference
    // says, a − b a two-way one. Every bound is a whole $100,000, so laid over each other the
    // interval cannot shrink under $100,000 around the truth.
    const amounts = [1_234_567, 987_654, 155_555, 12_049_999, 64_000]
    for (const a of amounts)
      for (const b of amounts)
        for (const c of amounts) {
          const [alo, ahi] = costRange(roundCost(a))
          const [blo, bhi] = costRange(roundCost(b))
          const [clo, chi] = costRange(roundCost(c))
          const two: [number, number] = [alo - bhi, ahi - blo]
          const three: [number, number] = [alo - bhi - chi, ahi - blo - clo]
          for (const end of [...two, ...three]) expect(isRoundedCost(end)).toBe(true)
          expect(a - b > two[0] && a - b < two[1]).toBe(true)
          expect(a - b - c > three[0] && a - b - c < three[1]).toBe(true)
        }
  })

  it('works ratios out from the rounded amounts', () => {
    expect(ratioOf(1_760_000, 50_340_000, true)).toBeCloseTo(1_700_000 / 50_300_000, 12)
    expect(ratioOf(1_760_000, 50_340_000, false)).toBeCloseTo(1_760_000 / 50_340_000, 12)
    expect(ratioOf(10, 40_000, true)).toBeNull()
    // Per employee: the rounded total over the people, to the nearest $1,000.
    expect(perHeadOfRounded(1_100_000, 6)).toBe(183_000)
    expect(perHeadOfRounded(0, 6)).toBeNull()
    expect(perHeadOfRounded(1_100_000, 0)).toBeNull()
  })
})

describe("the 'moneyM' format", () => {
  it('reads in millions to one decimal, and under the step as words', () => {
    expect(fmt(12_300_000, 'moneyM')).toBe('$12.3M')
    expect(fmt(400_000, 'moneyM')).toBe('$0.4M')
    expect(fmt(roundCost(456_000), 'moneyM')).toBe('$0.4M')
    expect(fmt(1_234_500_000, 'moneyM')).toBe('$1,234.5M')
    expect(fmt(0, 'moneyM')).toBe(UNDER_COST_STEP)
    expect(fmt(-200_000, 'moneyM')).toBe('−$0.2M')
    expect(fmt(null, 'moneyM')).toBe('—')
    expect(UNDER_COST_STEP).toBe('under $0.1M')
  })

  it('reads a difference with its sign, and one under the step as words', () => {
    expect(fmtDelta(200_000, 'moneyM')).toBe('+$0.2M')
    expect(fmtDelta(-1_300_000, 'moneyM')).toBe('−$1.3M')
    expect(fmtDelta(0, 'moneyM')).toBe('under $0.1M')
  })

  it('exports the rounded amount and nothing finer, in every format', () => {
    type Row = { group: string; usd: number | null }
    const columns: Column<Row>[] = [
      { key: 'group', label: 'Group', format: 'text' },
      { key: 'usd', label: 'Target cash (USD)', format: 'moneyM', cost: true },
    ]
    const rows: Row[] = [
      { group: 'A', usd: 12_300_000 },
      { group: 'B', usd: 0 },
      { group: 'C', usd: null },
    ]
    // CSV and the clipboard: the number, or the words under the step (never a 0 that reads as no cost).
    const csv = toCsv({ columns, rows }, { showPay: false, showCost: true, bom: false }).split('\r\n')
    expect(csv.slice(0, 4)).toEqual(['Group,Target cash (USD)', 'A,12300000', 'B,under $0.1M', 'C,'])
    expect(plainText(400_000, 'moneyM')).toBe('400000')
    // Excel: the number in millions, or the words.
    expect(excelValue(12_300_000, 'moneyM')).toBe(12_300_000)
    expect(excelValue(0, 'moneyM')).toBe(UNDER_COST_STEP)
    expect(excelNumFmt('moneyM')).toBe('"$"#,##0.0,,"M";"−$"#,##0.0,,"M"')
    // Without cost totals the column is dropped, as every cost column is.
    expect(toCsv({ columns, rows }, { showPay: false, showCost: false, bom: false }).split('\r\n')[0]).toBe(
      'Group',
    )
  })
})

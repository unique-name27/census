/**
 * People stats wording names a setting's default as a default ("12 by default"), so the
 * dictionary, popovers and exports stay true when someone changes it: a sentence that quotes the
 * default of a setting the metric is calculated with also says "default".
 */
import { describe, expect, it } from 'vitest'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { metricsWith } from '@/metrics/testing'
import type { ParamDef } from '@/metrics/types'
import { metrics } from '../metrics'
import { definitionText } from './wording'

/** How a default can read in a sentence: "12", "365 days", "20%", "3 pts", "1.75 times". */
function spellings(p: ParamDef): string[] {
  const v = p.default
  if (typeof v !== 'number') return []
  if (p.type === 'percent') {
    const pct = +(v * 100).toPrecision(6)
    return [`${pct}%`, `${pct} pts`, `${pct} pt`]
  }
  if (p.type === 'days') return [`${v} days`, `${v} d`]
  if (p.type === 'months') return [`${v} months`]
  return [String(v)]
}

const sentences = (text: string | undefined): string[] =>
  (text ?? '').split(/(?<=\.)\s+/).filter((s) => s.trim())

describe('People stats wording', () => {
  it('quotes a setting default only as a default', () => {
    const m = defaultMetrics()
    const problems: string[] = []
    for (const d of metrics) {
      const params = m.sourcesOf(d.id).flatMap((id) => CATALOG.byId.get(id)?.params ?? [])
      for (const field of ['definition', 'formula', 'population'] as const)
        for (const s of sentences(d[field]))
          for (const p of params)
            for (const word of spellings(p)) {
              const at = new RegExp(`(^|[^\\d.])${word.replace(/[.%]/g, (c) => `\\${c}`)}(?![\\d.]\\d)`)
              if (at.test(s) && !/default/i.test(s))
                problems.push(`${d.id} ${field}: "${s}" quotes ${p.key} ${word}`)
            }
    }
    expect(problems).toEqual([])
  })

  it('adds the value in force to a popover when a setting changes', () => {
    const m = metricsWith({ 'hrbp.attrition.firstYear': { days: 180 } })
    expect(definitionText(m, 'hrbp.attrition.firstYear')).toMatch(
      /365 days by default.*Changed setting: First-year window 180 d \(default 365 d\)\.$/,
    )
  })
})

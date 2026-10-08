/**
 * The Level pyramid's readout (docs/ANALYSES.md, 5.6): a bulge, a thin individual level, an
 * inverted step from L4 up, a management span outside the Org chart's band, and a top-heavy
 * business unit. Ranked by severity, then impact. Each finding carries its metric, its fields,
 * the records behind its number and, where it is a level or a unit, the scope to focus on.
 */
import type { Finding, Severity } from '@/components/types'
import type { Employee, Level } from '@/data/schema'
import { LEVELS } from '@/data/schema'
import { groupFilter } from '@/drill/filter'
import { fmt } from '@/lib/format'
import { isActiveAt } from '@/lib/people'
import { count, sentence } from '../../../engine/base'
import { employeesOnSpec, scopePart, titled } from '../../../engine/drill'
import { tagFindings } from '../../../engine/drillUses'
import { levelsSpec, pyramidExtra, rowSpec, spanSpec } from './drill'
import { FINDINGS } from './lineage'
import { PYRAMID_METRIC, PYRAMID_SET } from './metrics'
import { BANDS, INDIVIDUAL_LEVELS, type LevelRow, type PyramidData } from './model'

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** Levels at or above Senior: L5, L6, M1, M2, E1 to E3. */
export const SENIOR_AND_UP: readonly Level[] = BANDS.filter((b) =>
  ['senior', 'management', 'executive'].includes(b.key),
).flatMap((b) => b.levels)

/** "a third", "half", "a quarter", or "34%" of something. */
export function fractionWords(r: number): string {
  const named: [number, string][] = [
    [1 / 2, 'half'],
    [1 / 3, 'a third'],
    [1 / 4, 'a quarter'],
    [1 / 5, 'a fifth'],
  ]
  // Within 5% of a simple fraction ("a third" for 0.34), else the percentage.
  for (const [v, w] of named) if (Math.abs(r - v) <= 0.05 * v) return w
  return fmt(r, 'pct0')
}

/** A thin level's size against the level above in words, never the same words as the threshold. */
export const thinnestWords = (ratio: number, threshold: number): string => {
  const w = fractionWords(ratio)
  return w === fractionWords(threshold) ? fmt(ratio, 'pct0') : w
}

const people = (n: number) => count(n, 'person', 'people')
const wereWas = (n: number) => (n === 1 ? 'was' : 'were')

/** A company-wide senior and up share per job function, for the expected mix of a unit. */
function expectedSeniorShare(d: PyramidData, members: readonly Employee[], minCell: number): number | null {
  const { asOf } = d
  const company = d.prep.companyEmps.filter((e) => isActiveAt(e, asOf) && e.level)
  if (!company.length || !members.length) return null
  const isSenior = (e: Employee) => !!e.level && SENIOR_AND_UP.includes(e.level)
  const overall = company.filter(isSenior).length / company.length
  const by = new Map<string, { n: number; senior: number }>()
  for (const e of company) {
    const f = e.jobFunction
    if (!f) continue
    const c = by.get(f) ?? { n: 0, senior: 0 }
    c.n++
    if (isSenior(e)) c.senior++
    by.set(f, c)
  }
  let sum = 0
  for (const e of members) {
    const c = e.jobFunction ? by.get(e.jobFunction) : undefined
    sum += c && c.n >= minCell ? c.senior / c.n : overall
  }
  return sum / members.length
}

/** Cells of the expected mix need this many people company-wide, as the other analyses' mix does. */
export const MIN_CELL = 10

export function pyramidFindings(d: PyramidData): Finding[] {
  const p = d.prep
  const m = p.ctx.metrics
  const num = (ref: { metricId: string; key: string }) => m.num(ref.metricId, ref.key)
  const bulgeGap = num(PYRAMID_SET.bulgeGap)
  const minLevel = num(PYRAMID_SET.minLevel)
  const thinRatio = num(PYRAMID_SET.thinRatio)
  const topHeavyGap = num(PYRAMID_SET.topHeavyGap)
  const minUnit = num(PYRAMID_SET.minUnit)
  const tolerance = num(PYRAMID_SET.tolerance)
  const min = p.set.minGroup
  const uses = p.uses(FINDINGS)
  const rows = d.main.rows
  const at = new Map(rows.map((r) => [r.level, r]))
  const flowAt = new Map(d.flow.map((f) => [f.level, f]))
  const year = Number(d.asOf.slice(0, 4)) + 1
  const out: (Finding & { impact: number })[] = []
  const metricId = PYRAMID_METRIC.findings

  /* 1. Bulge: a level that grew well above the workforce. */
  if (d.workforceGrowth != null) {
    const wf = d.workforceGrowth
    for (const r of rows) {
      if (r.today < minLevel || r.growth == null || r.yearAgo == null) continue
      const gap = r.growth - wf
      if (gap < bulgeGap) continue
      const f = flowAt.get(r.level)
      const above = LEVELS[LEVELS.indexOf(r.level) + 1]
      const dest = new Set(f?.records.promotedOut.map((c) => c.toLevel) ?? [])
      const outWords = f?.promotedOut
        ? `${f.promotedOut.toLocaleString('en-US')} ${wereWas(f.promotedOut)} promoted ${dest.size === 1 ? `to ${[...dest][0]}` : 'out of it'}`
        : 'none were promoted out of it'
      const detail = f
        ? sentence(
            `${people(f.hired)} ${wereWas(f.hired)} hired at ${r.level} and ${f.promotedIn.toLocaleString('en-US')} promoted into it; ${outWords} and ${f.left.toLocaleString('en-US')} left${
              f.other ? `, and ${people(Math.abs(f.other))} moved by other changes` : ''
            }`,
          )
        : undefined
      const grewBy = f && f.hired >= f.promotedIn ? 'that hired at' : 'that promoted into'
      out.push({
        id: `hrbp-pyramid-bulge-${r.level}`,
        metricId,
        severity: 'warning',
        title: sentence(
          `${r.level} grew ${fmt(r.growth, 'pct0')} in 12 months, from ${r.yearAgo.toLocaleString('en-US')} to ${r.today.toLocaleString('en-US')}, while the workforce grew ${fmt(wf, 'pct0')}`,
        ),
        detail,
        action: above
          ? `Plan ${above} promotion capacity for ${year} with the business units ${grewBy} ${r.level}.`
          : `Plan ${r.level} roles for ${year} with the business units ${grewBy} it.`,
        filter: groupFilter('level', r.level),
        drill: () => rowSpec(d, r),
        uses,
        impact: gap,
      })
    }
  }

  /* 2. Thin level: an individual level under the thin ratio of the level above it. */
  {
    let thin: { r: LevelRow; above: LevelRow; ratio: number } | null = null
    for (let i = 0; i < INDIVIDUAL_LEVELS.length - 1; i++) {
      const r = at.get(INDIVIDUAL_LEVELS[i])
      const above = at.get(INDIVIDUAL_LEVELS[i + 1])
      // An empty level is absent rather than thin; the level above must be big enough to compare with.
      if (!r?.today || !above || above.today < minLevel) continue
      const ratio = r.today / above.today
      if (ratio < thinRatio && (!thin || ratio < thin.ratio)) thin = { r, above, ratio }
    }
    if (thin) {
      const { r, above, ratio } = thin
      // "Under half the size of L2: … half of L2" would contradict itself; say the percentage then.
      const of = thinnestWords(ratio, thinRatio)
      const individual = INDIVIDUAL_LEVELS.map((l) => at.get(l)?.today ?? 0).filter((n) => n > 0)
      const thinnest = r.today <= Math.min(...individual)
      const entry = BANDS[0]
      const entryCount = entry.levels.reduce((a, l) => a + (at.get(l)?.today ?? 0), 0)
      const entryShare = d.main.total >= min ? entryCount / d.main.total : null
      const changed =
        r.change == null
          ? ''
          : r.change < 0
            ? `, and ${r.level} shrank by ${Math.abs(r.change).toLocaleString('en-US')} in a year`
            : r.change > 0
              ? `, and ${r.level} grew by ${r.change.toLocaleString('en-US')} in a year`
              : `, and ${r.level} held steady in a year`
      out.push({
        id: 'hrbp-pyramid-thin',
        metricId,
        severity: 'info',
        title: sentence(
          `${r.level} is ${thinnest ? 'the thinnest individual level' : `under ${fractionWords(thinRatio)} the size of ${above.level}`}: ${people(r.today)}, ${of} of ${above.level} (${above.today.toLocaleString('en-US')})`,
        ),
        detail:
          entryShare == null
            ? undefined
            : sentence(`Entry levels are ${fmt(entryShare, 'pct')} of employees${changed}`),
        action:
          r.level === 'L1' || r.level === 'L2'
            ? 'Check that entry-level hiring matches the plan for growing future senior engineers.'
            : `Check the promotion pipeline into ${above.level} with the business units that rely on it.`,
        filter: groupFilter('level', r.level),
        drill: () => rowSpec(d, r),
        uses,
        impact: 1 - ratio,
      })
    }
  }

  /* 3. Inverted step from L4 up: larger than the level below by more than the tolerance. */
  for (const q of d.ratios) {
    if (!q.individual || q.ratio == null || !q.inverted) continue
    if (INDIVIDUAL_LEVELS.indexOf(q.upper[0]) < INDIVIDUAL_LEVELS.indexOf('L4')) continue
    out.push({
      id: `hrbp-pyramid-inverted-${q.upper[0]}`,
      metricId,
      severity: 'warning',
      title: sentence(
        `${q.upper[0]} is ${fmt(q.ratio, 'times')} the size of ${q.lower[0]}: ${people(q.upperCount)} against ${q.lowerCount.toLocaleString('en-US')}`,
      ),
      detail: sentence(
        `On the individual track a level is usually no larger than the one below it; a level more than ${fmt(1 + tolerance, 'times')} the one below counts as an inverted step`,
      ),
      action: `Review how ${q.upper[0]} is assigned at hire and at promotion with the business units involved.`,
      filter: groupFilter('level', [...q.upper, ...q.lower]),
      filterLabel: `${q.upper[0]} and ${q.lower[0]}`,
      drill: () => levelsSpec(d, [...q.upper, ...q.lower], q.records),
      uses,
      impact: q.ratio - 1,
    })
  }

  /* 4. Span outside the band: a management level's median at the narrow or wide span. */
  const { wide, narrow } = p.set.spanOutliers
  for (const s of d.spans) {
    if (s.median == null || !s.flag) continue
    const where =
      s.flag === 'wide'
        ? `at or above the Org chart's wide span (${wide})`
        : `at or below the Org chart's narrow span (${narrow})`
    const reports = s.records.reduce((a, x) => a + x.directs, 0)
    out.push({
      id: `hrbp-pyramid-span-${s.key}`,
      metricId,
      severity: 'warning',
      title: sentence(
        `${s.key.replace('-', ' to ')} managers have a median span of ${fmt(s.median, 'num1').replace(/\.0$/, '')}, ${where}`,
      ),
      detail: sentence(
        `${count(s.managers, 'manager', 'managers')} at ${s.key.replace('-', ' to ')} lead ${people(reports)} directly`,
      ),
      action: `Review spans at ${s.key.replace('-', ' to ')} with the business unit leaders in the next org design review.`,
      drill: () => spanSpec(d, s),
      uses,
      impact: s.flag === 'wide' ? s.median - wide : narrow - s.median + 1,
    })
  }

  /* 5. Top-heavy unit: senior, management and executive share well above the company's. */
  {
    const companyRows = d.mix.filter((r) => r.company)
    const companyTotal = companyRows[0]?.groupTotal ?? 0
    const seniorKeys = new Set(['senior', 'management', 'executive'])
    const companyShare =
      companyTotal >= min
        ? companyRows.filter((r) => seniorKeys.has(r.band)).reduce((a, r) => a + r.people, 0) / companyTotal
        : null
    const units = new Map<string, { total: number; senior: Employee[]; all: Employee[] }>()
    for (const e of p.emps) {
      if (!isActiveAt(e, d.asOf) || !e.level || !e.businessUnit) continue
      const u = units.get(e.businessUnit) ?? { total: 0, senior: [], all: [] }
      u.total++
      u.all.push(e)
      if (SENIOR_AND_UP.includes(e.level)) u.senior.push(e)
      units.set(e.businessUnit, u)
    }
    if (companyShare != null)
      for (const [unit, u] of units) {
        if (u.total < minUnit) continue
        const share = u.senior.length / u.total
        const gap = share - companyShare
        if (gap < topHeavyGap) continue
        const expected = expectedSeniorShare(d, u.all, Math.max(MIN_CELL, min))
        const explained = expected != null && share - expected < topHeavyGap / 2
        out.push({
          id: `hrbp-pyramid-top-heavy-${unit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          metricId,
          severity: 'info',
          title: sentence(
            `${fmt(share, 'pct')} of ${unit} is at senior, management or executive levels, ${fmt(gap, 'pts').replace(/^\+/, '')} above the company (${fmt(companyShare, 'pct')})`,
          ),
          detail:
            expected == null
              ? undefined
              : sentence(
                  `The company's own mix for the same job functions would put it at ${fmt(expected, 'pct')}${explained ? ', so its job functions explain most of the gap' : ''}`,
                ),
          action: explained
            ? `Compare leveling in ${unit} with the same job functions elsewhere before treating it as top-heavy.`
            : `Review leveling at hire and promotion in ${unit} against the same job functions elsewhere.`,
          filter: groupFilter('businessUnit', unit),
          drill: () =>
            employeesOnSpec(p, d.asOf, {
              title: titled(`Senior, management and executive levels in ${unit}`, scopePart(p)),
              rows: u.senior,
              extra: pyramidExtra(d),
              note: `${people(u.senior.length)} at L5 and above, of ${u.total.toLocaleString('en-US')} in the unit.`,
            }),
          uses,
          impact: gap,
        })
      }
  }

  out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.impact - a.impact)
  return tagFindings(out.map(({ impact: _impact, ...f }) => f))
}

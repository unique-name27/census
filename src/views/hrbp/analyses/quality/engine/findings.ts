/**
 * Quality of hire's readout (docs/ANALYSES.md, 2.7): groups clearly above or below the company,
 * strong first reviews with weak retention, the lowest degree and field cell, and education
 * coverage. Findings are about groups and programs: they name no hire (`people` stays empty),
 * and their actions never suggest choosing or avoiding a school. Ranked by severity, then impact.
 */
import type { Finding, Severity } from '@/components/types'
import type { Hire } from './cohort'
import type { DrillScope } from './drill'
import { hiresSpec } from './drill'
import type { DegreeFieldCell, GroupScore } from './groups'
import { QID } from './metrics'
import type { QualitySettings } from './settings'
import { hiresText, pctText, pointsText, scoreText } from './wording'

/** Which cut a group comes from. */
export type SubjectKind = 'university' | 'degree' | 'field' | 'source'

export interface Subject {
  kind: SubjectKind
  g: GroupScore
}

const DEGREE_WORDS: Record<string, string> = {
  Associate: 'Hires with an associate degree',
  "Bachelor's": "Hires with a bachelor's degree",
  "Master's": "Hires with a master's degree",
  PhD: 'Hires with a PhD',
  Other: 'Hires with another qualification',
}

const SOURCE_WORDS: Record<string, string> = {
  Referral: 'Hires from referrals',
  Sourced: 'Sourced hires',
  'Careers site': 'Hires from the careers site',
  'Job board': 'Hires from job boards',
  Agency: 'Hires from agencies',
  University: 'Hires from university recruiting',
  Internal: 'Internal hires',
}

/** "Hires from Coyote Valley University", "Hires with a PhD", "Hires who studied physics". */
export function subjectText(s: Subject): string {
  switch (s.kind) {
    case 'university':
      return `Hires from ${s.g.label}`
    case 'degree':
      return DEGREE_WORDS[s.g.label] ?? `Hires with a ${s.g.label} degree`
    case 'field':
      return `Hires who studied ${s.g.label.toLowerCase()}`
    case 'source':
      return SOURCE_WORDS[s.g.label] ?? `Hires from ${s.g.label}`
  }
}

const ACTION_ABOVE: Record<SubjectKind, string> = {
  university:
    'Find out what this campus program does differently, such as internships, team placement or onboarding, and share it with the other programs.',
  degree:
    'Find out what helps these hires do well, such as team placement or onboarding, and share it with the hiring managers of other new hires.',
  field:
    'Find out what helps these hires do well, such as team placement or onboarding, and share it with the hiring managers of other new hires.',
  source:
    'Find out what this source does well, such as how candidates are briefed and matched to teams, and share it with the recruiters.',
}

const ACTION_BELOW: Record<SubjectKind, string> = {
  university:
    'Review the first year for hires from this program with their managers, such as onboarding, team placement and early support.',
  degree: 'Review role scope and onboarding for these hires with their hiring managers.',
  field: 'Review role scope and onboarding for these hires with their hiring managers.',
  source: 'Review with the recruiters how candidates from this source are matched to roles and onboarded.',
}

export interface FindingInputs {
  s: QualitySettings
  d: DrillScope
  isCompany: boolean
  scope: GroupScore
  company: GroupScore
  subjects: readonly Subject[]
  cells: readonly DegreeFieldCell[]
  /** The scope's cohort, for education coverage. */
  hires: readonly Hire[]
  /** Some row of Employees has a university or a degree level (else the figures say what to add). */
  educationLoaded: boolean
  uses: {
    groups: Record<SubjectKind, Finding['uses']>
    cells: Finding['uses']
    education: Finding['uses']
  }
}

interface Ranked extends Finding {
  impact: number
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** Rule 1: groups whose interval excludes the company, far from it and from their expected score. */
function clearlyApart(x: FindingInputs): Ranked[] {
  const c = x.company.q
  if (c == null) return []
  const gap = x.s.minGap
  return (
    x.subjects
      .flatMap((sub) => {
        const g = sub.g
        if (g.kind !== 'value' || g.q == null || g.expected == null || g.status === 'unclear') return []
        const vsCompany = g.q - c
        const vsExpected = g.q - g.expected
        const same = Math.sign(vsCompany) === Math.sign(vsExpected)
        if (Math.abs(vsCompany) < gap || Math.abs(vsExpected) < gap / 2 || !same) return []
        const above = g.status === 'above'
        const parts = [
          `${hiresText(g.n)}.`,
          g.r != null && g.p != null
            ? `${pctText(g.r)} stayed a year and their first reviews averaged ${scoreText(g.p)}.`
            : null,
          `Hires at the same sites and levels score ${scoreText(g.expected)}.`,
        ].filter(Boolean)
        return [
          {
            id: `hrbp-quality-${above ? 'above' : 'below'}-${sub.kind}-${g.key}`,
            metricId: QID.findings,
            severity: (above ? 'good' : 'warning') as Severity,
            title: `${subjectText(sub)} score ${scoreText(g.q)} on quality of hire, ${pointsText(vsCompany)} ${above ? 'above' : 'below'} the company.`,
            detail: parts.join(' '),
            action: (above ? ACTION_ABOVE : ACTION_BELOW)[sub.kind],
            drill: () => hiresSpec(x.d, `Scored hires, ${g.label}`, g.scored),
            uses: x.uses.groups[sub.kind],
            impact: Math.abs(vsExpected) * g.n,
            kind: sub.kind,
          },
        ]
      })
      .sort((a, b) => b.impact - a.impact)
      .filter((f, i, all) => all.findIndex((g) => g.kind === f.kind) === i)
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
      .slice(0, 2)
      // Kept in that order within their severity: the university first.
      .map(({ kind: _, ...f }, i) => ({ ...f, impact: 1e9 - i }))
  )
}

/** Rule 1 names one group per grouping, universities first (the lead figure's), at most two. */
const KIND_ORDER: readonly SubjectKind[] = ['university', 'degree', 'field', 'source']

/** The site most of a group's hires are at (80% or more), or null. */
function mainSite(g: GroupScore): string | null {
  const n = new Map<string, number>()
  for (const h of g.scored) n.set(h.site, (n.get(h.site) ?? 0) + 1)
  const [site, k] = [...n].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  return site && k >= 0.8 * g.scored.length ? site : null
}

/** Rule 2: first reviews well above the company, retention well below it. */
function strongReviewsWeakRetention(x: FindingInputs): Ranked[] {
  const cp = x.company.p
  const cr = x.company.r
  if (cp == null || cr == null) return []
  const hits = x.subjects
    .filter(
      (sub) =>
        sub.g.kind === 'value' &&
        sub.g.p != null &&
        sub.g.r != null &&
        sub.g.p >= cp + 8 &&
        sub.g.r <= cr - 0.1,
    )
    .sort((a, b) => (b.g.p as number) - (a.g.p as number) || b.g.n - a.g.n)
  const top = hits[0]
  if (!top) return []
  const g = top.g
  const p = g.p as number
  const r = g.r as number
  const strongest = x.subjects
    .filter((s) => s.kind === top.kind && s.g.kind === 'value' && s.g.p != null)
    .every((s) => s === top || (s.g.p as number) < p)
  const sited = g.gap != null && Math.abs(g.gap) < x.s.minGap
  const site = sited ? mainSite(g) : null
  const q = g.q == null ? null : scoreText(g.q)
  const e = g.expected == null ? null : scoreText(g.expected)
  let detail: string
  let action: string
  if (sited && site) {
    detail = `Their quality of hire, ${q}, matches other ${site} hires at the same levels (${e}).`
    action = `Treat this as a ${site} retention question: see Attrition in People stats.`
  } else if (sited) {
    detail = `Their quality of hire, ${q}, matches hires at the same sites and levels (${e}).`
    action = 'Treat this as a retention question for those sites: see Attrition in People stats.'
  } else {
    detail = `Their quality of hire is ${q}, against ${e} for hires at the same sites and levels.`
    action =
      'Look at the first year for these hires with their managers: onboarding, team placement and early pay.'
  }
  return [
    {
      id: `hrbp-quality-reviews-retention-${top.kind}-${g.key}`,
      metricId: QID.findings,
      severity: 'warning',
      title: `${subjectText(top)} have ${strongest ? 'the strongest' : 'strong'} first reviews (${scoreText(p)}), but only ${pctText(r)} stayed a year.`,
      detail,
      action,
      ...(sited ? { tab: 'attrition' } : {}),
      ...(site ? { filter: { location: [site] } } : {}),
      drill: () =>
        hiresSpec(x.d, `Hires with a retention score, ${g.label}`, g.retained, { order: 'notStayedFirst' }),
      uses: x.uses.groups[top.kind],
      impact: (cr - r) * g.n * 100,
    },
  ]
}

/**
 * Where a list's hires work, by job function (else department), said only as far as it is true:
 * "Most work in X and Y" when two functions hold more than half of them and the second holds a
 * fifth or more, "Most work in X" when one does, else the largest with its count, and nothing
 * when the largest is tied: never one of several tied functions. `most` names the functions for
 * the action, in the first two cases only.
 */
export function functionMix(hires: readonly Hire[]): { sentence: string | null; most: string[] } {
  const n = new Map<string, number>()
  for (const h of hires) {
    const v = h.e.jobFunction || h.e.department
    if (v) n.set(v, (n.get(v) ?? 0) + 1)
  }
  const ranked = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const count = (i: number) => ranked[i]?.[1] ?? 0
  const total = hires.length
  const most = (k: number) => {
    const names = ranked.slice(0, k).map(([v]) => v)
    return { sentence: `Most work in ${names.join(' and ')}.`, most: names }
  }
  const second = count(1)
  if ((count(0) + second) * 2 > total && second >= Math.max(2, 0.2 * total) && second > count(2))
    return most(2)
  if (count(0) * 2 > total) return most(1)
  const top = ranked[0]
  if (!top || top[1] < 2 || count(0) === second) return { sentence: null, most: [] }
  return { sentence: `${top[1]} of them work in ${top[0]}, more than anywhere else.`, most: [] }
}

const fieldWords = (field: string) => (field === 'Other fields' ? 'other fields' : field.toLowerCase())
const degreeWords = (d: string) => (d === 'Other' ? 'Other qualification' : d)

/** Rule 3: the lowest degree and field cell, well below the company. */
function lowCell(x: FindingInputs): Ranked[] {
  const c = x.company.q
  if (c == null) return []
  const low = x.cells
    .filter((cell) => cell.q != null && cell.n >= x.s.minCellHires && cell.q <= c - 2 * x.s.minGap)
    .sort((a, b) => (a.q as number) - (b.q as number) || b.n - a.n)[0]
  if (!low) return []
  const q = low.q as number
  const peer = x.cells
    .filter((cell) => cell.degree === low.degree && cell !== low && cell.q != null)
    .sort((a, b) => b.n - a.n)[0]
  const against = peer
    ? `against ${scoreText(peer.q as number)} for ${fieldWords(peer.field)}`
    : `against ${scoreText(c)} for the company`
  const fns = functionMix(low.scored)
  const where = x.isCompany ? '' : ' in this scope'
  const detail = [
    low.r != null && low.p != null
      ? `${hiresText(low.n)}: ${pctText(low.r)} stayed a year and their first reviews averaged ${scoreText(low.p)}.`
      : `${hiresText(low.n)}.`,
    fns.sentence,
  ]
    .filter(Boolean)
    .join(' ')
  return [
    {
      id: `hrbp-quality-cell-${low.degree}-${low.field}`,
      metricId: QID.findings,
      severity: 'warning',
      title: `${degreeWords(low.degree)} hires in ${fieldWords(low.field)} score ${scoreText(q)}${where}, ${against}.`,
      detail,
      action: fns.most.length
        ? `Check that role scope and onboarding for ${fieldWords(low.field)} graduates in ${fns.most.join(' and ')} roles are clear.`
        : `Check that role scope and onboarding for ${fieldWords(low.field)} graduates are clear.`,
      drill: () => hiresSpec(x.d, `Scored hires, ${low.degree} in ${low.field}`, low.scored),
      uses: x.uses.cells,
      impact: (c - q) * low.n,
    },
  ]
}

/** "Go-to-Market", "Go-to-Market and Corporate", "A, B and C". */
const listText = (xs: readonly string[]): string =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * Rule 4: education coverage under its target, naming the business unit with the lowest share
 * (units of at least 10 hires), or every unit that rounds to that same share.
 */
function coverage(x: FindingInputs): Ranked[] {
  const target = x.s.coverageTarget
  const hires = x.hires
  if (target == null || !x.educationLoaded || hires.length < x.s.minGroup) return []
  const recorded = hires.filter((h) => h.recorded).length
  const share = recorded / hires.length
  const byUnit = new Map<string, { n: number; recorded: number }>()
  for (const h of hires) {
    const u = h.e.businessUnit
    if (!u) continue
    const t = byUnit.get(u) ?? { n: 0, recorded: 0 }
    t.n++
    if (h.recorded) t.recorded++
    byUnit.set(u, t)
  }
  const minUnit = Math.max(10, x.s.minGroup)
  const units = [...byUnit]
    .filter(([, t]) => t.n >= minUnit)
    .map(([unit, t]) => ({ unit, share: t.recorded / t.n }))
    .sort((a, b) => a.share - b.share || a.unit.localeCompare(b.unit))
  const lowest = units[0]
  const low =
    lowest && lowest.share < target
      ? units.filter((u) => u.share < target && pctText(u.share) === pctText(lowest.share)).map((u) => u.unit)
      : []
  if (share >= target && !low.length) return []
  const missing = hires.filter((h) => !h.recorded)
  const title = low.length
    ? `Education is recorded for ${pctText(share)} of hires in the cohort; ${listText(low)} ${low.length === 1 ? 'is' : 'are'} at ${pctText(lowest.share)}.`
    : `Education is recorded for ${pctText(share)} of hires in the cohort, under the ${pctText(target)} target.`
  return [
    {
      id: 'hrbp-quality-education-coverage',
      metricId: QID.education,
      severity: 'info',
      title,
      detail: `${hiresText(missing.length)} have neither a university nor a degree level, so they are in no education group.`,
      action: 'Ask HR operations to add university and degree from offer paperwork for new hires.',
      ...(low.length ? { filter: { businessUnit: low } } : {}),
      drill: () => hiresSpec(x.d, 'Hires with no education recorded', missing),
      uses: x.uses.education,
      impact: (1 - share) * hires.length,
    },
  ]
}

export function qualityFindings(x: FindingInputs): Finding[] {
  if (x.scope.n < x.s.minGroup) return []
  const all = [...clearlyApart(x), ...strongReviewsWeakRetention(x), ...lowCell(x), ...coverage(x)]
  return all
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact)
    .map(({ impact: _, ...f }) => f)
}

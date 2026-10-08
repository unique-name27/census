/**
 * The access matrix (docs/ROLES-V2.md 8.8 test 1; docs/ROLES.md 6.8): every surface in every one
 * of the eleven modes, rendered as text and compared with three reviewed files under
 * `__snapshots__/` (`npx vitest run src/access/matrix.test.ts -u` after an intended change):
 *
 *  - `access-matrix.txt`: the one-letter grid;
 *  - `access-how.txt`: the sentence of every limited or hidden decision, per mode;
 *  - `access-hidden-kinds.txt`: per mode and shown view, the record kinds the view's numbers open
 *    that the mode does not list, so each plain number is a reviewed choice (4.12).
 *
 * Then the invariants: Developer shows everything; HR differs from Developer only on the developer
 * surfaces, the role homes and My team; CHRO differs from HR only on its home; every allowlist mode
 * names every view, page and tab of a view it shows, and the four Special analyses addresses; every
 * limited or hidden decision says how; hidden figures and metrics exist; each mode's kinds come
 * from its datasets; the pay and immigration surfaces follow `PAY_OF` and `IMMIGRATION_OF`; a linked
 * survey number shows only where its Listening tab shows; the role tables follow the contract's
 * grid; every tour a role mode shows keeps 3 steps; and the copy is plain.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLS } from '@/app/tools'
import { ALL_TOOL_NAMES } from '@/ask/engine/tools'
import { DATASET_KEYS, SURVEY_PROGRAMS, type SurveyType, VIEW_KEYS, VIEW_LABEL } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { DRILL_KINDS } from '@/drill/records'
import { drillDataset } from '@/drill/types'
import { tourInMode, tourShown } from '@/help/access'
import { ARTICLES } from '@/help/articles'
import { TOURS } from '@/help/tours'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { DATA_TABS, DATASET_PANELS } from '@/views/data/links'
import { ANALYSIS_KEYS } from '@/views/hrbp/analyses/tab'
import { programOf } from '@/views/listening/engine/catalog'
import { VIEWS } from '@/views/registry'
import { SCORECARD_FIGURES } from '@/views/scorecard/engine/figures'
import { TEAM_FIGURES } from '@/views/team/engine/figures'
import { accessFor } from './context'
import { BANNED_MODE_WORDS, NOT_SECURITY_LONG, NOT_SECURITY_SHORT } from './copy'
import {
  type AccessInventory,
  accessMatrix,
  howText,
  MATRIX_MODES,
  type MatrixRow,
  MODE_COLUMN,
  matrixText,
} from './matrix'
import { IMMIGRATION_OF, isOtherHomeFigure, MODES, type Mode, PAY_OF } from './modes'
import { payDecisions } from './pay'
import {
  type Access,
  decide,
  decideTable,
  isDeveloperOnly,
  isHomeSurface,
  isTableMode,
  MANAGER_DATASETS,
  MANAGER_HIDDEN_FIGURE_PREFIXES,
  MANAGER_HIDDEN_FIGURES,
  MANAGER_HIDDEN_METRIC_PREFIXES,
  MANAGER_HIDDEN_METRICS,
  type PolicyPlace,
  ROLE_LIST_SURFACES,
  ROLE_POLICY,
  type RolePolicy,
  routeDecision,
  type TableMode,
} from './policy'
import { ALL_DATASETS, ALL_DRILL_KINDS, VIEW_TABS } from './policy/kit'

/* ───────────── the inventory ───────────── */

/** The role homes' figures, once the Home view lists them (`src/views/home/engine/figures.ts`). */
const HOME_MODULES = import.meta.glob<{ HOME_FIGURES?: unknown }>('../views/home/engine/figures.ts', {
  eager: true,
})
const HOME_FIGURES: readonly string[] = [
  ...new Set(
    Object.values(HOME_MODULES).flatMap((m) => {
      const f = m.HOME_FIGURES
      if (Array.isArray(f)) return f as string[]
      if (f && typeof f === 'object') return Object.values(f).flat() as string[]
      return []
    }),
  ),
]

/** Tabs this release plans that may not be registered yet (the Home view, Workforce cost). */
const PLANNED_TABS = new Set(['home.overview', 'comp.cost'])

type Tabbed = keyof typeof VIEW_TABS
const registry = new Map(VIEWS.map((v) => [v.key as string, v]))

/**
 * The views in Home-first folder order, each with the registry's tabs and the planned ones, so the
 * snapshot does not move when the Home view and Workforce cost land.
 */
const inventoryViews = (Object.keys(VIEW_TABS) as Tabbed[]).map((key) => {
  const v = registry.get(key)
  const tabs = (v?.tabs ?? []).map((t) => ({ key: t.key, label: t.label }))
  for (const p of VIEW_TABS[key]) if (!tabs.some((x) => x.key === p.key)) tabs.push({ ...p })
  return { key, label: v?.label ?? VIEW_LABEL[key], tabs }
})

const inventory: AccessInventory = {
  views: inventoryViews,
  dataTabs: DATA_TABS.map((t) => t.route || t.key),
  datasetPanels: DATASET_PANELS,
  settings: SETTINGS_SECTIONS,
  tools: DEFAULT_TOOLS.map((t) => t.id),
  articles: ARTICLES.map((a) => a.id),
  tours: TOURS.map((t) => t.id),
  askTools: ALL_TOOL_NAMES,
  drillKinds: DRILL_KINDS,
  datasets: DATASET_KEYS,
  // The role homes' figures (docs/ROLES.md 2.1 and 2.2; ROLES-V2 5), on their page.
  figures: [
    ...HOME_FIGURES.map((id) => ({ id, view: 'home', tab: 'overview' })),
    ...TEAM_FIGURES.map((id) => ({ id, view: 'team', tab: 'overview' })),
    ...SCORECARD_FIGURES.map((id) => ({ id, view: 'scorecard', tab: 'overview' })),
  ],
  // People stats > Special analyses, each analysis by its address (4.2).
  parts: ANALYSIS_KEYS.map((k) => `hrbp.analyses:${k}`),
}

const rows = accessMatrix(inventory)
const row = (s: string): MatrixRow => {
  const r = rows.find((x) => x.surface === s)
  if (!r) throw new Error(`No matrix row ${s}`)
  return r
}

/** The six role tables this stage fills, and Manager's. */
const TABLE_MODES = MODES.filter(isTableMode) as TableMode[]
const ROLE_MODES = TABLE_MODES.filter((m) => m !== 'manager')
const tableOf = (m: TableMode): RolePolicy => ROLE_POLICY[m]
const PLACES: readonly PolicyPlace[] = [...VIEW_KEYS, 'actions', 'data', 'dev']

/* ───────────── the source ───────────── */

/** Every .ts and .tsx file under a folder, except tests and gallery files. */
function sources(dir = join(__dirname, '..'), out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__gallery__' || name === '__snapshots__') continue
      sources(p, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const SOURCE = sources()
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')

/** Figure ids under a prefix that the source names ("hrbp-quality-" → every Quality of hire figure). */
const figuresUnder = (prefix: string): string[] => [
  ...new Set([...SOURCE.matchAll(new RegExp(`['"](${prefix}[a-z0-9-]+)['"]`, 'g'))].map((x) => x[1])),
]

/**
 * The record kinds each view's numbers can open: every `kind: '<kind>'` its folder names. A
 * static reading (a figure's drill is a function), so the list is per view, not per figure.
 */
function viewKinds(view: string): string[] {
  const dir = join(__dirname, '..', 'views', view)
  let files: string[]
  try {
    files = sources(dir)
  } catch {
    return []
  }
  const kinds = new Set<string>()
  const known = new Set<string>(DRILL_KINDS)
  for (const f of files)
    for (const m of readFileSync(f, 'utf8').matchAll(/kind: ['"]([A-Za-z]+)['"]/g))
      if (known.has(m[1])) kinds.add(m[1])
  return [...kinds].sort()
}

/** Per mode and shown view, the kinds its numbers open that the mode does not list. */
function hiddenKindsText(): string {
  const lines: string[][] = []
  const kindsBy = new Map(PLACES.map((v) => [v, viewKinds(v)]))
  for (const mode of MATRIX_MODES)
    for (const v of PLACES) {
      const place = v === 'actions' || v === 'data' || v === 'dev' ? `page:${v}` : `view:${v}`
      if (decide(mode, place).access === 'hidden') continue
      const kinds = (kindsBy.get(v) ?? []).filter((k) => decide(mode, `drill:${k}`).access === 'hidden')
      if (kinds.length) lines.push([MODE_COLUMN[mode], v, kinds.join(', ')])
    }
  const w0 = Math.max('Mode'.length, ...lines.map((l) => l[0].length))
  const w1 = Math.max('View'.length, ...lines.map((l) => l[1].length))
  const fmt = (l: readonly string[]) => `${l[0].padEnd(w0)}  ${l[1].padEnd(w1)}  ${l[2]}`.trimEnd()
  const head = fmt(['Mode', 'View', 'Kinds its numbers open that the mode does not list (plain numbers)'])
  return `${[head, '-'.repeat(head.length), ...lines.map(fmt)].join('\n')}\n`
}

/* ───────────── the contract's grid ───────────── */

/**
 * docs/ROLES-V2.md part 4, the columns this stage fills: BU, Rgn, Comp, Tal, Ops, Rec, Fin. "S
 * (scope)" and "S (switch)" read S; "while on" reads L (it follows the saved switch); "n/a"
 * (inside something hidden) reads H. Checked against each table's own answer (`decideTable`), so
 * the Action center reads as the table has it while the not-ready rule still hides it.
 */
const GRID_MODES: readonly TableMode[] = [
  'hrbp-unit',
  'hrbp-region',
  'compensation',
  'talent-management',
  'hr-ops',
  'recruiter',
  'finance',
]
const GRID = `
view:home                           S S S S S S S
view:team                           H H H H H H H
view:scorecard                      S S S S S H H
view:services                       S S H H S H H
view:talent                         L L L S H H H
view:comp                           L L S H H H L
view:compliance                     L L H H S H H
view:ai                             L L L L L L H
tab:recruiting.overview             S S H H H L H
tab:recruiting.pipeline             S S H H H S H
tab:recruiting.requisitions         S S H H H L L
tab:recruiting.sources              S S H H H L H
tab:onboarding.upcoming             S S H H S L L
tab:onboarding.first90              S S H L S H H
tab:onboarding.plan                 S S H H H H S
tab:hrbp.overview                   S S S S S H S
tab:hrbp.workforce                  S S S S S H S
tab:hrbp.attrition                  S S S S L H L
tab:hrbp.movement                   S S S S S H H
tab:hrbp.org                        S S L S L H H
tab:hrbp.analyses                   S S L L H H L
tab:hrbp.analyses:quality           S S H S H H H
tab:hrbp.analyses:declines          S S L H H H H
tab:hrbp.analyses:stages            S S H L H H S
tab:hrbp.analyses:pyramid           S S S S H H S
tab:org.chart                       L L L L L H L
tab:org.sandbox                     S S H H H H H
tab:services.overview               S S H H S H H
tab:services.cases                  S S H H S H H
tab:services.transactions           S S H H S H H
tab:services.leave                  S S H H S H H
tab:services.levels                 S S H H S H H
tab:talent.overview                 S S L S H H H
tab:talent.performance              S S S S H H H
tab:talent.succession               L L H S H H H
tab:talent.retention                S S H S H H H
tab:talent.learning                 S S H S H H H
tab:comp.overview                   L L S H H H H
tab:comp.ranges                     L L S H H H H
tab:comp.performance                L L S H H H H
tab:comp.market                     L L S H H H H
tab:comp.cycle                      L L S H H H H
tab:comp.cost                       H H S H H H S
tab:compliance.overview             L L H H S H H
tab:compliance.work                 L L H H S H H
tab:compliance.export               L L H H S H H
tab:compliance.deadlines            L L H H S H H
tab:listening.overview              S S S S S H H
tab:listening.candidates            S S H H H H H
tab:listening.onboarding            S S H S S H H
tab:listening.stay-exit             S S S S H H H
tab:listening.managers              S S H S H H H
tab:listening.services              S S H S S H H
tab:listening.engagement            L L H L H H H
tab:ai.agents                       S S S S S S H
page:actions                        L L L L L L L
page:data                           H H H H S H H
page:dev                            H H H H H H H
masthead:wordmark                   L L L L L L L
masthead:mode                       L L S S S L S
masthead:pay-tags                   H H L H L H H
masthead:tools                      L L L L L L L
masthead:actions                    L L L L L L L
masthead:data                       H H H H S H H
masthead:dev                        H H H H H H H
masthead:settings                   L L L L L L L
masthead:ask                        L L L L L L L
masthead:help                       L L L L L L L
header:scope                        L L S S S L S
header:agents                       S S S S S S H
header:hrbp                         S S H H H H H
header:comp                         H H S H H H H
header:compliance                   H H H H S H H
header:scorecard                    S S S S S H H
header:ai                           H H H H H H H
ui:tier-badge                       L L L L S L L
ui:edit-definition                  H H H H S H H
ui:error-details                    H H H H H H H
ui:actions-team                     H H H H H H H
ui:attention-lists                  S S S S S S S
settings:mode                       L L S S S L S
settings:display                    S S S S S S S
settings:data                       H H H H S H H
settings:formulas                   L L L L S L L
settings:lists                      H H H H S H H
settings:privacy                    H H L H L H H
settings:ask                        S S S S S S S
settings:compensation               H H S H H H H
settings:tools                      H H H H H H H
settings:device-files               H H H H S H H
tools:pipeline                      S S H H H S H
tools:lattice                       S S S S S S H
tools:toolkit                       S S S S S S H
tools:catalog                       S S S S S S H
tools:edit                          H H H H H H H
help:article:modes                  S S S S S S S
help:article:view-home              S S S S S S S
help:article:view-team              H H H H H H H
help:article:view-actions           S S S S S S S
help:article:data-loading           H H H H S H H
help:article:definitions-how        L L L L S L L
help:article:glossary               L L L L S L L
help:article:privacy-browser        S S S S S S S
help:article:privacy-pay            S S S H H H S
help:article:privacy-er             S S H H S H H
help:article:privacy-surveys        S S S S S H H
help:article:privacy-immigration    S S H H S H H
help:article:shortcuts              S S S S S S S
help:article:developer-tools        H H H H H H H
help:tour:getting-started           H H H H H H H
help:tour:home-start                S S S S S S S
help:tour:manager-start             H H H H H H H
help:tour:view-team                 H H H H H H H
help:tour:own-data                  H H H H S H H
help:tour:quality-definitions       H H H H S H H
help:tour:developer-tools           H H H H H H H
ask                                 L L L L L L L
ask:get_context                     L L L L L L L
ask:find_metrics                    L L L L L L L
ask:view_summary                    L L L L L L L
ask:compare_groups                  L L L L L L L
ask:query_records                   L L L L L L L
ask:explain_quality                 H H H H S H H
ask:open_items                      L L L L L L L
ask:get_screen                      L L L L L L L
ask:set_filters                     L L L L L L L
ask:open_view                       L L L L L L L
ask:make_chart                      L L L L L L L
ask:console                         H H H H H H H
filter:period                       S S S S S S S
filter:leader                       L L S S S S H
filter:exclude                      S S S S S S H
filter:standard                     S S S S S S L
filter:lens                         S S S S S S H
export:figure                       L L L L L L L
export:view                         L L L L L L L
export:link                         S S S S S L S
export:monthly-report               S S S S S H H
export:org-slide                    S S S S S H S
export:reorg                        S S H H H H H
export:talking-points               S S H H H H H
export:action-list                  S S S S S S S
export:records                      L L S S S L L
export:drill-spec                   H H H H H H H
export:ask                          S S S S S S S
export:data-room                    H H H H S H H
export:formulas                     L L L L S L L
person:inside-org                   S S S S S L L
person:outside-org                  L L S S S L S
person:compa-ratio                  S S S H H H H
person:ratings                      S S S S H H H
person:open-cases                   S S H H S H H
person:focus                        L L S S S H S
person:org-chart                    L L S S S H S
focus:filter-to                     L L S S S S L
focus:leave-out                     L L S S S S H
org:simulate-exit                   S S H H H H H
drill:employees                     L L S S S L L
drill:candidates                    L L S H S L H
drill:comp                          L L S H H H H
drill:cases                         L L H H S H H
drill:hiringPlan                    L L H H H H S
drill:surveyResponses               H H H H S H H
drill:budget                        H H S H H H S
dataset:comp                        S S S H H H H
dataset:budget                      H H S H H H S
dataset:employees                   S S S S S H S
`

const LETTER: Record<Access, string> = { shown: 'S', limited: 'L', hidden: 'H' }

/* ───────────── the tests ───────────── */

describe('access matrix', () => {
  it('matches the reviewed snapshots', async () => {
    await expect(matrixText(rows)).toMatchFileSnapshot('./__snapshots__/access-matrix.txt')
    // Every limited or hidden decision's sentence, one line per mode (docs/ROLES-V2.md 8.3).
    await expect(howText(rows)).toMatchFileSnapshot('./__snapshots__/access-how.txt')
    // The numbers each mode shows as plain text, because their records are a kind it does not list.
    await expect(hiddenKindsText()).toMatchFileSnapshot('./__snapshots__/access-hidden-kinds.txt')
  })

  it('shows every surface in Developer mode', () => {
    for (const r of rows) expect(r.developer.access, r.surface).toBe('shown')
  })

  it('differs between HR and Developer only on the developer surfaces, the role homes and the role lists', () => {
    for (const r of rows) {
      const off =
        isDeveloperOnly(r.surface) || isHomeSurface(r.surface) || ROLE_LIST_SURFACES.includes(r.surface)
      expect(r.hr.access, r.surface).toBe(off ? 'hidden' : 'shown')
    }
  })

  it('differs between CHRO and HR only on the executive home', () => {
    for (const r of rows) {
      const chro = r.decisions.chro.access
      const ownHome =
        isHomeSurface(r.surface) &&
        !(r.surface.startsWith('figure:') && isOtherHomeFigure('chro', r.surface.slice(7)))
      if (ownHome) expect(chro, r.surface).toBe('shown')
      else expect(chro, r.surface).toBe(r.hr.access)
    }
  })

  it('shows the Action center in every mode, limited per mode, with nothing left "not ready yet"', async () => {
    // docs/ACTION-CENTER-AUDIT.md part 6, Roles: page:actions is Shown or Limited in every role, and
    // the "not ready yet" rule is gone (its module and every export of it).
    const policy = await import('./policy')
    for (const name of ['NOT_READY', 'NOT_READY_PREFIXES', 'NOT_READY_PAGES', 'NOT_READY_HOW', 'isNotReady'])
      expect(name in policy, name).toBe(false)
    for (const s of [
      'page:actions',
      'masthead:actions',
      'ask:open_items',
      'drill:actionItems',
      'drill:actionOwners',
    ])
      expect(
        rows.some((r) => r.surface === s),
        s,
      ).toBe(true)
    for (const m of MODES) {
      expect(decide(m, 'page:actions').access, m).not.toBe('hidden')
      expect(decide(m, 'masthead:actions').access, m).not.toBe('hidden')
      expect(decide(m, 'help:article:view-actions').access, m).not.toBe('hidden')
      expect(decide(m, 'drill:actionItems').access, m).not.toBe('hidden')
      expect(decide(m, 'metric:actions.items.open').access, m).toBe('shown')
      expect(decide(m, 'kpi:critical', undefined, { metric: 'actions.items.critical' }).access, m).toBe(
        'shown',
      )
      expect(routeDecision(m, { view: 'actions', tab: '' }).redirected, m).toBe(false)
    }
    // The two lists are the role modes'; Developer, HR and CHRO list every item with "My team".
    for (const m of MODES) {
      const lists = decide(m, 'ui:attention-lists').access !== 'hidden'
      expect(lists, m).toBe(m === 'developer' || !['hr', 'chro'].includes(m))
    }
  })

  it('keeps the policy tab lists equal to the registry, plus the tabs this release plans', () => {
    for (const key of Object.keys(VIEW_TABS) as Tabbed[]) {
      const v = registry.get(key)
      const planned = VIEW_TABS[key].filter((t) => !v?.tabs.some((x) => x.key === t.key))
      for (const t of planned) expect(PLANNED_TABS.has(`${key}.${t.key}`), `${key}.${t.key}`).toBe(true)
      if (!v) continue
      // The registered tabs, in order, with their labels.
      expect(
        VIEW_TABS[key].filter((t) => v.tabs.some((x) => x.key === t.key)),
        key,
      ).toEqual(v.tabs.map((t) => ({ key: t.key, label: t.label })))
    }
    for (const v of VIEWS) expect(Object.keys(VIEW_TABS), v.key).toContain(v.key)
    expect(Object.keys(VIEW_TABS).sort()).toEqual([...VIEW_KEYS].sort())
  })

  it('names every view, page and tab of a shown view in every allowlist mode, in tab order', () => {
    for (const mode of TABLE_MODES) {
      const t = tableOf(mode)
      expect(Object.keys(t.views).sort(), mode).toEqual([...PLACES].sort())
      for (const v of inventoryViews) {
        if (t.views[v.key].access === 'hidden') continue
        const tabs = t.tabs[v.key]
        expect(tabs, `${mode} ${v.key}`).toBeDefined()
        const want = v.tabs.filter(
          (x) => mode !== 'manager' || registry.get(v.key)?.tabs.some((r) => r.key === x.key),
        )
        expect(
          tabs?.map((x) => [x.key, x.label]),
          `${mode} ${v.key}`,
        ).toEqual(want.map((x) => [x.key, x.label]))
        // A shown view always has a shown tab to open.
        expect(
          tabs?.some((x) => x.decision.access !== 'hidden'),
          `${mode} ${v.key}`,
        ).toBe(true)
      }
      // Every home is shown in its own mode, and each table answers for its own mode.
      expect(t.mode, mode).toBe(mode)
    }
  })

  it('names the four Special analyses addresses in every allowlist mode, and sends a hidden one to a shown one', () => {
    for (const mode of TABLE_MODES) {
      const t = tableOf(mode)
      for (const k of ANALYSIS_KEYS)
        expect(t.surfaces[`tab:hrbp.analyses:${k}`], `${mode} ${k}`).toBeDefined()
      const tab = t.tabs.hrbp?.find((x) => x.key === 'analyses')
      for (const [where, part] of Object.entries(t.hiddenParts)) {
        expect(tab && tab.decision.access !== 'hidden', `${mode} ${where}`).toBe(true)
        expect(decideTable(t, `tab:${where}`).access, `${mode} ${where}`).toBe('hidden')
        expect(decideTable(t, `tab:hrbp.${part.instead}`).access, `${mode} ${where}`).not.toBe('hidden')
      }
      // Every hidden analysis of a shown tab has somewhere to go.
      if (tab && tab.decision.access !== 'hidden')
        for (const k of ANALYSIS_KEYS)
          if (decideTable(t, `tab:hrbp.analyses:${k}`).access === 'hidden')
            expect(t.hiddenParts[`hrbp.analyses:${k}`], `${mode} ${k}`).toBeDefined()
    }
  })

  it('says how for every limited or hidden decision', () => {
    for (const r of rows)
      for (const m of MODES) {
        const d = r.decisions[m]
        if (d.access !== 'shown') expect(d.how, `${m} ${r.surface}`).toBeTruthy()
      }
  })

  it('hides only figure ids that exist in the source, and every figure under a hidden prefix', () => {
    const lists: [Mode, readonly string[], readonly string[]][] = [
      ['manager', MANAGER_HIDDEN_FIGURES, MANAGER_HIDDEN_FIGURE_PREFIXES],
      ...TABLE_MODES.map((m): [Mode, readonly string[], readonly string[]] => [
        m,
        tableOf(m).hiddenFigures,
        tableOf(m).hiddenFigurePrefixes,
      ]),
    ]
    for (const [mode, ids, prefixes] of lists) {
      for (const id of ids) {
        expect(SOURCE.includes(`'${id}'`) || SOURCE.includes(`"${id}"`), `${mode} ${id}`).toBe(true)
        expect(decide(mode, `figure:${id}`).access, `${mode} ${id}`).toBe('hidden')
      }
      for (const p of prefixes) {
        const found = figuresUnder(p)
        expect(found.length, `${mode} ${p}`).toBeGreaterThan(0)
        for (const id of found) expect(decide(mode, `figure:${id}`).access, `${mode} ${id}`).toBe('hidden')
      }
    }
  })

  it('hides only metric ids and prefixes the catalog has, and keeps dev. out of it', () => {
    const lists: [string, readonly string[], readonly string[], readonly string[]][] = [
      ['manager', MANAGER_HIDDEN_METRICS, MANAGER_HIDDEN_METRIC_PREFIXES, []],
      ...TABLE_MODES.map((m): [string, readonly string[], readonly string[], readonly string[]] => [
        m,
        tableOf(m).metrics.hide,
        tableOf(m).metrics.hidePrefixes,
        tableOf(m).metrics.allow ?? [],
      ]),
    ]
    for (const [mode, ids, prefixes, allow] of lists) {
      for (const id of ids) expect(CATALOG.byId.has(id), `${mode} ${id}`).toBe(true)
      for (const p of [...prefixes, ...allow])
        expect(
          METRICS.some((m) => m.id.startsWith(p)),
          `${mode} ${p}`,
        ).toBe(true)
    }
    expect(METRICS.filter((m) => m.id.startsWith('dev.'))).toEqual([])
  })

  it('hides a metric of a view a mode hides, and shows one of a view it shows', () => {
    const views = (id: string) => CATALOG.byId.get(id)?.views
    expect(
      decide('manager', 'metric:hrbp.attrition.voluntary', undefined, { metricViews: views }).access,
    ).toBe('shown')
    const compOnly = METRICS.find((m) => m.views.length === 1 && m.views[0] === 'comp')
    if (compOnly)
      for (const mode of ['manager', 'talent-management', 'hr-ops', 'recruiter'] as const)
        expect(decide(mode, `metric:${compOnly.id}`, undefined, { metricViews: views }).access, mode).toBe(
          'hidden',
        )
    // An allowlist keeps only its prefixes, whatever views the metric is on.
    expect(
      decide('finance', 'metric:hrbp.movement.promotions', undefined, { metricViews: views }).access,
    ).toBe('hidden')
    expect(
      decide('finance', 'metric:hrbp.headcount.employees', undefined, { metricViews: views }).access,
    ).toBe('shown')
    expect(decide('recruiter', 'metric:recruiting.data.reqMatch').access).toBe('hidden')
    expect(decide('recruiter', 'metric:recruiting.reqs.open').access).toBe('shown')
  })

  it("lists real drill kinds and datasets, each kind's records from a dataset the mode reads", () => {
    expect([...ALL_DRILL_KINDS].sort()).toEqual([...DRILL_KINDS].sort())
    expect([...ALL_DATASETS].sort()).toEqual([...DATASET_KEYS].sort())
    for (const mode of TABLE_MODES) {
      const t = tableOf(mode)
      for (const k of t.drillKinds) {
        expect(DRILL_KINDS, `${mode} ${k}`).toContain(k)
        expect(t.datasets, `${mode} ${k}`).toContain(drillDataset(k))
      }
      for (const d of t.datasets) expect(DATASET_KEYS, `${mode} ${d}`).toContain(d)
    }
    // Manager mode's datasets are My team's.
    expect([...(VIEWS.find((v) => v.key === 'team')?.datasets ?? [])].sort()).toEqual(
      [...MANAGER_DATASETS].sort(),
    )
    // Finance reads compensation rows for cost totals only: never a kind, never for Ask (3.2).
    expect(decide('finance', 'drill:comp').access).toBe('hidden')
    expect(decide('finance', 'dataset:comp').access).toBe('hidden')
    expect(decide('finance', 'drill:candidates').access).toBe('hidden')
  })

  it("keeps the pay and immigration surfaces to each mode's pay view (3.1)", () => {
    for (const mode of MODES) {
      if (mode === 'developer') continue
      for (const [s, d] of Object.entries(payDecisions(mode)))
        expect(decide(mode, s).access, `${mode} ${s}`).toBe(d.access)
      const pay = PAY_OF[mode] === 'switch'
      const imm = IMMIGRATION_OF[mode]
      const either = pay || imm ? (pay && imm ? 'shown' : 'limited') : 'hidden'
      expect(decide(mode, 'masthead:pay-tags').access, mode).toBe(either)
      expect(decide(mode, 'settings:privacy').access, mode).toBe(either)
      expect(decide(mode, 'header:comp').access !== 'hidden', mode).toBe(pay)
      expect(decide(mode, 'header:compliance').access !== 'hidden', mode).toBe(imm)
      // Amounts behind the switch, cost totals in Finance too, nothing in the ratio modes.
      expect(decide(mode, 'pay:amounts').access !== 'hidden', mode).toBe(pay)
      expect(decide(mode, 'pay:totals').access !== 'hidden', mode).toBe(PAY_OF[mode] !== 'none')
    }
  })

  it('shows a linked survey number only where its Listening tab shows (4.2)', () => {
    /** The figure each survey's number takes in another view (`SURVEY_PROGRAMS[].alsoIn`). */
    const FIGURE: Readonly<Partial<Record<SurveyType, string>>> = {
      'Candidate experience': 'recruiting-candidate-survey',
      'Hiring manager satisfaction': 'recruiting-hiring-manager-survey',
      'Onboarding pulse day 30': 'onboarding-pulse',
      'Onboarding pulse day 90': 'onboarding-pulse',
      'Stay interview': 'talent-stay-interviews',
      'Exit survey': 'hrbp-exit-survey',
      'Manager feedback': 'hrbp-manager-feedback',
      'HR service survey': 'services-hr-service-survey',
      'Return to work': 'services-leave-survey',
      'Training evaluation': 'talent-training-evaluation',
    }
    const spots = SURVEY_PROGRAMS.flatMap((p) => {
      if (!p.alsoIn) return []
      const id = FIGURE[p.survey]
      expect(id, p.survey).toBeTruthy()
      return [{ survey: p.survey, id: id!, view: p.alsoIn.view, tab: p.alsoIn.tab }]
    })
    // The offer declines analysis carries the candidate survey too.
    spots.push({
      survey: 'Candidate experience',
      id: 'hrbp-declines-candidate-survey',
      view: 'hrbp',
      tab: 'analyses:declines',
    })
    for (const s of spots) {
      expect(SOURCE.includes(`'${s.id}'`) || SOURCE.includes(`"${s.id}"`), s.id).toBe(true)
      const tab = programOf.get(s.survey)?.tab
      expect(tab, s.survey).toBeTruthy()
      for (const mode of MODES) {
        const shown = decide(mode, `figure:${s.id}`, { view: s.view, tab: s.tab }).access !== 'hidden'
        const host = decide(mode, `tab:${s.view}.${s.tab}`).access !== 'hidden'
        const listening = decide(mode, `tab:listening.${tab}`).access !== 'hidden'
        if (shown && host) expect(listening, `${mode} ${s.id} needs listening.${tab}`).toBe(true)
      }
    }
  })

  it("follows the contract's grid in every role table (docs/ROLES-V2.md part 4)", () => {
    const bad: string[] = []
    for (const line of GRID.trim().split('\n')) {
      const [surface, ...letters] = line.trim().split(/\s+/)
      expect(letters, surface).toHaveLength(GRID_MODES.length)
      GRID_MODES.forEach((mode, i) => {
        const got = LETTER[decideTable(tableOf(mode), surface).access]
        if (got !== letters[i])
          bad.push(`${surface} ${MODE_COLUMN[mode]}: ${got}, the contract says ${letters[i]}`)
      })
    }
    expect(bad).toEqual([])
  })

  it('keeps at least 3 steps of every tour a role mode shows, each on a page the mode shows', () => {
    const metrics = { def: (id: string) => CATALOG.byId.get(id) }
    const short: string[] = []
    for (const mode of ROLE_MODES) {
      const access = accessFor(mode, null, metrics)
      for (const tour of TOURS) {
        if (!tourShown(access, tour.id)) continue
        const n = tourInMode(access, tour)?.steps.length ?? 0
        if (n < 3) short.push(`${mode} ${tour.id}: ${n} steps`)
      }
    }
    expect(short).toEqual([])
  })

  it('shows My team in Manager and Developer mode and the Scorecard in HR and Developer mode', () => {
    const at = (id: string) => row(`figure:${id}`)
    for (const id of TEAM_FIGURES) {
      expect(at(id).manager.access, id).toBe('shown')
      expect(at(id).hr.access, id).toBe('hidden')
    }
    for (const id of SCORECARD_FIGURES) {
      for (const m of ['manager', 'recruiter', 'finance'] as const)
        expect(at(id).decisions[m].access, id).toBe('hidden')
      expect(at(id).hr.access, id).toBe('shown')
      for (const m of ['hrbp-unit', 'compensation', 'talent-management', 'hr-ops'] as const)
        expect(at(id).decisions[m].access, `${m} ${id}`).toBe('shown')
    }
    for (const id of HOME_FIGURES) expect(at(id).hr.access, id).toBe('hidden')
  })

  it('lists exactly the figure ids the home pages draw', () => {
    const idsIn = (dir: string, prefix: string) => {
      let files: string[] = []
      try {
        files = sources(join(__dirname, '..', 'views', dir, 'ui'))
      } catch {
        return []
      }
      return [
        ...new Set(
          files
            .map((p) => readFileSync(p, 'utf8'))
            .flatMap((t) => [...t.matchAll(new RegExp(`id="(${prefix}-[a-z0-9-]+)"`, 'g'))].map((m) => m[1])),
        ),
      ].sort()
    }
    expect(idsIn('team', 'team')).toEqual([...TEAM_FIGURES].sort())
    expect(idsIn('scorecard', 'scorecard')).toEqual([...SCORECARD_FIGURES].sort())
  })

  it('keeps the copy plain: no em dash and no word that says modes are security', () => {
    const texts = new Set<string>([NOT_SECURITY_SHORT, NOT_SECURITY_LONG])
    for (const r of rows) for (const m of MODES) if (r.decisions[m].how) texts.add(r.decisions[m].how!)
    for (const mode of TABLE_MODES) {
      const t = tableOf(mode)
      for (const tab of Object.values(t.tabs).flat()) if (tab?.decision.how) texts.add(tab.decision.how)
      for (const p of Object.values(t.hiddenParts)) texts.add(`${p.label} ${p.insteadLabel}`)
    }
    for (const text of texts) {
      expect(text.includes('—'), text).toBe(false)
      for (const w of BANNED_MODE_WORDS) expect(text.toLowerCase().includes(w), `${w} in ${text}`).toBe(false)
      // A sentence: starts with a capital (or a quote or a number) and ends with a full stop.
      expect(/^["'0-9A-Z]/.test(text), text).toBe(true)
    }
  })
})

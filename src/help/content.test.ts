/**
 * The help content is checked like code (docs/HELP.md, Quality bar): every link resolves to a real
 * page, tab, metric, article, tour or Settings section; every tour step points at an element that
 * exists in the components; titles are sentence case; no em dashes in any sentence.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATASET_KEYS } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { ROUTE_VIEWS } from '@/data/store'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { DATA_TABS, parseDataTab } from '@/views/data/links'
import { parseMetricsTab } from '@/views/data/metrics/links'
import { VIEWS } from '@/views/registry'
import pkg from '../../package.json'
import { ARTICLES, articleById, articleForRoute } from './articles'
import { buildGlossary } from './glossary'
import { articleForMetric, LEARN_MORE_ARTICLES } from './learnMore'
import { checkLink, type LinkWorld } from './links'
import { articleLinks, blockTexts, linksIn, plainText } from './markup'
import { TOURS, targetName, tourById, tourForRoute } from './tours'
import { HELP_GROUPS } from './types'
import { APP_VERSION, RELEASE_NOTES } from './whatsNew'

const SRC = join(__dirname, '..')

/** Every .tsx file under src, except tests and the gallery. */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'zz-tmp' || name === '__gallery__') continue
      sourceFiles(p, out)
    } else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

const SOURCE = sourceFiles().map((p) => readFileSync(p, 'utf8'))
const ALL_SOURCE = SOURCE.join('\n')

const world: LinkWorld = {
  viewTabs: new Map(VIEWS.map((v) => [v.key, v.tabs.map((t) => t.key)])),
  isDataTab: (tab) => {
    if (DATA_TABS.some((t) => t.route === tab)) return true
    const r = parseDataTab(tab)
    if (r.dataset) return true
    if (r.tab === 'metrics') {
      const m = parseMetricsTab(tab)
      return m.metric ? CATALOG.byId.has(m.metric) : tab === 'metrics'
    }
    return r.tab === 'quality'
  },
  hasMetric: (id) => CATALOG.byId.has(id),
  hasArticle: (id) => !!articleById(id),
  hasTour: (id) => !!tourById(id),
}

/** A route as an article or a tour step names it: a real page, and a real tab of it. */
function routeProblem(view: string, tab: string | undefined): string | null {
  return checkLink({ kind: 'route', target: tab ? `${view}.${tab}` : view, label: '' }, world)
}

/* ───────── wording rules ───────── */

/** Names Census uses as proper nouns, and words that are capitalized wherever they appear. */
const PROPER = [
  'Census',
  'Northgate Semiconductor',
  'People stats',
  'Org chart',
  'HR ops',
  'AI in HR',
  'Action center',
  'Data room',
  'Data quality',
  'Metric definitions',
  'Categories & mapping',
  'Hire-to-Retire Atlas',
  'Atlas',
  'Glean',
  'Excel',
  'PowerPoint',
  'Scorecard',
  'Recruiting',
  'Onboarding',
  'Talent',
  'Compensation',
  'Compliance',
  'Listening',
  'Settings',
  'Help',
  'Tools',
  'Form I-9',
]

/** Sentence case: a capital first letter, and no other capitals except names and acronyms. */
function sentenceCaseProblem(title: string): string | null {
  if (!/^[A-Z0-9"?/]/.test(title)) return 'does not start with a capital'
  let rest = title
  for (const p of PROPER) rest = rest.split(p).join('')
  const words = rest.split(/\s+/).slice(1)
  const bad = words.filter((w) => /[A-Z]/.test(w) && !/^[A-Z0-9-]{2,}[.,:?]?$/.test(w) && !/\d/.test(w))
  return bad.length ? `capitalized: ${bad.join(', ')}` : null
}

/** The missing-value placeholder in quotes is allowed; an em dash in a sentence is not. */
const hasEmDash = (s: string) => s.replace(/"—"/g, '').includes('—')

/** Every sentence of help text: articles, tours, release notes. */
function allText(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  for (const a of ARTICLES) {
    out.push({ where: a.id, text: a.title }, { where: a.id, text: a.summary })
    for (const b of a.body) for (const t of blockTexts(b)) out.push({ where: a.id, text: t })
    for (const k of a.keywords ?? []) out.push({ where: `${a.id} keyword`, text: k })
  }
  for (const t of TOURS) {
    out.push({ where: t.id, text: t.title }, { where: t.id, text: t.summary })
    for (const s of t.steps)
      out.push({ where: `${t.id} step`, text: s.title }, { where: `${t.id} step`, text: s.body })
  }
  for (const r of RELEASE_NOTES) {
    out.push({ where: r.date, text: r.title })
    for (const i of r.items) out.push({ where: r.date, text: i })
  }
  return out
}

describe('help articles', () => {
  it('have unique ids and cover every group of docs/HELP.md', () => {
    const ids = ARTICLES.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of HELP_GROUPS)
      expect(
        ARTICLES.some((a) => a.group === g.key),
        g.label,
      ).toBe(true)
  })

  it('include every article the HELP.md table lists', () => {
    const expected = [
      // Start here
      'what-census-is',
      'moving-around',
      'reading-a-number',
      'clicking-down',
      'exporting',
      // Each view, and the Action center
      ...VIEWS.map((v) => `view-${v.key}`),
      'view-actions',
      // Your data
      'data-loading',
      'data-mapping',
      'data-categories',
      'data-tiers',
      'data-certify',
      'data-quality-tab',
      'data-wrong',
      // Definitions
      'definitions-how',
      'glossary',
      // Privacy and trust
      'privacy-browser',
      'privacy-pay',
      'privacy-small-groups',
      'privacy-er',
      'privacy-surveys',
      'privacy-immigration',
      'privacy-sample',
      // Help and support
      'shortcuts',
      'report-problem',
      'troubleshooting',
      'faq',
      'whats-new',
    ]
    for (const id of expected) expect(articleById(id), id).not.toBeNull()
  })

  it('have one article for each view, reached from its page', () => {
    for (const v of [...VIEWS.map((x) => x.key), 'actions' as const]) {
      const a = articleForRoute(v)
      expect(a?.id, v).toBe(`view-${v}`)
      expect(a?.group).toBe('views')
    }
    expect(articleForRoute('data')?.id).toBe('data-loading')
    expect(articleForRoute('data', 'quality')?.id).toBe('data-quality-tab')
    expect(articleForRoute('data', 'mapping')?.id).toBe('data-categories')
    expect(articleForRoute('data', 'metrics/hrbp/attrition/voluntary')?.id).toBe('definitions-how')
    expect(articleForRoute('data', 'employees-certify')?.id).toBe('data-loading')
  })

  it('every inline link resolves to a real page, tab, metric, article, tour or Settings section', () => {
    const problems: string[] = []
    for (const a of ARTICLES)
      for (const l of articleLinks(a)) {
        const why = checkLink(l, world)
        if (why) problems.push(`${a.id}: [${l.label}](${l.kind}:${l.target}) ${why}`)
      }
    expect(problems).toEqual([])
    // There are links of every kind, so the check above is not vacuous.
    const kinds = new Set(ARTICLES.flatMap(articleLinks).map((l) => l.kind))
    expect([...kinds].sort()).toEqual(['article', 'route', 'settings', 'tour'])
  })

  it('every page, tab, definition and tour an article names exists', () => {
    for (const a of ARTICLES) {
      if (a.route) expect(routeProblem(a.route.view, a.route.tab), a.id).toBeNull()
      for (const m of a.metrics ?? []) expect(CATALOG.byId.has(m), `${a.id}: ${m}`).toBe(true)
      if (a.tour) expect(tourById(a.tour), `${a.id}: ${a.tour}`).not.toBeNull()
    }
  })

  it('link checks catch broken links', () => {
    expect(checkLink({ kind: 'route', target: 'hrbp.nope', label: '' }, world)).toMatch(/no tab/)
    expect(checkLink({ kind: 'route', target: 'payroll', label: '' }, world)).toMatch(/no page/)
    expect(checkLink({ kind: 'route', target: 'data.nope', label: '' }, world)).toMatch(/Data room/)
    expect(checkLink({ kind: 'metric', target: 'hrbp.nope', label: '' }, world)).toMatch(/no metric/)
    expect(checkLink({ kind: 'article', target: 'nope', label: '' }, world)).toMatch(/no article/)
    expect(checkLink({ kind: 'tour', target: 'nope', label: '' }, world)).toMatch(/no tour/)
    expect(checkLink({ kind: 'settings', target: 'nope', label: '' }, world)).toMatch(/Settings/)
    expect(
      checkLink({ kind: 'route', target: 'data.metrics/hrbp/attrition/voluntary', label: '' }, world),
    ).toBeNull()
    expect(checkLink({ kind: 'route', target: 'data.employees-certify', label: '' }, world)).toBeNull()
    for (const s of SETTINGS_SECTIONS)
      expect(checkLink({ kind: 'settings', target: s, label: '' }, world)).toBeNull()
  })

  it('"Learn more" maps every metric to an article that exists', () => {
    for (const id of LEARN_MORE_ARTICLES) expect(articleById(id), id).not.toBeNull()
    const uncovered = METRICS.filter((m) => !articleForMetric(m.id)).map((m) => m.id)
    expect(uncovered).toEqual([])
    expect(articleForMetric('hrbp.attrition.voluntary')).toBe('view-hrbp')
    expect(articleForMetric('privacy.payAmounts')).toBe('privacy-pay')
    expect(articleForMetric('quality.rules.fill')).toBe('data-tiers')
    expect(articleForMetric(null)).toBeNull()
  })

  it('the datasets article names every dataset by its label', async () => {
    const { datasetDef } = await import('@/data/schema')
    const loading = articleById('data-loading')!
    const text = loading.body.flatMap(blockTexts).map(plainText).join(' ')
    for (const k of DATASET_KEYS) expect(text, k).toContain(datasetDef(k).label)
  })
})

describe('tours', () => {
  it('have unique ids, and every view and the Action center has its own with 4 to 6 steps', () => {
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const v of [...VIEWS.map((x) => x.key), 'actions' as const]) {
      const t = tourForRoute(v)
      expect(t?.id, v).toBe(`view-${v}`)
      expect(t!.steps.length, v).toBeGreaterThanOrEqual(4)
      expect(t!.steps.length, v).toBeLessThanOrEqual(6)
    }
    for (const id of ['getting-started', 'own-data', 'quality-definitions'])
      expect(tourById(id), id).not.toBeNull()
  })

  it('every step points at a data-tour attribute or a Figure id that exists in the components', () => {
    // Figure puts `data-tour={`figure-<id>`}` on every figure.
    expect(ALL_SOURCE).toContain('data-tour={`figure-$' + '{id}`}')
    const missing: string[] = []
    for (const t of TOURS)
      for (const s of t.steps) {
        if (!s.target) continue
        const name = targetName(s)
        if (!name) {
          missing.push(`${t.id}: target ${s.target} is not [data-tour="..."]`)
          continue
        }
        const figure = name.startsWith('figure-') ? name.slice('figure-'.length) : null
        const found = figure
          ? ALL_SOURCE.includes(`"${figure}"`) || ALL_SOURCE.includes(`'${figure}'`)
          : ALL_SOURCE.includes(`data-tour="${name}"`)
        if (!found) missing.push(`${t.id}: ${name}`)
      }
    expect(missing).toEqual([])
  })

  it('every step opens a real page and tab, and steps on a page say which page', () => {
    // Elements on every page (the band) need no page.
    const everywhere = new Set([
      'folder-tabs',
      'masthead-help',
      'masthead-tools',
      'masthead-data',
      'masthead-settings',
      'masthead-actions',
    ])
    for (const t of TOURS)
      for (const [i, s] of t.steps.entries()) {
        if (s.view) {
          expect(ROUTE_VIEWS, `${t.id} ${i}`).toContain(s.view)
          expect(routeProblem(s.view, s.tab), `${t.id} step ${i + 1}`).toBeNull()
        } else if (s.target)
          expect(everywhere.has(targetName(s) ?? ''), `${t.id} step ${i + 1} needs a page`).toBe(true)
      }
  })

  it('Getting started walks through everything docs/HELP.md lists', () => {
    const names = tourById('getting-started')!.steps.map((s) => targetName(s))
    for (const n of [
      'folder-tabs',
      'filter-period',
      'filter-leader',
      'data-standard',
      'kpi-strip',
      'kpi-info',
      'kpi-tier',
      'kpi-value',
      'readout',
      'masthead-tools',
      'masthead-data',
      'masthead-settings',
      'masthead-help',
    ])
      expect(names, n).toContain(n)
    expect(names.some((n) => n?.startsWith('figure-'))).toBe(true)
  })

  it('Using your own data ends on certification, and the quality tour edits a definition', () => {
    const own = tourById('own-data')!.steps
    expect(own.at(-1)?.tab).toBe('employees-certify')
    expect(own.some((s) => s.tab?.endsWith('-mapping'))).toBe(true)
    const q = tourById('quality-definitions')!.steps
    expect(q.map((s) => targetName(s))).toEqual(
      expect.arrayContaining(['kpi-tier', 'quality-lens', 'figure-data-quality-fixes', 'metric-detail']),
    )
  })
})

describe('wording', () => {
  it('titles are sentence case', () => {
    const titles = [
      ...ARTICLES.map((a) => a.title),
      ...TOURS.flatMap((t) => [t.title, ...t.steps.map((s) => s.title)]),
      ...HELP_GROUPS.map((g) => g.label),
      ...RELEASE_NOTES.map((r) => r.title),
    ]
    const problems = titles.map((t) => [t, sentenceCaseProblem(t)]).filter(([, p]) => p)
    expect(problems).toEqual([])
    expect(sentenceCaseProblem('Reading A Number')).not.toBeNull()
    expect(sentenceCaseProblem('Working with HR ops and the Data room')).toBeNull()
  })

  it('no em dashes in any sentence, and no exclamation marks', () => {
    const bad = allText().filter(({ text }) => hasEmDash(text) || /!/.test(plainText(text)))
    expect(bad).toEqual([])
    expect(hasEmDash('A number shows "—" when hidden')).toBe(false)
    expect(hasEmDash('Census — a workbench')).toBe(true)
  })

  it('no nagging verbs', () => {
    const bad = allText().filter(({ text }) =>
      /\b(chase|chasing|nag|nagging|ping|hound|unblock)\b/i.test(text),
    )
    expect(bad).toEqual([])
  })

  it('every link label reads as text (no raw ids)', () => {
    for (const { text } of allText())
      for (const l of linksIn(text)) expect(l.label).not.toMatch(/^[a-z]+[.:-][a-z]/)
  })
})

describe('glossary and release notes', () => {
  it('the glossary has one entry per metric, sorted by term', () => {
    const g = buildGlossary(METRICS)
    expect(g.length).toBe(new Set(METRICS.map((m) => m.id)).size)
    const terms = g.map((e) => e.term.toLowerCase())
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    expect(g.find((e) => e.id === 'hrbp.attrition.voluntary')?.where).toBe('People stats')
    expect(g.find((e) => e.id === 'privacy.anonymity')?.where).toBe('Privacy rule')
  })

  it('the app version matches package.json, and release notes are newest first', () => {
    expect(APP_VERSION).toBe(pkg.version)
    const dates = RELEASE_NOTES.map((r) => r.date)
    expect(dates).toEqual([...dates].sort().reverse())
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/**
 * The Developer page's State tab (docs/ROLES.md, 5.6): the state behind the screen as sections of
 * label and value, each also as JSON for "Copy as JSON". Copied state holds employee IDs from the
 * filters; the Ask key, the team passcode and the workspace ID are never in it (only whether they
 * are set). Pure: the page passes a snapshot of the stores.
 */
import { MODE_LABEL, MODE_OF_PICK, type Mode, type ModePicks, type PayView, PICK_KINDS } from '@/access/modes'
import type { Access } from '@/access/policy'
import type { ScopeKind } from '@/access/scopes/types'
import type { AnalyticsContext } from '@/data/context'
import { type DataStandard, STANDARD_LABEL, TIER_LABEL, type Tier } from '@/data/quality/tier'
import type { DatasetVersion } from '@/data/quality/types'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import { isEmployee } from '@/data/scope'
import { fmt } from '@/lib/format'
import { bytesText } from './overview'
import { PICK_NOUN, pickLabel } from './roles'
import { type StorageRow, storageTotals } from './storageKeys'

export const COPY_NOTE = 'Copied state holds employee IDs from the filters. Use Report a problem for tickets.'

export interface StateRow {
  label: string
  value: string
}

export interface StateSection {
  id: string
  title: string
  rows: StateRow[]
  json: unknown
}

export interface StateInput {
  ctx: Pick<
    AnalyticsContext,
    | 'filters'
    | 'scopeLabel'
    | 'isCompany'
    | 'window'
    | 'prior'
    | 'asOf'
    | 'data'
    | 'showPay'
    | 'showImmigration'
    | 'features'
    | 'standard'
    | 'quality'
    | 'sources'
    | 'reference'
    | 'metrics'
    | 'access'
  >
  route: { view: string; tab: string }
  hash: string
  /** The scope the address carries, as read from it. */
  addressScope: unknown
  asOfOverride: string | null
  savedStandard: DataStandard
  lens: boolean
  versions: Partial<Record<DatasetKey, DatasetVersion | null>>
  counts: Record<Mode, Record<Access, number>>
  /** Every pick `census:mode` remembers (manager IDs, not names: the copy says IDs). */
  picks?: Partial<ModePicks>
  savedViews: { count: number; applied: string | null; startup: string | null }
  panels: {
    drillDepth: number
    drillTop: string | null
    helpOpen: boolean
    tour: string | null
    askOpen: boolean
    askTurns: number
    askKey: string
    model: string
    workspaceSet: boolean
    /** Whether the team passcode is set (never its value); absent reads as not set. */
    askPasscode?: string
    /** How Ask connects: 'own key' or 'team relay'; absent reads as own key. */
    askVia?: string
  }
  storage: { unavailable: boolean; rows: readonly StorageRow[] | null }
}

const onOff = (b: boolean) => (b ? 'On' : 'Off')

const SCOPE_WORD: Record<ScopeKind, string> = {
  org: "A manager's org",
  unit: 'A business unit',
  region: 'A region',
  reqs: "A recruiter's reqs",
}

const PAY_WORD: Record<PayView, string> = {
  switch: 'Amounts behind Show pay amounts',
  totals: 'Cost totals only',
  none: 'Ratios only',
}
const yes = (b: boolean) => (b ? 'Yes' : 'No')
const json = (v: unknown) => JSON.stringify(v)

/** Active employees in scope on the as-of date. */
function peopleInScope(ctx: StateInput['ctx']): number {
  return ctx.data.employees.filter(
    (e) => isEmployee(e) && e.hireDate <= ctx.asOf && (!e.terminationDate || e.terminationDate > ctx.asOf),
  ).length
}

export function stateSections(s: StateInput): StateSection[] {
  const { ctx } = s
  const scope = ctx.access.scope
  const tiers = DATASET_KEYS.map((k) => ({ key: k, tier: ctx.quality.datasetTier(k) }))
  const fieldTiers: Record<Tier, number> = { none: 0, bronze: 0, silver: 0, gold: 0 }
  for (const k of DATASET_KEYS) for (const f of ctx.quality.fields(k)) fieldTiers[f.tier]++
  const uploaded = DATASET_KEYS.filter((k) => ctx.sources[k]?.kind === 'upload')
  const people = peopleInScope(ctx)
  const storageRows = s.storage.rows ?? []
  const totals = storageTotals(storageRows)
  const modeCounts = s.counts[ctx.access.mode]

  return [
    {
      id: 'route',
      title: 'Route',
      rows: [
        { label: 'View', value: s.route.view },
        { label: 'Tab', value: s.route.tab || '(first tab)' },
        { label: 'Address', value: s.hash || '(empty)' },
        { label: 'Scope in the address', value: json(s.addressScope) },
        { label: 'Filters (canonical)', value: json(ctx.filters) },
      ],
      json: { route: s.route, hash: s.hash, addressScope: s.addressScope, filters: ctx.filters },
    },
    {
      id: 'scope',
      title: 'Scope',
      rows: [
        { label: 'Scope', value: ctx.scopeLabel },
        { label: 'Whole company', value: yes(ctx.isCompany) },
        {
          label: 'Window',
          value: `${ctx.window.label} (${ctx.window.start} to ${ctx.window.end}, ${fmt(ctx.window.months, 'num1')} months)`,
        },
        { label: 'Comparison window', value: `${ctx.prior.label} (${ctx.prior.start} to ${ctx.prior.end})` },
        {
          label: 'As-of date',
          value: `${fmt(ctx.asOf, 'date')}, ${s.asOfOverride ? 'set in Settings' : 'the latest date in the data'}`,
        },
        { label: 'People in scope', value: fmt(people, 'int') },
      ],
      json: {
        filters: ctx.filters,
        scopeLabel: ctx.scopeLabel,
        isCompany: ctx.isCompany,
        window: ctx.window,
        prior: ctx.prior,
        asOf: ctx.asOf,
        asOfFrom: s.asOfOverride ? 'settings' : 'data',
        peopleInScope: people,
      },
    },
    {
      id: 'mode',
      title: 'Mode',
      rows: [
        { label: 'Mode', value: MODE_LABEL[ctx.access.mode] },
        { label: 'Scope held', value: scope ? `${SCOPE_WORD[scope.kind]}: ${scope.label}` : 'None' },
        {
          label: scope?.kind === 'reqs' ? 'Candidates on the reqs' : 'People in the scope',
          value: scope ? fmt(scope.size, 'int') : '—',
        },
        { label: 'Pick missing or gone', value: yes(ctx.access.unset) },
        { label: 'Pay', value: PAY_WORD[ctx.access.pay] },
        {
          label: 'Picks remembered',
          value:
            PICK_KINDS.map((k) => {
              const v = pickLabel(MODE_OF_PICK[k], s.picks ?? {})
              return v ? `${PICK_NOUN[k]}: ${v}` : null
            })
              .filter(Boolean)
              .join('; ') || 'None',
        },
        {
          label: 'Surfaces in this mode',
          value: `${fmt(modeCounts.shown, 'int')} shown, ${fmt(modeCounts.limited, 'int')} limited, ${fmt(modeCounts.hidden, 'int')} hidden`,
        },
      ],
      json: {
        mode: ctx.access.mode,
        scope: scope ? { kind: scope.kind, label: scope.label, size: scope.size } : null,
        unset: ctx.access.unset,
        pay: ctx.access.pay,
        picks: s.picks ?? null,
        surfaces: s.counts,
      },
    },
    {
      id: 'switches',
      title: 'Switches',
      rows: [
        { label: 'Pay amounts', value: onOff(ctx.showPay) },
        { label: 'Immigration details', value: onOff(ctx.showImmigration) },
        { label: 'Engagement surveys', value: onOff(ctx.features.engagementSurveys) },
        { label: 'Data standard, saved', value: STANDARD_LABEL[s.savedStandard] },
        { label: 'Data standard, on screen', value: STANDARD_LABEL[ctx.standard] },
        { label: 'Quality lens', value: onOff(s.lens) },
      ],
      json: {
        showPay: ctx.showPay,
        showImmigration: ctx.showImmigration,
        features: ctx.features,
        savedStandard: s.savedStandard,
        standard: ctx.standard,
        lens: s.lens,
      },
    },
    {
      id: 'quality',
      title: 'Quality index',
      rows: [
        ...tiers.map((t) => ({
          label: datasetDef(t.key).label,
          value: ctx.quality.explain(t.key),
        })),
        {
          label: 'Fields by tier',
          value: (['gold', 'silver', 'bronze', 'none'] as const)
            .map((t) => `${fmt(fieldTiers[t], 'int')} ${TIER_LABEL[t].toLowerCase()}`)
            .join(', '),
        },
      ],
      json: {
        datasets: Object.fromEntries(
          tiers.map((t) => [t.key, { tier: t.tier, explain: ctx.quality.explain(t.key) }]),
        ),
        fieldTiers,
      },
    },
    {
      id: 'data',
      title: 'Data',
      rows: [
        {
          label: 'Sources',
          value: uploaded.length
            ? `${uploaded.map((k) => datasetDef(k).label).join(', ')} uploaded; the rest sample`
            : 'Every dataset is the sample',
        },
        {
          label: 'Versions',
          value: DATASET_KEYS.map((k) => `${k} ${s.versions[k]?.versionId ?? 'none'}`).join(', '),
        },
        {
          label: 'Reference mappings',
          value: `${fmt(ctx.reference.mappings.length, 'int')} mappings, ${fmt(ctx.reference.total, 'int')} rows changed`,
        },
        { label: 'Metric definitions changed', value: fmt(ctx.metrics.changedCount, 'int') },
      ],
      json: {
        sources: ctx.sources,
        versions: Object.fromEntries(DATASET_KEYS.map((k) => [k, s.versions[k]?.versionId ?? null])),
        referenceMappings: ctx.reference.mappings.length,
        referenceChanges: ctx.reference.changes,
        metricsChanged: ctx.metrics.changedCount,
      },
    },
    {
      id: 'views',
      title: 'Saved views',
      rows: [
        { label: 'Saved views', value: fmt(s.savedViews.count, 'int') },
        { label: 'Applied', value: s.savedViews.applied ?? 'None' },
        { label: 'Set to open Census', value: s.savedViews.startup ?? 'None' },
      ],
      json: s.savedViews,
    },
    {
      id: 'panels',
      title: 'Panels',
      rows: [
        {
          label: 'Records panel',
          value: s.panels.drillDepth ? `${s.panels.drillDepth} deep, top: ${s.panels.drillTop}` : 'Closed',
        },
        {
          label: 'Help',
          value: `${s.panels.helpOpen ? 'Open' : 'Closed'}${s.panels.tour ? `, tour ${s.panels.tour}` : ''}`,
        },
        {
          label: 'Ask',
          value: `${s.panels.askOpen ? 'Open' : 'Closed'}, ${fmt(s.panels.askTurns, 'int')} questions this chat`,
        },
        { label: 'Ask key', value: s.panels.askKey },
        { label: 'Ask model', value: s.panels.model },
        { label: 'Ask workspace ID', value: s.panels.workspaceSet ? 'set' : 'not set' },
        { label: 'Ask connects with', value: s.panels.askVia ?? 'own key' },
        { label: 'Ask team passcode', value: s.panels.askPasscode ?? 'not set' },
      ],
      json: s.panels,
    },
    {
      id: 'storage',
      title: 'Storage',
      rows: [
        { label: 'Storage answered at start-up', value: yes(!s.storage.unavailable) },
        { label: 'Keys', value: s.storage.rows ? fmt(storageRows.length, 'int') : 'Not read yet' },
        { label: 'localStorage', value: bytesText(totals.localStorage) },
        { label: 'sessionStorage', value: bytesText(totals.sessionStorage) },
        { label: 'IndexedDB', value: bytesText(totals.IndexedDB) },
      ],
      json: {
        storageUnavailable: s.storage.unavailable,
        keys: storageRows.map((r) => ({ key: r.key, where: r.where, bytes: r.bytes })),
      },
    },
  ]
}

/**
 * Hand-built fixtures for the Action center engine tests: a small org, contexts over it, items
 * and fake views that hand them over. Not imported by the app.
 */
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  emptyDatasets,
  type ISODate,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'
import type { ActionItem } from '@/views/types'
import type { OpenAction, ViewSource } from './collect'
import { markKeyOf } from './marks'

export const AS_OF: ISODate = '2026-09-30'

export function emp(employeeId: string, name: string, managerId: string | null = null): Employee {
  return {
    employeeId,
    name,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    country: 'United States',
    level: 'L4',
    managerId,
    hireDate: '2020-01-06',
    terminationDate: null,
    terminationType: null,
    terminationReason: null,
    regrettable: null,
    employmentType: 'Employee',
  }
}

/**
 * The org: Lena Ortiz (E1) leads Sam Lee (E2), who manages E3 to E8; Rita Rao (E9, a recruiter)
 * reports to Lena; Tom Fox (E10) sits outside Lena's org.
 */
export const ORG: Employee[] = [
  emp('E1', 'Lena Ortiz'),
  emp('E2', 'Sam Lee', 'E1'),
  ...[3, 4, 5, 6, 7, 8].map((n) => emp(`E${n}`, `Person ${n}`, 'E2')),
  emp('E9', 'Rita Rao', 'E1'),
  emp('E10', 'Tom Fox'),
]

const sources = (data: Datasets) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

export function ctxOf(
  opts: {
    employees?: Employee[]
    filters?: Partial<Filters>
    standard?: DataStandard
    metrics?: MetricsApi
  } = {},
): AnalyticsContext {
  const data: Datasets = { ...emptyDatasets(), employees: opts.employees ?? ORG }
  return buildContext({
    data,
    sources: sources(data),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: AS_OF,
    showPay: false,
    standard: opts.standard,
    metrics: opts.metrics,
  })
}

let seq = 0
/** An item on the employees data (bronze in fixtures), owned by Sam Lee, due on the as-of date. */
export function item(patch: Partial<ActionItem> = {}): ActionItem {
  seq++
  return {
    id: `talent:test:${seq}`,
    ownerRole: 'manager',
    ownerId: 'E2',
    ownerName: 'Sam Lee',
    due: AS_OF,
    severity: 'warning',
    what: `Item ${seq} is open`,
    subject: { kind: 'employees', id: 'E3', label: 'Person 3' },
    view: 'talent',
    tab: 'learning',
    note: 'Could you take a look this week?',
    uses: ['employees.employeeId', 'employees.managerId'],
    ...patch,
  }
}

/** A view that hands over fixed items; in the leader's scope only items about people in scope. */
export function source(
  key: ViewSource['key'],
  label: string,
  items: ActionItem[] | ((ctx: AnalyticsContext) => ActionItem[]),
): ViewSource {
  return {
    key,
    label,
    tabs: [
      { key: 'learning', label: 'Learning' },
      { key: 'pipeline', label: 'Pipeline' },
    ],
    datasets: ['employees'],
    actions: typeof items === 'function' ? items : () => items,
  }
}

/** Items scoped like a view would: only those whose subject is in the context's employees. */
export const scopedBySubject =
  (items: ActionItem[]) =>
  (ctx: AnalyticsContext): ActionItem[] => {
    const ids = new Set(ctx.data.employees.map((e) => e.employeeId))
    return items.filter((i) => !i.subject.id || ids.has(i.subject.id) || i.subject.kind === 'none')
  }

/** An OpenAction without a context, for pure helpers (filters, groups, notes). */
export function open(patch: Partial<ActionItem> = {}, extra: Partial<OpenAction> = {}): OpenAction {
  const i = item(patch)
  return {
    item: i,
    id: i.id,
    markKey: markKeyOf(i.id),
    role: i.ownerRole,
    roleLabel: 'Managers',
    ownerKey: i.ownerId ? `id:${i.ownerId}` : `team:${i.ownerRole}:${i.ownerName.toLowerCase()}`,
    ownerId: i.ownerId ?? null,
    ownerName: i.ownerName,
    isTeam: false,
    viewLabel: 'Talent',
    tabLabel: 'Learning',
    from: 'Talent · Learning',
    personId: i.subject.id ?? null,
    team: null,
    below: null,
    alsoFrom: [],
    ...extra,
  }
}

/**
 * A small company with known gaps for the Data quality tab's tests: Employees certified (gold)
 * but with termination reason blank for 3 of 10 leavers, Requisitions confirmed (silver),
 * Candidates empty (no data).
 */
import { computeQuality } from '@/data/quality/compute'
import { emptyDatasets, req, roster } from '@/data/quality/test-fixtures'
import type { DatasetVersion, QualityIndex } from '@/data/quality/types'
import { confirmVersion, makeCertification, makeVersion } from '@/data/quality/versions'
import type { DatasetKey, Datasets } from '@/data/schema'
import type { ImpactMetric } from './impact'

export const AS_OF = '2026-09-30'

/** 40 people (10 leavers, 3 of them with no termination reason) and two open requisitions. */
export function gappyCompany(): Datasets {
  const employees = roster().map((e, i) => (i >= 37 ? { ...e, terminationReason: null } : e))
  return { ...emptyDatasets(), employees, requisitions: [req(1), req(2)] }
}

export function version(
  key: DatasetKey,
  data: Datasets,
  patch: Partial<DatasetVersion> = {},
): DatasetVersion {
  return {
    ...makeVersion({
      dataset: key,
      source: 'upload',
      rows: data[key] as object[],
      versionId: `${key}-v2`,
      fileName: `${key}.xlsx`,
      importedAt: '2026-09-29T09:00:00.000Z',
    }),
    ...patch,
  }
}

export function gappyVersions(data: Datasets): Partial<Record<DatasetKey, DatasetVersion>> {
  const employees = confirmVersion(version('employees', data), 'HRIS team', '2026-09-29T10:00:00.000Z')
  return {
    employees: {
      ...employees,
      certification: makeCertification({
        version: employees,
        data,
        asOf: AS_OF,
        at: '2026-09-29T11:00:00.000Z',
        input: { by: 'HRIS team' },
      }),
    },
    requisitions: confirmVersion(version('requisitions', data), 'TA ops', '2026-09-29T10:00:00.000Z'),
  }
}

export function gappyQuality(data = gappyCompany()): QualityIndex {
  return computeQuality(data, gappyVersions(data), undefined, { asOf: AS_OF })
}

const m = (id: string, uses: string[], views: ImpactMetric['views'] = ['hrbp']): ImpactMetric => ({
  id,
  name: id.split('.').pop() ?? id,
  views,
  uses: uses as ImpactMetric['uses'],
})

/** Metrics over the gappy company, with the tier each should have today. */
export const METRICS: ImpactMetric[] = [
  m('hrbp.exits.byReason', ['employees.terminationReason', 'employees.terminationDate']), // bronze
  m('hrbp.exits.reasonShare', ['employees.terminationReason']), // bronze
  m('hrbp.headcount.hires', ['employees.hireDate']), // gold
  m('recruiting.reqs.age', ['requisitions.openedDate', 'employees.hireDate'], ['recruiting']), // silver
  m('hrbp.headcount.total', []), // gold, judged by its view's datasets
  m('quality.rules.fill', [], ['data']), // names no data
  m('recruiting.funnel.sources', ['candidates.source'], ['recruiting']), // no data
]

/** The datasets a metric with no `uses` is judged by: its home view's. */
export const fallbackOf = (x: ImpactMetric): DatasetKey[] =>
  x.views[0] === 'hrbp' ? ['employees'] : x.views[0] === 'recruiting' ? ['requisitions', 'candidates'] : []

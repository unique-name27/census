/**
 * The KPIs and findings a mode shows (docs/ROLES.md, 3.3 and 3.13): one whose metric the mode
 * hides is dropped, and in Manager mode a finding's `people` lists only the manager's org. The
 * KPI strip, the readout and Ask's `view_summary` all ask here, so a hidden number is hidden the
 * same way on screen, in exports and in answers. Pure.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AccessContext } from './context'
import { personInLock } from './records'

type Access = Pick<AccessContext, 'can' | 'lock'>

/** The KPI tiles a mode shows. */
export function kpisInMode<K extends Pick<Kpi, 'metricId'>>(
  access: Access | null | undefined,
  kpis: readonly K[],
): K[] {
  if (!access) return [...kpis]
  return kpis.filter((k) => !k.metricId || access.can(`metric:${k.metricId}`))
}

/** The findings a mode shows, with `people` kept to the manager's org in Manager mode. */
export function findingsInMode(access: Access | null | undefined, findings: readonly Finding[]): Finding[] {
  if (!access) return [...findings]
  const out: Finding[] = []
  for (const f of findings) {
    if (f.metricId && !access.can(`metric:${f.metricId}`)) continue
    if (!access.lock || !f.people?.length) {
      out.push(f)
      continue
    }
    const people = f.people.filter((p) => personInLock(p.id, access))
    out.push(
      people.length === f.people.length
        ? f
        : { ...f, people, ...(f.peopleTotal != null ? { peopleTotal: people.length } : {}) },
    )
  }
  return out
}

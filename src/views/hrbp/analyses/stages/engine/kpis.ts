/**
 * The KPI strip of Engineering by stage (docs/ANALYSES.md, 4.6): engineering FTE and contractors
 * (against 12 months ago), verification per RTL designer (against its reference), open engineering
 * reqs (against the prior quarter end), planned starts with no req (left out where planned starts
 * are hidden) and the share of engineers whose stage is saved. Each tile names its metric, reads
 * its definition from the dictionary and opens the records it counts. Pure.
 */
import type { Kpi } from '@/components/types'
import type { ISODate } from '@/data/schema'
import { addMonths, formatDate, formatMonth, monthEnd, quarterStart } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { tagKpis } from '../../../engine/drillUses'
import { type EngPerson, inFamily, type StagesBase } from './base'
import type { RatioRow } from './capacity'
import { linesSpec, peopleSpec, reqsSpec, titled } from './drills'
import { plain } from './findings'
import { type InFlight, openings, openReqsAt, plannedStarts } from './hiring'
import { PLANNED_USES, REQ_USES, SID, STAGES_USES } from './metrics'
import { count, definitionText } from './wording'

/** The quarter end before the as-of date's quarter: 30 Jun 2026 for 30 Sep 2026. */
export const priorQuarterEnd = (asOf: ISODate): ISODate => monthEnd(addMonths(quarterStart(asOf), -1))

export interface KpiInputs {
  family: string | null
  now: readonly EngPerson[]
  /** Null without leavers in the data (a roster of today only says nothing about a year ago). */
  yearAgo: readonly EngPerson[] | null
  yearAgoDate: ISODate
  ratios: readonly RatioRow[]
  flight: InFlight
}

const sumFte = (xs: readonly EngPerson[]): number => Math.round(xs.reduce((n, p) => n + p.fte, 0) * 10) / 10

export function stagesKpis(b: StagesBase, x: KpiInputs): Kpi[] {
  const m = b.ctx.metrics
  const min = b.set.minGroup
  const scope = b.ctx.isCompany ? null : b.ctx.scopeLabel
  const fam = x.family
  const employees = x.now.filter((p) => b.counted(p))
  const contractors = x.now.filter((p) => p.worker === 'Contractor')
  const agoEmployees = x.yearAgo?.filter((p) => b.counted(p)) ?? null
  const agoContractors = x.yearAgo?.filter((p) => p.worker === 'Contractor') ?? null
  const who = b.set.countInterns ? 'Engineering employees and interns' : 'Engineering employees'
  const ago = `vs ${formatDate(x.yearAgoDate)}`
  const fte = sumFte(employees)
  const partTime = employees.filter((p) => p.fte < 1).length
  const tiles: Kpi[] = []

  tiles.push({
    id: 'stages-fte',
    metricId: SID.capacity,
    label: 'Engineering FTE',
    value: employees.length ? fte : null,
    format: 'num1',
    delta: agoEmployees && employees.length ? Math.round((fte - sumFte(agoEmployees)) * 10) / 10 : null,
    deltaLabel: ago,
    goodDirection: null,
    note: b.hasFte
      ? `${count(employees.length, 'employee')}${partTime ? `, ${partTime} part time` : ''}`
      : `${count(employees.length, 'employee')}, each counted as 1`,
    definition: definitionText(m, SID.capacity),
    formula: `${fmt(fte, 'num1')} FTE across ${count(employees.length, 'engineering employee')}${
      b.hasFte ? '' : '. No FTE in Employees, so each person counts as 1'
    }. Contractors are the next tile.`,
    drill: () => peopleSpec(b, titled(who, fam, scope), employees),
    deltaDrill: agoEmployees
      ? () =>
          peopleSpec(b, titled(`${who} on ${formatDate(x.yearAgoDate)}`, fam, scope), agoEmployees, {
            date: x.yearAgoDate,
          })
      : undefined,
    uses: STAGES_USES,
  })

  const heads = employees.length + contractors.length
  tiles.push({
    id: 'stages-contractors',
    metricId: SID.capacity,
    label: 'Contractors',
    value: contractors.length,
    format: 'int',
    delta: agoContractors ? contractors.length - agoContractors.length : null,
    deltaLabel: ago,
    goodDirection: null,
    note:
      heads >= min && contractors.length
        ? `${fmt(contractors.length / heads, 'pct0')} of engineering heads`
        : contractors.length
          ? undefined
          : 'No engineering contractors',
    definition: definitionText(m, SID.capacity),
    formula: `${count(contractors.length, 'contractor')} beside ${count(
      employees.length,
      'employee',
    )} in engineering stages. Contractors are always their own series.`,
    drill: contractors.length
      ? () => peopleSpec(b, titled('Engineering contractors', fam, scope), contractors)
      : undefined,
    deltaDrill: agoContractors?.length
      ? () =>
          peopleSpec(
            b,
            titled(`Engineering contractors on ${formatDate(x.yearAgoDate)}`, fam, scope),
            agoContractors,
            { date: x.yearAgoDate },
          )
      : undefined,
    uses: STAGES_USES,
  })

  const v = x.ratios.find((r) => r.id === 'verification')
  if (v) {
    const suppressed = v.value == null && v.bottom > 0
    // While contractors do not count in ratios, the ratio with them follows the reference.
    const withThem =
      !b.set.ratioContractors && v.contractorsTop + v.contractorsBottom > 0 && v.withContractors != null
        ? `; ${plain(v.withContractors)} with contractors`
        : ''
    const reference =
      v.reference == null
        ? 'No reference set'
        : v.status === 'below'
          ? `Below the ${plain(v.reference)} reference`
          : `Reference ${plain(v.reference)}`
    tiles.push({
      id: 'stages-verification-ratio',
      metricId: SID.ratios,
      label: 'Verification per RTL designer',
      value: v.value,
      format: 'num2',
      suppressed,
      // Nobody in RTL design: say so rather than a bare dash.
      note: v.value == null && v.bottom === 0 ? v.statusLabel : `${reference}${withThem}`,
      definition: definitionText(m, SID.ratios),
      formula:
        v.value == null
          ? undefined
          : `${count(v.top, 'person', 'people')} in design verification ÷ ${v.bottom.toLocaleString(
              'en-US',
            )} in RTL design${b.set.ratioContractors ? ', contractors included' : ', employees only'}.`,
      drill:
        v.value == null
          ? undefined
          : () =>
              peopleSpec(b, titled('Design verification and RTL design', fam, scope), [
                ...v.people.top,
                ...v.people.bottom,
              ]),
      uses: STAGES_USES,
    })
  }

  const open = x.flight.reqs.filter((r) => inFamily(r.place, fam))
  const held = x.flight.onHold.filter((r) => inFamily(r.place, fam))
  const qEnd = priorQuarterEnd(b.asOf)
  const then = openReqsAt(b, qEnd).filter((r) => inFamily(r.place, fam))
  const n = openings(open)
  tiles.push({
    id: 'stages-open-reqs',
    metricId: SID.hiring,
    label: 'Open engineering reqs',
    value: x.flight.hasReqs ? n : null,
    format: 'int',
    delta: x.flight.hasReqs ? n - openings(then) : null,
    deltaLabel: `vs ${formatDate(qEnd)}`,
    goodDirection: null,
    note: !x.flight.hasReqs
      ? 'No requisitions loaded'
      : held.length
        ? `${openings(held)} on hold, not counted`
        : `${count(open.length, 'req')}`,
    definition: definitionText(m, SID.hiring),
    formula: x.flight.hasReqs
      ? `Openings of ${count(open.length, 'open req')} in engineering stages on ${formatDate(
          b.asOf,
        )}. A req takes the most common job function of its department.`
      : undefined,
    drill: open.length
      ? () => reqsSpec(b, titled('Open engineering reqs', fam, scope), open, { uses: REQ_USES })
      : undefined,
    deltaDrill: then.length
      ? () =>
          reqsSpec(b, titled(`Engineering reqs open on ${formatDate(qEnd)}`, fam, scope), then, {
            uses: REQ_USES,
          })
      : undefined,
    noteDrill: held.length
      ? () => reqsSpec(b, titled('Engineering reqs on hold', fam, scope), held, { uses: REQ_USES })
      : undefined,
    uses: REQ_USES,
  })

  if (x.flight.planned) {
    const lines = x.flight.planned.filter((l) => inFamily(l.place, fam))
    const w = x.flight.window
    const planned = plannedStarts(lines)
    tiles.push({
      id: 'stages-planned',
      metricId: SID.planned,
      label: 'Planned, no req yet',
      value: x.flight.hasPlan ? planned : null,
      format: 'int',
      goodDirection: 'down',
      note: x.flight.hasPlan
        ? `Starts ${formatMonth(w.start)} to ${formatMonth(w.end)}`
        : 'No hiring plan loaded',
      definition: definitionText(m, SID.planned),
      formula: x.flight.hasPlan
        ? `${count(planned, 'planned start')} on ${count(lines.length, 'plan line')} with no req, starts ${formatMonth(
            w.start,
          )} to ${formatMonth(w.end)}.`
        : undefined,
      drill: lines.length
        ? () =>
            linesSpec(b, titled('Planned engineering starts with no req', fam, scope), lines, {
              uses: PLANNED_USES,
            })
        : undefined,
      uses: PLANNED_USES,
    })
  }

  const saved = employees.filter((p) => p.source === 'Saved')
  const rest = employees.filter((p) => p.source !== 'Saved')
  tiles.push({
    id: 'stages-mapped',
    metricId: SID.mapped,
    label: 'Stage recorded',
    value: employees.length >= min ? saved.length / employees.length : null,
    suppressed: employees.length > 0 && employees.length < min,
    format: 'pct',
    goodDirection: 'up',
    note: rest.length ? `${rest.length} in a proposed or no stage` : 'Every stage saved',
    definition: definitionText(m, SID.mapped),
    formula: `${count(saved.length, 'engineering employee')} in a job function with a saved stage ÷ ${employees.length.toLocaleString(
      'en-US',
    )}.`,
    drill: rest.length
      ? () => peopleSpec(b, titled('Engineers in a proposed or no stage', fam, scope), rest)
      : undefined,
    noteDrill: rest.length
      ? () => peopleSpec(b, titled('Engineers in a proposed or no stage', fam, scope), rest)
      : undefined,
    uses: STAGES_USES,
  })
  return tagKpis(tiles)
}

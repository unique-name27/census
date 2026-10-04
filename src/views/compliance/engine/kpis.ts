/**
 * The Compliance KPI strip (docs/VIEWS.md): expiring in 90 days (note: in 180 days),
 * reverification on time, reverification overdue, I-9 Section 2 within 3 business days, working
 * without an export license in force, and required training on time (the Talent metric, linked).
 * Every tile carries its metric, its lineage and the records behind it. Pure.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { isMaterialChange } from '@/lib/stats'
import { M, TALENT_REQUIRED_TRAINING } from '../metrics'
import { type DrillScope, expiryDrill, i9Drill, licenseDrill, trainingDrill } from './drills'
import { USES } from './lineage'
import type { ComplianceCore, ComplianceModel } from './model'
import { businessDaysText, daysText, ofText, people } from './wording'

const NO_RTW = 'Upload Right to work to see this'

/** The tiles the scorecard reads and the strip leads with. */
export function coreKpis(m: ComplianceCore, s: DrillScope): { reverification: Kpi; i9: Kpi; license: Kpi } {
  const { work, i9, exportControl: ex, base, settings: cfg } = m
  const has = base.has.rightToWork
  const min = cfg.minGroup
  const rev = work.reverification
  const revSmall = rev.judged.length > 0 && rev.judged.length < min
  const reverification: Kpi = {
    id: 'compliance-reverification',
    metricId: M.reverificationOnTime,
    label: 'Reverification on time',
    value: has && base.has.expiry ? rev.rate : null,
    format: 'pct',
    goodDirection: 'up',
    suppressed: revSmall,
    note: !has
      ? NO_RTW
      : !base.has.expiry
        ? 'Authorization expiry is missing'
        : rev.judged.length
          ? `${ofText(rev.onTime.length, rev.judged.length)} started ${daysText(cfg.leadDays)} ahead`
          : 'No authorization due for reverification',
    tab: 'work',
    drill:
      rev.rate != null
        ? () =>
            expiryDrill(s, rev.judged, {
              title: 'Authorizations judged on reverification',
              note: `${ofText(rev.onTime.length, rev.judged.length)} started at least ${daysText(cfg.leadDays)} before the expiry date. Not started and started late come first.`,
              uses: USES.reverification,
            })
        : null,
    // "10 of 15 started 90 days ahead": the 10 that did.
    noteDrill:
      rev.rate != null && rev.onTime.length
        ? () =>
            expiryDrill(s, rev.onTime, {
              title: `Reverification started ${daysText(cfg.leadDays)} ahead`,
              note: `Started at least ${daysText(cfg.leadDays)} before the expiry date.`,
              uses: USES.reverification,
            })
        : null,
    uses: USES.reverification,
  }

  const cur = i9.current
  const prior = i9.prior
  const i9Kpi: Kpi = {
    id: 'compliance-i9',
    metricId: M.i9Section2,
    label: `I-9 Section 2 within ${businessDaysText(cfg.i9Days)}`,
    value: has && base.has.i9Section2 ? cur.rate : null,
    format: 'pct',
    delta: cur.rate != null && prior.rate != null ? cur.rate - prior.rate : null,
    deltaLabel: 'vs prior period',
    goodDirection: 'up',
    deltaMaterial:
      cur.rate != null &&
      prior.rate != null &&
      isMaterialChange(cur.rate, prior.rate, cur.judged.length, prior.judged.length),
    suppressed: cur.judged.length > 0 && cur.judged.length < min,
    note: !has
      ? NO_RTW
      : !base.has.i9Section2
        ? 'I-9 Section 2 date is missing'
        : cur.judged.length
          ? `${ofText(cur.onTime.length, cur.judged.length)} US starts`
          : 'No US starts in the period',
    tab: 'work',
    drill:
      cur.rate != null
        ? () =>
            i9Drill(s, cur.judged, {
              title: 'US starts judged on I-9 Section 2',
              note: `${ofText(cur.onTime.length, cur.judged.length)} completed Section 2 within ${businessDaysText(cfg.i9Days)} of the start. Late and missing come first.`,
              uses: USES.i9,
            })
        : null,
    deltaDrill:
      cur.rate != null && prior.rate != null
        ? () =>
            i9Drill(s, prior.judged, {
              title: 'US starts judged on I-9 Section 2, prior period',
              subtitle: `${s.prior} · ${s.scope}`,
              uses: USES.i9,
            })
        : null,
    // "112 of 120 US starts": the ones completed in time.
    noteDrill:
      cur.rate != null && cur.onTime.length
        ? () =>
            i9Drill(s, cur.onTime, {
              title: `I-9 Section 2 completed within ${businessDaysText(cfg.i9Days)}`,
              uses: USES.i9,
            })
        : null,
    uses: USES.i9,
  }

  const license: Kpi = {
    id: 'compliance-without-license',
    metricId: M.withoutLicense,
    label: 'Working without a license in force',
    value: has && base.has.exportLicense ? ex.without.length : null,
    format: 'int',
    goodDirection: 'down',
    note: !has
      ? NO_RTW
      : !base.has.exportLicense
        ? 'Export license fields are missing'
        : ex.pendingStarts.length
          ? `${people(ex.pendingStarts.length)} starting with a license pending`
          : `${people(ex.required.length)} need a license`,
    tab: 'export',
    drill:
      has && ex.without.length
        ? () =>
            licenseDrill(s, ex.without, {
              title: 'Working without an export license in force',
              uses: USES.exportLicense,
            })
        : null,
    noteDrill: ex.pendingStarts.length
      ? () =>
          licenseDrill(s, ex.pendingStarts, {
            title: `Starting in the next ${daysText(cfg.pendingDays)} with a license not in force`,
            uses: USES.exportLicense,
          })
      : ex.required.length
        ? () =>
            licenseDrill(s, ex.required, {
              title: 'People whose role needs an export license',
              uses: USES.exportLicense,
            })
        : null,
    uses: USES.exportLicense,
  }
  return { reverification, i9: i9Kpi, license }
}

export function buildKpis(ctx: AnalyticsContext, m: ComplianceModel, s: DrillScope): Kpi[] {
  const { work, base, settings: cfg, training } = m
  const has = base.has.rightToWork
  const core = coreKpis(m, s)
  const expiring: Kpi = {
    id: 'compliance-expiring',
    metricId: M.expiring,
    label: `Expiring in ${daysText(cfg.headlineDays)}`,
    value: has && base.has.expiry ? work.expiringHeadline.length : null,
    format: 'int',
    goodDirection: null,
    note: !has
      ? NO_RTW
      : !base.has.expiry
        ? 'Authorization expiry is missing'
        : `${people(work.expiringHorizon.length)} in ${daysText(cfg.horizonDays)}`,
    tab: 'work',
    drill:
      has && work.expiringHeadline.length
        ? () =>
            expiryDrill(s, work.expiringHeadline, {
              title: `Work authorizations ending in the next ${daysText(cfg.headlineDays)}`,
              uses: USES.expiring,
            })
        : null,
    noteDrill:
      has && work.expiringHorizon.length
        ? () =>
            expiryDrill(s, work.expiringHorizon, {
              title: `Work authorizations ending in the next ${daysText(cfg.horizonDays)}`,
              uses: USES.expiring,
            })
        : null,
    uses: USES.expiring,
  }
  const overdue: Kpi = {
    id: 'compliance-reverification-overdue',
    metricId: M.reverificationOverdue,
    label: 'Reverification overdue',
    value: has && base.has.expiry ? work.overdue.length : null,
    format: 'int',
    goodDirection: 'down',
    note: !has
      ? NO_RTW
      : work.startedLate.length
        ? `${fmtLate(work.startedLate.length)} started late`
        : `Ending within ${daysText(cfg.leadDays)}, not started`,
    tab: 'work',
    drill: work.overdue.length
      ? () =>
          expiryDrill(s, work.overdue, {
            title: `Reverification not started, authorization ending within ${daysText(cfg.leadDays)}`,
            uses: USES.reverification,
          })
      : null,
    noteDrill: work.startedLate.length
      ? () =>
          expiryDrill(s, work.startedLate, {
            title: `Reverification started less than ${daysText(cfg.leadDays)} before the expiry date`,
            uses: USES.reverification,
          })
      : null,
    uses: USES.reverification,
  }
  const req = training.required
  const trainingUses = ctx.metrics.usesOf(TALENT_REQUIRED_TRAINING)
  const trainingKpi: Kpi = {
    id: 'compliance-training',
    metricId: TALENT_REQUIRED_TRAINING,
    label: 'Required training on time',
    value: req.available ? req.rate : null,
    format: 'pct',
    goodDirection: 'up',
    suppressed: req.available && req.due > 0 && req.due < cfg.minGroup,
    note: req.available
      ? `${ofText(req.onTime, req.due)} assignments · from Talent`
      : req.loaded
        ? 'Due date is missing'
        : 'Upload Learning to see this',
    // Talent > Learning has the detail; this tile is a summary of it.
    link: { view: 'talent', tab: 'learning', label: 'Talent, Learning' },
    drill:
      req.rate != null
        ? () =>
            trainingDrill(s, req.records, {
              title: 'Required assignments due in the period',
              note: `${ofText(req.onTime, req.due)} were completed by the due date. Talent > Learning has the detail.`,
              uses: trainingUses,
            })
        : null,
    uses: trainingUses,
  }
  return [expiring, core.reverification, overdue, core.i9, core.license, trainingKpi]
}

const fmtLate = (n: number) => (n === 1 ? '1 more' : `${n} more`)

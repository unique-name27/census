/**
 * Scenario diff (the old tool's ScenarioDiffModal, as a sheet): what the scenario changes against
 * the org on the as-of date. Spans, layers, managers gaining their first report or losing their
 * last, new span outliers, people reporting across departments, and moves that were blocked.
 * Every number opens the people it affects, and hovering a label shows its definition from the
 * metric dictionary. Span outliers use the wide-span and narrow-span settings in force.
 */
import type { ReactNode } from 'react'
import { SeverityIcon, spanClass } from '@/components'
import { cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { Drill, type DrillSource, type DrillSpec } from '@/drill'
import { DASH, fmt, plural } from '@/lib/format'
import {
  type DrillScope,
  defText,
  narrowSpanLabel,
  type OrgRules,
  type OrgTree,
  peopleAtLayer,
  peopleDrill,
  removedDrill,
  reportingChangesDrill,
  type ScenarioDiff,
  scopeLine,
  spanChangesDrill,
} from '../engine'
import { ORG_METRIC, type OrgMetricId } from '../metrics'
import type { BlockedAttempt } from './state'

export function DiffPanel({
  diff,
  rules,
  before,
  after,
  scope,
  blocked,
  describe,
  onJump,
  onClearBlocked,
}: {
  diff: ScenarioDiff
  /** The settings in force, for the span outlier labels. */
  rules: OrgRules
  /** The org today and in the scenario, for the people behind each number. */
  before: OrgTree
  after: OrgTree
  scope: DrillScope
  blocked: readonly BlockedAttempt[]
  describe: (b: BlockedAttempt) => string
  onJump: (id: string) => void
  onClearBlocked: () => void
}) {
  const { metrics } = useAnalytics()
  const define = (id: OrgMetricId) => defText(metrics, id)
  const empty = !diff.reportingChanges.length && !diff.removed.length
  const sub = scopeLine(scope)
  const wide = `${rules.wideSpan}+`
  const narrow = narrowSpanLabel(rules).toLowerCase()
  const narrowNew = rules.narrowSpan <= 1 ? 'spans of 1' : `spans of ${rules.narrowSpan} or fewer`
  const when = (t: OrgTree) => (t === before ? 'today' : 'in the scenario')
  const managers = (t: OrgTree) => [...t.people.keys()].filter((id) => (t.directs.get(id) ?? 0) > 0)
  const managersDrill = (t: OrgTree) => () =>
    peopleDrill(t, managers(t), {
      title: `People managers ${when(t)}`,
      subtitle: sub,
      columns: ['directs', 'totalOrg'],
      sortBy: 'directs',
    })
  const spanDrill = (t: OrgTree, avg: number | null) => () =>
    peopleDrill(t, managers(t), {
      title: `Spans of control ${when(t)}`,
      subtitle: sub,
      columns: ['directs'],
      sortBy: 'directs',
      note:
        avg == null
          ? undefined
          : `Average span = ${fmt(avg, 'num1')} direct reports across ${plural(managers(t).length, 'manager')}. Direct reports is the measured value.`,
    })
  const layersDrill = (t: OrgTree) => () =>
    peopleDrill(t, [...t.people.keys()], {
      title: `People by layer ${when(t)}`,
      subtitle: sub,
      columns: ['layer', 'directs'],
      sortBy: 'layer',
      note: 'Layer 1 is the top of the chart. Deepest first.',
    })
  const layerDrill = (t: OrgTree, layer: number) => () =>
    peopleDrill(t, peopleAtLayer(t, t.rootId, layer), {
      title: `People in layer ${layer} ${when(t)}`,
      subtitle: sub,
      columns: t === before ? ['directs'] : ['manager', 'directs'],
      managerLabel: 'Manager in the scenario',
      note: 'Layer 1 is the top of the chart.',
    })
  const afterList = (title: string) => (ids: readonly string[]) =>
    peopleDrill(after, ids, {
      title,
      subtitle: sub,
      columns: ['manager', 'directs', 'totalOrg'],
      managerLabel: 'Manager in the scenario',
    })

  return (
    <section
      aria-labelledby="org-diff-title"
      className={cx(spanClass(7), 'rounded-sheet bg-sheet px-4 pt-3.5 pb-4')}
    >
      <h3 id="org-diff-title" className="cut-head text-[15px] leading-snug font-semibold">
        Scenario compared with today
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-2">
        What the moves change against the org on the as-of date. Click a number to list the people.
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-control bg-rule sm:grid-cols-3">
        <Tile
          label="People changing manager"
          title={define(ORG_METRIC.reportingChanges)}
          value={fmt(diff.reportingChanges.length, 'int')}
          drill={() => reportingChangesDrill(after, diff.reportingChanges, scope)}
        />
        <Tile
          label="Spans that change"
          title={define(ORG_METRIC.spanChanges)}
          value={fmt(diff.spanChanges.length, 'int')}
          drill={() => spanChangesDrill(before, after, diff.spanChanges, scope)}
        />
        <Tile
          label="Exits"
          title={define(ORG_METRIC.scenarioExits)}
          value={fmt(diff.removed.length, 'int')}
          drill={() => removedDrill(before, diff.removed, scope)}
        />
        <Tile
          label="People managers"
          title={define(ORG_METRIC.managers)}
          before={diff.managers.before}
          after={diff.managers.after}
          format="int"
          drillBefore={managersDrill(before)}
          drillAfter={managersDrill(after)}
        />
        <Tile
          label="Average span"
          title={define(ORG_METRIC.avgSpan)}
          before={diff.avgSpan.before}
          after={diff.avgSpan.after}
          format="num1"
          drillBefore={spanDrill(before, diff.avgSpan.before)}
          drillAfter={spanDrill(after, diff.avgSpan.after)}
        />
        <Tile
          label="Layers"
          title={define(ORG_METRIC.layers)}
          before={diff.layers.before}
          after={diff.layers.after}
          format="int"
          drillBefore={layersDrill(before)}
          drillAfter={layersDrill(after)}
        />
      </dl>

      {empty ? (
        <p className="mt-4 text-[13px] text-muted">
          No changes yet. Drag a card onto a new manager to start.
        </p>
      ) : (
        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <List
            title="First direct report"
            definition={define(ORG_METRIC.firstReport)}
            empty="Nobody becomes a manager."
            items={diff.managersCreated.map((m) => ({
              id: m.id,
              text: m.name,
              note: plural(m.directs, 'report'),
            }))}
            drillOf={afterList('People who gain their first direct report')}
            onJump={onJump}
          />
          <List
            title="No direct reports left"
            definition={define(ORG_METRIC.noReportsLeft)}
            empty="No manager loses their whole team."
            items={diff.managersEmptied.map((m) => ({ id: m.id, text: m.name, note: `had ${m.before}` }))}
            drillOf={(ids) =>
              peopleDrill(after, ids, {
                title: 'Managers left with no direct reports',
                subtitle: sub,
                more: {
                  columns: [{ key: 'had', label: 'Direct reports today', format: 'int' }],
                  values: (e) => ({ had: before.directs.get(e.employeeId) ?? 0 }),
                },
              })
            }
            onJump={onJump}
          />
          <List
            title={`New wide spans (${wide})`}
            definition={define(ORG_METRIC.wideSpan)}
            empty="No new wide spans."
            severity="warning"
            items={diff.newWideSpans.map((m) => ({
              id: m.id,
              text: m.name,
              note: plural(m.directs, 'report'),
            }))}
            drillOf={afterList(`Managers with a new wide span (${wide})`)}
            onJump={onJump}
          />
          <List
            title={`New ${narrowNew}`}
            definition={define(ORG_METRIC.narrowSpan)}
            empty={`No new ${narrowNew}.`}
            severity="info"
            items={diff.newSpansOfOne.map((m) => ({ id: m.id, text: m.name }))}
            drillOf={afterList(`Managers with a new ${narrow}`)}
            onJump={onJump}
          />
          <List
            title="Reporting across departments"
            definition={define(ORG_METRIC.crossDepartment)}
            empty="Everyone moved stays within their department."
            items={diff.crossDept.map((c) => ({
              id: c.id,
              text: c.name,
              note: `${c.department} → ${c.managerDepartment}`,
            }))}
            drillOf={(ids) => {
              const pick = new Set(ids)
              return reportingChangesDrill(
                after,
                diff.reportingChanges.filter((r) => pick.has(r.id)),
                scope,
                'People reporting to a manager in another department',
              )
            }}
            onJump={onJump}
          />
          <div>
            <h4 className="eyebrow mb-1.5" title={define(ORG_METRIC.layers)}>
              People per layer
            </h4>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th scope="col" className="pb-0.5 text-left font-normal">
                    <span className="sr-only">Layer</span>
                  </th>
                  <th scope="col" className="pb-0.5 text-right font-normal">
                    Today
                  </th>
                  <th scope="col" className="pb-0.5 text-right font-normal">
                    Scenario
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.layers.byDepth.map((l) => (
                  <tr key={l.layer} className="border-t border-rule first:border-t-0">
                    <th scope="row" className="py-0.5 text-left font-normal text-muted">
                      Layer {l.layer}
                    </th>
                    <td className="tnum py-0.5 text-right text-ink-2">
                      <Count n={l.before} drill={layerDrill(before, l.layer)} />
                    </td>
                    <td
                      className={cx(
                        'tnum py-0.5 pl-3 text-right',
                        l.after !== l.before ? 'font-semibold text-ink' : 'text-ink-2',
                      )}
                    >
                      <Count n={l.after} drill={layerDrill(after, l.layer)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="mt-5 border-t border-rule pt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <h4 className="eyebrow">Blocked moves</h4>
            <button
              type="button"
              onClick={onClearBlocked}
              className="ml-auto text-[12px] text-link hover:underline"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {blocked.slice(0, 5).map((b, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <SeverityIcon severity="critical" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-medium text-ink">{describe(b)}.</span>{' '}
                  <span className="text-ink-2">{b.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** A count that opens its people; zero stays plain. */
function Count({ n, drill }: { n: number; drill: DrillSource }) {
  const text = fmt(n, 'int')
  return n > 0 ? <Drill spec={drill}>{text}</Drill> : text
}

function Tile({
  label,
  title,
  value,
  before,
  after,
  format,
  drill,
  drillBefore,
  drillAfter,
}: {
  label: string
  /** The definition, from the metric dictionary, shown on hover. */
  title?: string
  value?: string
  before?: number | null
  after?: number | null
  format?: 'int' | 'num1'
  drill?: DrillSource
  drillBefore?: DrillSource
  drillAfter?: DrillSource
}) {
  const link = (text: string, src: DrillSource) =>
    src && text !== DASH && text !== '0' ? <Drill spec={src}>{text}</Drill> : text
  const b = fmt(before, format)
  const a = fmt(after, format)
  // Compare what is shown, so "5.9 → 5.9" never appears when only hidden decimals moved.
  const changed = before !== undefined && b !== a
  return (
    <div className="bg-sheet px-3 py-2" title={title}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="cut-head mt-0.5 text-[20px] font-semibold text-ink">
        {value !== undefined ? (
          link(value, drill)
        ) : changed ? (
          <span className="tnum">
            <span className="text-[14px] font-normal text-muted">{link(b, drillBefore)} → </span>
            {link(a, drillAfter)}
          </span>
        ) : (
          link(a, drillAfter)
        )}
      </dd>
    </div>
  )
}

function List({
  title,
  definition,
  items,
  empty,
  severity,
  drillOf,
  onJump,
}: {
  title: string
  /** The definition, from the metric dictionary, shown on hover. */
  definition?: string
  items: { id: string; text: string; note?: string }[]
  empty: string
  severity?: 'warning' | 'info'
  /** The people behind some of the list (all of it, or the ones not named). */
  drillOf: (ids: readonly string[]) => DrillSpec | null
  onJump: (id: string) => void
}) {
  const ids = items.map((it) => it.id)
  let body: ReactNode
  if (!items.length) body = <p className="text-[12px] text-muted">{empty}</p>
  else
    body = (
      <ul className="space-y-0.5 text-[13px]">
        {items.slice(0, 6).map((it) => (
          <li key={it.id} className="flex items-baseline gap-2">
            <button
              type="button"
              className="truncate text-left text-link hover:underline"
              onClick={() => onJump(it.id)}
            >
              {it.text}
            </button>
            {it.note && <span className="shrink-0 text-[12px] text-muted">{it.note}</span>}
          </li>
        ))}
        {items.length > 6 && (
          <li className="text-[12px] text-muted">
            and <Drill spec={() => drillOf(ids.slice(6))}>{fmt(items.length - 6, 'int')} more</Drill>
          </li>
        )}
      </ul>
    )
  return (
    <div>
      <h4 className="eyebrow mb-1.5 flex items-center gap-1.5" title={definition}>
        {title}
        {items.length > 0 && (
          <>
            {severity && <SeverityIcon severity={severity} className="size-3.5" />}
            <Drill
              spec={() => drillOf(ids)}
              label={`Show the ${plural(items.length, 'person', 'people')}: ${title}`}
            >
              {fmt(items.length, 'int')}
            </Drill>
          </>
        )}
      </h4>
      {body}
    </div>
  )
}

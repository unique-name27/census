import { useState } from 'react'
import { BarList, Columns, Figure, HBars, useChartTheme } from '@/charts'
import { Section, Segmented, type Severity } from '@/components'
import { useAnalytics } from '@/data/context'
import { READINESS } from '@/data/schema'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import type { BenchScope, HipoGroupRow, RoleRow } from '../engine/succession'
import { readinessColors } from './colors'
import { benchColumns, hipoColumns, ROLE_DETAIL_COLUMNS, roleColumns } from './columns'
import { DEF } from './defs'

function roleTone(r: RoleRow): Severity | null {
  if (r.status === 'No successor')
    return r.criticality === 'Critical' || r.riskOfLoss === 'High' ? 'critical' : 'warning'
  if (r.status === 'Thin') return 'warning'
  return null
}

/** Folded "Other (k)" groups in gray, so they don't read as one more real group. */
const otherTone = (d: HipoGroupRow) => (d.other ? ('deemph' as const) : ('default' as const))

const BENCH_LABEL: Record<BenchScope, string> = {
  All: 'critical and key roles',
  Critical: 'critical roles',
  Key: 'key roles',
}

export function SuccessionTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const t = useChartTheme()
  const asOf = formatDate(ctx.asOf)
  const succ = m.succession
  const [scope, setScope] = useState<BenchScope>('All')
  const noPlans = !m.has.succession
    ? 'Upload Succession to see this.'
    : succ.roles.length
      ? null
      : 'No succession plans cover roles in this scope.'
  const potCycle = succ.potentialCycle?.cycle
  const noPotential = !m.has.potential
    ? 'Upload Reviews with a potential rating to see this.'
    : succ.hipoAssessed
      ? null
      : 'Nobody in this scope was assessed for potential.'
  const departed = succ.departedSuccessors
    ? ` · ${plural(succ.departedSuccessors, 'named successor has', 'named successors have')} left and ${succ.departedSuccessors === 1 ? 'is' : 'are'} not counted`
    : ''
  const benchTable = succ.benchTable[scope]
  const benchRows = succ.bench[scope].filter((r) => benchTable.some((b) => b.businessUnit === r.businessUnit))
  const named = benchTable.reduce((s, r) => s + r.successors, 0)
  const roles = benchTable.reduce((s, r) => s + r.roles, 0)
  const readyNow = benchTable.reduce((s, r) => s + r.readyNow, 0)
  const noSuccessor = benchTable.reduce((s, r) => s + r.noSuccessor, 0)

  return (
    <>
      <Section
        title="Critical and key roles"
        dek="Every planned role, its incumbent and how ready the bench is. Critical roles come first, and roles with nobody ready now are marked."
      >
        <Figure
          id="talent-critical-roles"
          uses={m.uses['talent-critical-roles']}
          title="Critical and key roles"
          subtitle={`Roles in the succession plan with successors still employed, as of ${asOf}`}
          data={succ.roles}
          columns={roleColumns(m.drill)}
          definitions={[DEF.coverage, DEF.roleStatus, DEF.riskOfLoss]}
          note={`${plural(succ.roles.length, 'role')} · ${succ.criticalCovered} of ${succ.critical} critical roles covered${departed}`}
          tableOnly
          table={{
            maxRows: 15,
            rowTone: roleTone,
            search: 'Search roles or people',
            // A role opens its incumbent; the successor counts open the bench.
            onRowClick: (r) => ctx.org.byId.has(r.incumbentId) && openPerson(r.incumbentId),
          }}
          detail={{ label: 'Roles and successors', columns: ROLE_DETAIL_COLUMNS, rows: () => succ.roles }}
          empty={noPlans}
        />
      </Section>

      <Section
        title="Bench strength"
        dek="How many successors each business unit has named, and how soon they will be ready to step in. Switch between all roles, critical roles and key roles."
      >
        <Figure
          id="talent-bench-strength"
          uses={m.uses['talent-bench-strength']}
          title="Bench strength by business unit"
          subtitle={`Named successors by readiness, ${BENCH_LABEL[scope]}`}
          data={benchTable}
          columns={benchColumns(m.drill, scope)}
          definitions={[DEF.bench, DEF.roleStatus]}
          note={`${plural(named, 'successor')} named for ${plural(roles, 'role')}, ${fmt(readyNow)} ready now · ${plural(noSuccessor, 'role has', 'roles have')} nobody named · as of ${asOf}`}
          span={12}
          actions={
            <Segmented<BenchScope>
              label="Roles counted"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'All', label: 'All roles' },
                { value: 'Critical', label: 'Critical' },
                { value: 'Key', label: 'Key' },
              ]}
            />
          }
          empty={
            noPlans ?? (benchTable.length ? null : `No ${BENCH_LABEL[scope]} are planned in this scope.`)
          }
        >
          <HBars
            data={benchRows}
            y="businessUnit"
            x="successors"
            series="readiness"
            stack
            seriesOrder={READINESS}
            colors={readinessColors(t)}
            onSelect={(d) => drill(m.drill.bench(scope, d.businessUnit, null))}
            onSelectSegment={(d) => drill(m.drill.bench(scope, d.businessUnit, d.readiness))}
            ariaLabel="Named successors by readiness and business unit"
          />
        </Figure>
      </Section>

      <Section
        title="Potential"
        dek={`Where the high potentials from ${potCycle ?? 'the latest annual cycle'} sit, by level and business unit. The 9-box on the Overview tab shows potential against performance.`}
      >
        <Figure
          id="talent-high-potentials-by-level"
          uses={m.uses['talent-high-potentials-by-level']}
          title="High potentials by level"
          subtitle={`Share of people assessed who were rated High potential${potCycle ? `, ${potCycle}` : ''}`}
          data={succ.hipoByLevel}
          columns={hipoColumns('Level', m.drill, 'level')}
          definitions={[DEF.highPotential]}
          note={`${fmt(succ.hipoHigh)} of ${plural(succ.hipoAssessed, 'person', 'people')} assessed · levels under 5 people are folded into Other`}
          span={6}
          empty={noPotential}
        >
          <Columns
            data={succ.hipoByLevel}
            x="group"
            y="share"
            format="pct0"
            tone={otherTone}
            height={240}
            onSelect={(d) => drill(m.drill.hipo('level', d, 'high'))}
            ariaLabel="Share rated high potential by level"
          />
        </Figure>
        <Figure
          id="talent-high-potentials-by-unit"
          uses={m.uses['talent-high-potentials-by-unit']}
          title="High potentials by business unit"
          subtitle={`Share of people assessed who were rated High potential${potCycle ? `, ${potCycle}` : ''}`}
          data={succ.hipoByUnit}
          columns={hipoColumns('Business unit', m.drill, 'businessUnit')}
          definitions={[DEF.highPotential]}
          note={`Overall share ${fmt(succ.hipoShare, 'pct')} · units under 5 people are folded into Other`}
          span={6}
          empty={noPotential}
        >
          <BarList
            data={succ.hipoByUnit}
            label="group"
            value="share"
            format="pct"
            sort="none"
            tone={otherTone}
            ref={
              succ.hipoShare != null
                ? { value: succ.hipoShare, label: `All ${fmt(succ.hipoShare, 'pct0')}` }
                : undefined
            }
            secondary={(d) => `n = ${fmt(d.assessed)}`}
            onSelect={(d) => drill(m.drill.hipo('businessUnit', d, 'high'))}
            ariaLabel="Share rated high potential by business unit"
          />
        </Figure>
      </Section>
    </>
  )
}

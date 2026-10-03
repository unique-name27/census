import { BarList, Columns, Figure, HBars } from '@/charts'
import { Section, type Severity } from '@/components'
import { useAnalytics } from '@/data/context'
import { READINESS } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { TalentModel } from '../engine'
import type { RoleRow } from '../engine/succession'
import { BENCH_COLUMNS, hipoColumns, PIPELINE_COLUMNS, ROLE_COLUMNS, ROLE_DETAIL_COLUMNS } from './columns'
import { DEF } from './defs'

function roleTone(r: RoleRow): Severity | null {
  if (r.status === 'No successor')
    return r.criticality === 'Critical' || r.riskOfLoss === 'High' ? 'critical' : 'warning'
  if (r.status === 'Thin') return 'warning'
  return null
}

export function SuccessionTab({ m }: { m: TalentModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const succ = m.succession
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

  return (
    <>
      <Section
        title="Critical and key roles"
        dek="Every planned role, its incumbent and how ready the bench is. Critical roles come first, and roles with nobody ready now are marked."
      >
        <Figure
          id="talent-critical-roles"
          title="Critical and key roles"
          subtitle={`Roles in the succession plan with successors still employed, as of ${asOf}`}
          data={succ.roles}
          columns={ROLE_COLUMNS}
          definitions={[DEF.coverage, DEF.roleStatus, DEF.riskOfLoss]}
          note={`${plural(succ.roles.length, 'role')} · ${succ.criticalCovered} of ${succ.critical} critical roles covered${departed}`}
          tableOnly
          table={{ maxRows: 15, rowTone: roleTone, search: 'Search roles or people' }}
          detail={{ label: 'Roles and successors', columns: ROLE_DETAIL_COLUMNS, rows: () => succ.roles }}
          empty={noPlans}
        />
      </Section>

      <Section
        title="Bench strength"
        dek="How many successors each business unit has named, and how soon they will be ready to step in."
      >
        <Figure
          id="talent-bench-strength"
          title="Bench strength by business unit"
          subtitle="Named successors by readiness, critical and key roles"
          data={succ.benchTable}
          columns={BENCH_COLUMNS}
          definitions={[DEF.bench]}
          note={`${plural(
            succ.benchTable.reduce((s, r) => s + r.successors, 0),
            'successor',
          )} named for ${plural(succ.roles.length, 'role')} · as of ${asOf}`}
          span={6}
          empty={noPlans}
        >
          <HBars
            data={succ.bench}
            y="businessUnit"
            x="successors"
            series="readiness"
            stack
            seriesOrder={READINESS}
            ariaLabel="Named successors by readiness and business unit"
          />
        </Figure>
        <Figure
          id="talent-readiness-pipeline"
          title="Successor readiness pipeline"
          subtitle="Named successors by readiness, split by how critical the role is"
          data={succ.pipeline}
          columns={PIPELINE_COLUMNS}
          definitions={[DEF.bench]}
          note={`As of ${asOf}`}
          span={6}
          empty={noPlans}
        >
          <Columns
            data={succ.pipeline}
            x="readiness"
            y="successors"
            series="criticality"
            stack
            seriesOrder={['Critical', 'Key']}
            xOrder={READINESS}
            height={260}
            ariaLabel="Named successors by readiness and role criticality"
          />
        </Figure>
      </Section>

      <Section
        title="Potential"
        dek={`Where the high potentials from ${potCycle ?? 'the latest annual cycle'} sit, by level and business unit. The 9-box on the Overview tab shows potential against performance.`}
      >
        <Figure
          id="talent-high-potentials-by-level"
          title="High potentials by level"
          subtitle={`Share of people assessed who were rated High potential${potCycle ? `, ${potCycle}` : ''}`}
          data={succ.hipoByLevel}
          columns={hipoColumns('Level')}
          definitions={[DEF.highPotential]}
          note={`${fmt(succ.hipoHigh)} of ${plural(succ.hipoAssessed, 'person', 'people')} assessed · levels under 5 are hidden`}
          span={6}
          empty={noPotential}
        >
          <Columns
            data={succ.hipoByLevel}
            x="group"
            y="share"
            format="pct0"
            height={240}
            ariaLabel="Share rated high potential by level"
          />
        </Figure>
        <Figure
          id="talent-high-potentials-by-unit"
          title="High potentials by business unit"
          subtitle={`Share of people assessed who were rated High potential${potCycle ? `, ${potCycle}` : ''}`}
          data={succ.hipoByUnit}
          columns={hipoColumns('Business unit')}
          definitions={[DEF.highPotential]}
          note={`Overall share ${fmt(succ.hipoShare, 'pct')} · groups under 5 are hidden`}
          span={6}
          empty={noPotential}
        >
          <BarList
            data={succ.hipoByUnit}
            label="group"
            value="share"
            format="pct"
            ref={
              succ.hipoShare != null
                ? { value: succ.hipoShare, label: `All ${fmt(succ.hipoShare, 'pct0')}` }
                : undefined
            }
            secondary={(d) => `n = ${fmt(d.assessed)}`}
            ariaLabel="Share rated high potential by business unit"
          />
        </Figure>
      </Section>
    </>
  )
}

/**
 * Statutory deadlines: the Atlas calendar entries in the look-ahead for the jurisdictions where
 * people in scope work, the jurisdictions themselves, and the Atlas sources behind them.
 */
import { type Column, Figure } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { addDays, formatDate } from '@/lib/dates'
import type { ComplianceView } from '../engine'
import type { DeadlineRow, JurisdictionRow } from '../engine/deadlines'
import { deadlinePeopleDrill, jurisdictionPeopleDrill } from '../engine/drills'
import { USES } from '../engine/lineage'
import { asOfNote, daysText } from '../engine/wording'
import { M } from '../metrics'
import { ATLAS_CITATION } from '../reference/calendar'
import { COUNSEL_NOTE, defs, useAtlasHref } from './shared'

interface CalendarRow {
  key: string
  when: string
  start: string
  jurisdiction: string
  jurisdictionId: string
  obligation: string
  detail: string
  recurrence: string
  people: number
  source: string
  verified: string
  row: DeadlineRow
}

const toRow = (d: DeadlineRow): CalendarRow => ({
  key: d.key,
  when: d.when,
  start: d.start,
  jurisdiction: d.jurisdiction.shortName,
  jurisdictionId: d.jurisdiction.id,
  obligation: d.entry.title,
  detail: d.entry.detail,
  recurrence: d.recurrence,
  people: d.people.length,
  source: `Atlas, ${d.jurisdiction.shortName} (${d.jurisdiction.file})`,
  verified: d.jurisdiction.lastVerified,
  row: d,
})

/** The calendar in the look-ahead: compact on the Overview, in full on the Deadlines tab. */
export function DeadlinesFigure({
  m,
  ctx,
  compact = false,
}: {
  m: ComplianceView
  ctx: AnalyticsContext
  compact?: boolean
}) {
  const s = m.scope
  const d = m.deadlines
  const atlasHref = useAtlasHref()
  const rows = d.upcoming.map(toRow)
  const peopleCol: Column<CalendarRow> = {
    key: 'people',
    label: 'People covered',
    format: 'int',
    drill: (r) => () => deadlinePeopleDrill(s, r.row, USES.deadlines),
  }
  const columns: Column<CalendarRow>[] = compact
    ? [
        { key: 'when', label: 'When' },
        { key: 'jurisdiction', label: 'Jurisdiction' },
        { key: 'obligation', label: 'Obligation' },
        peopleCol,
      ]
    : [
        { key: 'when', label: 'When' },
        { key: 'jurisdiction', label: 'Jurisdiction', href: (r) => atlasHref(r.jurisdictionId) },
        { key: 'obligation', label: 'Obligation' },
        { key: 'detail', label: 'What it involves', width: 60 },
        { key: 'recurrence', label: 'Recurs' },
        peopleCol,
        { key: 'source', label: 'Source', href: (r) => atlasHref(r.jurisdictionId) },
        { key: 'verified', label: 'Verified' },
      ]
  const fixed = d.upcoming.filter((x) => x.entry.day).length
  return (
    <Figure
      id={compact ? 'compliance-deadlines-next' : 'compliance-statutory-calendar'}
      uses={USES.deadlines}
      metric={M.deadlines}
      span={12}
      title={compact ? `Deadlines in the next ${daysText(m.settings.deadlineDays)}` : 'Statutory calendar'}
      subtitle={`Entries from ${formatDate(addDays(m.base.asOf, 1))} to ${formatDate(d.until)}, soonest first; an entry without a fixed day falls somewhere in its month`}
      data={rows}
      columns={columns}
      definitions={defs(ctx.metrics, [M.deadlines])}
      note={asOfNote(m.base.asOf, `${rows.length} entries, ${fixed} with a fixed date`, COUNSEL_NOTE)}
      tableOnly
      table={{
        maxRows: compact ? 8 : 25,
        search: compact ? false : 'Search obligations or jurisdictions',
      }}
      empty={
        d.jurisdictions.length
          ? rows.length
            ? null
            : `No calendar entry falls in the next ${daysText(m.settings.deadlineDays)}.`
          : 'Nobody in this scope is active at a site with a statutory calendar.'
      }
    />
  )
}

interface JurisdictionTableRow {
  jurisdiction: string
  id: string
  people: number
  upcoming: number
  entries: number
  sources: number
  verified: string
  file: string
  r: JurisdictionRow
}

interface SourceRow {
  jurisdiction: string
  title: string
  url: string
}

export function DeadlinesTab({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const d = m.deadlines
  const atlasHref = useAtlasHref()
  const counts = new Map<string, number>()
  for (const x of d.upcoming) counts.set(x.jurisdiction.id, (counts.get(x.jurisdiction.id) ?? 0) + 1)
  const jurisdictionRows: JurisdictionTableRow[] = d.jurisdictions.map((j) => ({
    jurisdiction: j.jurisdiction.name,
    id: j.jurisdiction.id,
    people: j.people.length,
    upcoming: counts.get(j.jurisdiction.id) ?? 0,
    entries: entriesOf(m, j.jurisdiction.id),
    sources: j.jurisdiction.sources.length,
    verified: j.jurisdiction.lastVerified,
    file: j.jurisdiction.file,
    r: j,
  }))
  const sourceRows: SourceRow[] = d.jurisdictions.flatMap((j) =>
    j.jurisdiction.sources.map((x) => ({
      jurisdiction: j.jurisdiction.shortName,
      title: x.title,
      url: x.url,
    })),
  )
  const peopleDrill = (r: JurisdictionTableRow) => () =>
    jurisdictionPeopleDrill(s, r.r.people, r.r.jurisdiction.shortName, USES.deadlines)
  return (
    <>
      <Section
        title="Statutory deadlines"
        dek={`Filing, payment, notice and planning dates from the Hire-to-Retire Atlas for the next ${daysText(m.settings.deadlineDays)}, for the jurisdictions where people in this scope work. US federal entries apply to every US site. The look-ahead is a setting of the metric.`}
      >
        <DeadlinesFigure m={m} ctx={ctx} />
      </Section>
      <Section
        title="Jurisdictions and sources"
        dek="Which jurisdictions are in scope, how many people each covers, and the research behind each calendar. Open a jurisdiction to see its Atlas page."
      >
        <Figure
          id="compliance-jurisdictions"
          uses={USES.deadlines}
          metric={M.deadlines}
          span={12}
          title="Jurisdictions with people"
          subtitle="Active people by the jurisdiction their site falls under, with the calendar entries coming up"
          data={jurisdictionRows}
          columns={[
            { key: 'jurisdiction', label: 'Jurisdiction', href: (r) => atlasHref(r.id) },
            { key: 'people', label: 'People covered', format: 'int', drill: peopleDrill },
            {
              key: 'upcoming',
              label: `Entries in the next ${daysText(m.settings.deadlineDays)}`,
              format: 'int',
            },
            { key: 'entries', label: 'Entries a year', format: 'int' },
            { key: 'sources', label: 'Sources', format: 'int' },
            { key: 'verified', label: 'Research verified' },
            { key: 'file', label: 'Atlas file' },
          ]}
          definitions={defs(ctx.metrics, [M.deadlines])}
          note={asOfNote(m.base.asOf, ATLAS_CITATION)}
          tableOnly
          empty={
            jurisdictionRows.length
              ? null
              : 'Nobody in this scope is active at a site with a statutory calendar.'
          }
        />
        <Figure
          id="compliance-calendar-sources"
          uses={USES.deadlines}
          metric={M.deadlines}
          span={12}
          title="Sources"
          subtitle="The articles, regulators' pages and statutes the Atlas research cites for each jurisdiction in scope"
          data={sourceRows}
          columns={[
            { key: 'jurisdiction', label: 'Jurisdiction' },
            { key: 'title', label: 'Source', href: (r) => r.url },
            { key: 'url', label: 'Link', only: 'sheets' },
          ]}
          note={COUNSEL_NOTE}
          tableOnly
          table={{ maxRows: 10, search: 'Search sources' }}
          empty={sourceRows.length ? null : 'No jurisdiction in scope.'}
        />
      </Section>
    </>
  )
}

function entriesOf(m: ComplianceView, id: string): number {
  return m.deadlines.yearly.get(id) ?? 0
}

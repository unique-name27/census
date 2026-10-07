/**
 * Org structure: business unit → department as a mapping diagram and a table, location →
 * country → region, and where they disagree.
 */
import { type Column, type Definition, Figure } from '@/charts'
import { Section } from '@/components/Section'
import type { FieldRef } from '@/data/quality/fieldRef'
import { formatDate } from '@/lib/dates'
import { peopleSpec } from '../engine/drills'
import type { LocationRow, OrgRow } from '../engine/structure'
import { ConflictList } from './ConflictList'
import { MappingDiagram } from './MappingDiagram'
import type { MappingModel } from './model'

const ACTIVE: FieldRef[] = ['employees.hireDate', 'employees.terminationDate', 'employees.employmentType']
const ORG_USES: FieldRef[] = ['employees.businessUnit', 'employees.department', ...ACTIVE]
const TABLE_USES: FieldRef[] = [
  ...ORG_USES,
  'employees.managerId',
  'employees.level',
  'employees.costCenter',
  'employees.location',
]
const CONFLICT_USES: FieldRef[] = [...ORG_USES, 'requisitions.department', 'requisitions.businessUnit']
const LOCATION_USES: FieldRef[] = ['employees.location', 'employees.country', ...ACTIVE]

const DEFINITIONS: Definition[] = [
  {
    term: 'Headcount',
    text: 'Active employees on the as-of date. Contractors and interns are not counted.',
    formula: 'hire date ≤ as-of and (no exit date or exit date > as-of)',
  },
  {
    term: 'Managers',
    text: 'Active people in the department with at least one active direct report.',
  },
  {
    term: 'Department leader',
    text: 'The most senior active person in the department: the highest level, then the longest tenure.',
  },
]

const intText = (n: number) => n.toLocaleString('en-US')

export function OrgSection({ model }: { model: MappingModel }) {
  const { ctx, org, orgRows, locations, locationRows, orgConflicts } = model
  const data = ctx.all
  const asOf = ctx.asOf
  const emps = data.employees
  const units = new Set(orgRows.map((r) => r.businessUnit)).size
  const depts = new Set(orgRows.map((r) => r.department)).size

  const people = (title: string, rows: readonly number[], focus: 'org' | 'location', scope?: string) =>
    peopleSpec({ title, asOf, employees: emps, rows, focus, scope })

  const orgColumns: Column<OrgRow>[] = [
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'department', label: 'Department' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () => people(r.department, r.rows, 'org', r.businessUnit),
    },
    {
      key: 'managers',
      label: 'Managers',
      format: 'int',
      drill: (r) => () => people(`Managers in ${r.department}`, r.managerRows, 'org', r.businessUnit),
    },
    {
      key: 'leader',
      label: 'Department leader',
      drill: (r) => () => {
        const i = emps.findIndex((e) => e.employeeId === r.leaderId)
        return i < 0 ? null : people(`Most senior person in ${r.department}`, [i], 'org', r.businessUnit)
      },
    },
    { key: 'leaderLevel', label: 'Leader level' },
    { key: 'leaderTitle', label: 'Leader title' },
    { key: 'costCenters', label: 'Cost centers' },
    { key: 'sites', label: 'Sites' },
    { key: 'status', label: 'Status' },
  ]
  const locationColumns: Column<LocationRow>[] = [
    { key: 'location', label: 'Location' },
    { key: 'country', label: 'Country' },
    { key: 'region', label: 'Region' },
    {
      key: 'headcount',
      label: 'Headcount',
      format: 'int',
      drill: (r) => () => people(`${r.location}, ${r.country}`, r.rows, 'location'),
    },
    { key: 'status', label: 'Status' },
  ]
  const asOfText = formatDate(asOf)

  return (
    <Section
      id="data-map-org"
      title="Org structure"
      dek="How departments roll up to business units, and sites to countries and regions. Each department should sit under one business unit; where it sits under several, the numbers by business unit split it."
    >
      <Figure
        id="data-map-org-diagram"
        title="Business units and departments"
        subtitle={`${intText(units)} business units and ${intText(depts)} departments, by active headcount as of ${asOfText}.`}
        data={orgRows}
        columns={orgColumns}
        definitions={DEFINITIONS}
        span={8}
        uses={ORG_USES}
        empty={orgRows.length ? null : 'No active people in Employees on the as-of date.'}
        table={{ rowTone: (r) => (r.flagged ? 'warning' : null) }}
      >
        <MappingDiagram
          mapped={org}
          label={`Business units and departments: ${intText(units)} business units, ${intText(depts)} departments`}
          drillFor={(id) => () => {
            const p = org.parts.get(id)
            return p ? people(p.title, p.rows, 'org') : null
          }}
        />
      </Figure>
      <ConflictList
        id="data-map-org-conflicts"
        title="Org conflicts"
        none="Every department sits under one business unit, and every requisition names a department in the roster."
        conflicts={orgConflicts}
        data={data}
        asOf={asOf}
        span={4}
        uses={CONFLICT_USES}
      />
      <Figure
        id="data-map-org-table"
        title="Departments by business unit"
        subtitle={`Leader, managers, cost centers and sites of each department, as of ${asOfText}`}
        data={orgRows}
        columns={orgColumns}
        definitions={DEFINITIONS}
        tableOnly
        uses={TABLE_USES}
        table={{ rowTone: (r) => (r.flagged ? 'warning' : null), search: 'Find a department', maxRows: 12 }}
      />
      <Figure
        id="data-map-locations"
        title="Locations, countries and regions"
        subtitle={`Active headcount as of ${asOfText}. Regions come from the known sites, by location and then by country.`}
        data={locationRows}
        columns={locationColumns}
        span={7}
        uses={LOCATION_USES}
        empty={locationRows.length ? null : 'No active people in Employees on the as-of date.'}
        table={{ rowTone: (r) => (r.status ? 'warning' : null) }}
      >
        <MappingDiagram
          mapped={locations}
          label="Locations, countries and regions by active headcount"
          maxHeight={420}
          drillFor={(id) => () => {
            const p = locations.parts.get(id)
            return p ? people(p.title, p.rows, 'location') : null
          }}
        />
      </Figure>
      <Figure
        id="data-map-location-table"
        title="Sites"
        subtitle="Each location with the country and region it rolls up to"
        data={locationRows}
        columns={locationColumns}
        tableOnly
        span={5}
        uses={LOCATION_USES}
        table={{ rowTone: (r) => (r.status ? 'warning' : null), maxRows: 14 }}
      />
    </Section>
  )
}

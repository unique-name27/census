/**
 * Export control: license status for people whose role needs an export-control license, anyone
 * working without a license in force, and upcoming starts whose license is still pending. The
 * license flag never records nationality.
 */
import { BarList, type Column, Figure } from '@/charts'
import { Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill, openPerson } from '@/drill'
import type { ComplianceView } from '../engine'
import { licenseDrill } from '../engine/drills'
import type { LicenseRow, StatusRow } from '../engine/exportControl'
import { USES } from '../engine/lineage'
import { asOfNote, daysText, people } from '../engine/wording'
import { M } from '../metrics'
import { LicensesBySiteFigure } from './charts'
import { defs, NeedData, NO_RTW } from './shared'

interface PersonRow {
  employeeId: string
  name: string
  businessUnit: string
  department: string
  location: string
  startDate: string
  status: string
  licenseExpiry: string | null
  x: LicenseRow
}

const toRow = (x: LicenseRow): PersonRow => ({
  employeeId: x.e.employeeId,
  name: x.e.name,
  businessUnit: x.e.businessUnit,
  department: x.e.department,
  location: x.e.location,
  startDate: x.startDate,
  status: x.status,
  licenseExpiry: x.r.exportLicenseExpiry ?? null,
  x,
})

export function ExportTab({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const ex = m.exportControl
  const cfg = m.settings
  if (!m.base.has.rightToWork)
    return (
      <Section title="Export control" dek="Export-control license status for roles that need one.">
        <NeedData {...NO_RTW} />
      </Section>
    )
  const statusDrill = (r: StatusRow) => () =>
    licenseDrill(s, r.rows, { title: `Export licenses: ${r.status}`, uses: USES.exportLicense })
  const one = (r: PersonRow) => () =>
    licenseDrill(s, [r.x], { title: `Export license of ${r.name}`, uses: USES.exportLicense })
  const personColumns: Column<PersonRow>[] = [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'startDate', label: 'Start date', format: 'date' },
    { key: 'status', label: 'License status', drill: one },
    { key: 'licenseExpiry', label: 'License expiry', format: 'date' },
  ]
  const noLicenseData = !m.base.has.exportLicense
  return (
    <Section
      title="Export control"
      dek="People whose role needs an export-control license before they can access controlled technology, and whether that license is in force. Nobody should work, or start, without one."
    >
      <LicensesBySiteFigure m={m} ctx={ctx} />
      <Figure
        id="compliance-licenses-by-status"
        uses={USES.exportLicense}
        metric={M.licenseStatus}
        span={4}
        title="Licenses by status"
        subtitle="People active or starting soon whose role needs a license"
        data={ex.byStatus}
        columns={[
          { key: 'status', label: 'Status' },
          { key: 'people', label: 'People', format: 'int', drill: statusDrill },
        ]}
        definitions={defs(ctx.metrics, [M.licenseStatus])}
        note={asOfNote(m.base.asOf, people(ex.required.length))}
        empty={
          noLicenseData
            ? 'Upload Right to work with export license columns to see this.'
            : ex.required.length
              ? null
              : 'No role in this scope needs an export license.'
        }
      >
        <BarList
          data={ex.byStatus}
          label="status"
          value="people"
          sort="none"
          tone={(d) =>
            d.status === 'Approved' ? 'default' : d.status === 'Pending' ? 'warning' : 'critical'
          }
          onSelect={(d) => drill(statusDrill(d))}
        />
      </Figure>
      <Figure
        id="compliance-without-license"
        uses={USES.exportLicense}
        metric={M.withoutLicense}
        span={6}
        title="Working without a license in force"
        subtitle="Active people whose role needs a license that is pending, denied or expired"
        data={ex.without.map(toRow)}
        columns={personColumns}
        definitions={defs(ctx.metrics, [M.withoutLicense])}
        note={asOfNote(m.base.asOf, `${people(ex.without.length)}`, 'target 0')}
        tableOnly
        table={{
          rowTone: () => 'critical',
          onRowClick: (r) => openPerson(r.employeeId),
        }}
        empty={
          noLicenseData
            ? 'Upload Right to work with export license columns to see this.'
            : ex.without.length
              ? null
              : 'Everyone working in a role that needs a license has one in force.'
        }
      />
      <Figure
        id="compliance-pending-starts"
        uses={USES.exportLicense}
        metric={M.pendingStarts}
        span={6}
        title="Upcoming starts with a license pending"
        subtitle={`Pre-hires starting in the next ${daysText(cfg.pendingDays)} whose role needs a license that is not yet in force`}
        data={ex.pendingStarts.map(toRow)}
        columns={personColumns}
        definitions={defs(ctx.metrics, [M.pendingStarts])}
        note={asOfNote(m.base.asOf, people(ex.pendingStarts.length))}
        tableOnly
        table={{
          rowTone: () => 'warning',
          onRowClick: (r) => openPerson(r.employeeId),
        }}
        empty={
          noLicenseData
            ? 'Upload Right to work with export license columns to see this.'
            : ex.pendingStarts.length
              ? null
              : `No start in the next ${daysText(cfg.pendingDays)} is waiting on a license.`
        }
      />
    </Section>
  )
}

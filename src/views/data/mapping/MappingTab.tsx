/**
 * Data room → Categories & mapping (#data.mapping): how the categories in the data relate
 * (business unit → department, location → country → region, function → job family → title),
 * where they disagree, the values of every categorical field, and your changes to the mapping,
 * which apply before every number in Census.
 */
import { StatusPill } from '@/components/ui'
import { DATASETS } from '@/data/schema'
import { openSettings } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { unlistedValues } from './engine/lists'
import { EditSection } from './ui/EditSection'
import { scrollBehavior } from './ui/hooks'
import { JobSection } from './ui/JobSection'
import { ListsSection } from './ui/ListsSection'
import { type MappingModel, useMappingModel } from './ui/model'
import { OrgSection } from './ui/OrgSection'

const intText = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) => `${intText(n)} ${n === 1 ? one : many}`

function jump(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  // Move focus along so keyboard and screen reader users land where the page went; focus first,
  // since moving focus during a smooth scroll can stop it.
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
}

interface Stop {
  id: string
  label: string
  detail: string
  review: number
}

function stops(m: MappingModel, changes: number): Stop[] {
  const units = new Set(m.orgRows.map((r) => r.businessUnit)).size
  const depts = new Set(m.orgRows.map((r) => r.department)).size
  const families = new Set(m.familyRows.map((r) => r.jobFamily)).size
  const titles = new Set(m.titleRows.map((r) => r.jobTitle)).size
  const fields = m.report.categories.length
  // The fields listed under "Values not in their list", so the card and the panel agree.
  const unrecognized = new Set(unlistedValues(m.report.categories).map((u) => u.ref)).size
  return [
    {
      id: 'data-map-org',
      label: 'Org structure',
      detail: `${plural(units, 'business unit')}, ${plural(depts, 'department')}`,
      review: m.orgConflicts.length,
    },
    {
      id: 'data-map-job',
      label: 'Job architecture',
      detail: `${plural(families, 'job family', 'job families')}, ${plural(titles, 'title')}`,
      review: m.jobConflicts.length,
    },
    {
      id: 'data-map-lists',
      label: 'Category lists',
      detail: `${plural(fields, 'field')} across ${DATASETS.length} datasets`,
      review: unrecognized,
    },
    {
      id: 'data-map-edit',
      label: 'Your changes',
      detail: changes ? `${plural(changes, 'change')} in force` : 'None yet',
      review: m.ctx.reference.skipped.length,
    },
  ]
}

function pillFor(s: Stop, changes: number) {
  if (s.review > 0) {
    const label =
      s.id === 'data-map-lists'
        ? `${plural(s.review, 'field')} to check`
        : s.id === 'data-map-edit'
          ? `${intText(s.review)} not applied`
          : `${intText(s.review)} to review`
    return <StatusPill severity="warning" label={label} />
  }
  if (s.id === 'data-map-edit')
    return changes ? <StatusPill severity="good" label="All applied" quiet /> : null
  return <StatusPill severity="good" label="Nothing to review" quiet />
}

export function MappingTab() {
  const model = useMappingModel()
  const changes = model.ctx.reference.mappings.length
  const list = stops(model, changes)

  return (
    <div className="pt-5">
      <p className="max-w-[75ch] text-[13px] text-ink-2">
        How the categories in your data relate to each other, where they disagree, and the changes you have
        made. Org and job counts are active employees as of {formatDate(model.ctx.asOf)}, across the whole
        company; category lists count every row. Every count opens the people or records behind it.
      </p>
      <p className="mt-2 max-w-[75ch] text-[13px] text-ink-2">
        The approved values your data is checked against, and each department’s official business unit, are
        kept in{' '}
        <button
          type="button"
          onClick={() => openSettings('lists')}
          className="rounded-[2px] font-medium text-link underline-offset-2 hover:underline"
        >
          Settings, Official lists
        </button>
        .
      </p>
      <nav
        aria-label="On this tab"
        className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-sheet bg-rule md:grid-cols-4"
      >
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="flex flex-col items-start gap-0.5 bg-sheet px-4 py-3 text-left transition-colors hover:bg-hover"
          >
            <span className="cut-head text-[15px] font-semibold text-ink">{s.label}</span>
            <span className="text-[12px] text-ink-2">{s.detail}</span>
            <span className="mt-1">{pillFor(s, changes)}</span>
          </button>
        ))}
      </nav>
      <div className="mt-10">
        <OrgSection model={model} />
        <JobSection model={model} />
        <ListsSection model={model} />
        <EditSection model={model} />
      </div>
    </div>
  )
}

/**
 * Field coverage: how much of each dataset's fields the loaded rows actually fill.
 *
 * A field's coverage is the share of rows that hold a value. Many fields only apply to some rows
 * (a termination type only exists for leavers, an offer date only for candidates who reached the
 * offer stage), so those count only the rows they apply to. After an upload, values the importer
 * filled by a default ("treated as Employee") count as blank: they did not come from the file.
 * The dataset's coverage is the mean over its required and recommended fields, the ones the
 * views depend on.
 */
import { type DatasetDef, type DatasetKey, type Stage, stageIndex } from '@/data/schema'
import { fmt } from '@/lib/format'

export type Requirement = 'required' | 'recommended' | 'optional'

export const requirementOf = (f: { required?: boolean; recommended?: boolean }): Requirement =>
  f.required ? 'required' : f.recommended ? 'recommended' : 'optional'

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
}

export interface FieldCoverage {
  key: string
  label: string
  requirement: Requirement
  /** Pay amount field: its fill rate is fine to show, its values are not. */
  pay: boolean
  /** Rows the field applies to. */
  expected: number
  /** Rows among `expected` that hold a value from the data (not from an importer default). */
  filled: number
  /** filled ÷ expected; null when no row applies. */
  share: number | null
  /** Which rows count, when not all of them. */
  scope: string | null
  /** The same rows as a noun mid-sentence ("leavers"); "rows" when every row counts. */
  rowsNoun: string
  /** Blanks are normal for some rows it applies to (no interview booked yet), so it is never called thin. */
  blankOk: boolean
  /**
   * For a date that stays blank until something happens (a termination date), what the filled
   * rows are ("leavers"). Its fill rate is a count of events, not a gap, so it is shown as one.
   */
  event: string | null
  /** Rows whose value the importer filled by a default; they count as blank. */
  defaulted: number
  /** Whether the last upload had a column for this field; null for sample data or an unknown upload. */
  inFile: boolean | null
}

export interface DatasetCoverage {
  key: DatasetKey
  rows: number
  fields: FieldCoverage[]
  /** Mean share over required and recommended fields; null for an empty dataset. */
  core: number | null
  /** Required and recommended fields that apply to some rows but are filled in none. */
  emptyCore: FieldCoverage[]
}

/**
 * What the last upload of a dataset filled by itself, from its import log: fields with no
 * column, and per field the rows whose value is a default rather than a value from the file.
 */
export interface FieldFills {
  notInFile: readonly string[]
  defaulted: Readonly<Record<string, number>>
}

/** The importer's placeholder for a value it could not fill responsibly. */
const UNKNOWN = 'Unknown'

/** A value that counts as filled: not blank, not NaN, not the importer's "Unknown" placeholder. */
export function isFilled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'string') {
    const t = v.trim()
    return t !== '' && t !== UNKNOWN
  }
  return true
}

/**
 * A share as text that never rounds a gap away: 99.994% reads "99.9%", not "100%", and 0.3%
 * reads "<1%", not "0%". Whole shares use no decimals.
 */
export function coverageText(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share)) return '—'
  if (share < 1 && Math.round(share * 100) >= 100) return fmt(Math.floor(share * 1000) / 1000, 'pct')
  if (share > 0 && Math.round(share * 100) <= 0) return '<1%'
  return fmt(share, 'pct0')
}

type Row = Record<string, unknown>

interface Applicability {
  /** Built once per dataset: which rows the field applies to. */
  applies: (rows: readonly Row[]) => (row: Row) => boolean
  /** Shown under the field name, e.g. "Leavers". */
  scope: string
  /** The rows as a noun mid-sentence, when the scope doesn't read well there. */
  noun?: string
  blankOk?: boolean
}

/** Fields that stay blank until an event happens, by dataset: field → what the filled rows are. */
const EVENT_FIELDS: Partial<Record<DatasetKey, Record<string, string>>> = {
  employees: { terminationDate: 'leavers' },
  transactions: { completedDate: 'completed' },
  learning: { completedDate: 'completed' },
  comp: { promotionPct: 'promoted' },
}

const each =
  (test: (row: Row) => boolean): Applicability['applies'] =>
  () =>
    test
const hasValue = (v: unknown) => v != null && v !== ''

const INTERVIEW_STAGES = new Set<string>(['Screen', 'Hiring manager', 'Onsite'])
const LEFT_PROCESS = new Set<string>(['Rejected', 'Withdrawn', 'Declined'])

/** A stage date applies to candidates whose current stage is that stage or a later one. */
const reached = (stage: Stage): Applicability => ({
  applies: each((r) => stageIndex(String(r.currentStage)) >= stageIndex(stage)),
  scope: stage === 'Hired' ? 'Hired candidates' : `Candidates who reached ${stage}`,
})

/**
 * Everyone but the top of the organization: the person with no manager who heads the largest
 * reporting tree. Only one person is left out, so managers cleared on import still count as gaps.
 */
function notTopOfOrg(rows: readonly Row[]): (row: Row) => boolean {
  const children = new Map<string, string[]>()
  for (const r of rows) {
    const m = r.managerId
    const id = r.employeeId
    if (typeof m !== 'string' || !m || typeof id !== 'string') continue
    const list = children.get(m)
    if (list) list.push(id)
    else children.set(m, [id])
  }
  let top: Row | null = null
  let topSize = 0
  for (const r of rows) {
    if (hasValue(r.managerId) || typeof r.employeeId !== 'string' || !children.has(r.employeeId)) continue
    // Size of the tree under this person (a reporting loop can't hang this: each id is visited once).
    const seen = new Set<string>([r.employeeId])
    const queue = [r.employeeId]
    while (queue.length) {
      for (const c of children.get(queue.pop() as string) ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        queue.push(c)
      }
    }
    if (seen.size > topSize) {
      topSize = seen.size
      top = r
    }
  }
  return (row) => row !== top
}

/** Fields that only apply to some rows of their dataset. */
export const CONDITIONAL_FIELDS: Partial<Record<DatasetKey, Record<string, Applicability>>> = {
  employees: {
    managerId: {
      applies: notTopOfOrg,
      scope: 'Everyone except the top of the organization',
      noun: 'people below the top of the organization',
    },
    terminationType: { applies: each((r) => hasValue(r.terminationDate)), scope: 'Leavers' },
    terminationReason: { applies: each((r) => hasValue(r.terminationDate)), scope: 'Leavers' },
    regrettable: {
      applies: each((r) => hasValue(r.terminationDate) && r.terminationType === 'Voluntary'),
      scope: 'Voluntary leavers',
    },
  },
  jobChanges: {
    fromManagerId: {
      applies: each((r) => r.changeType === 'Manager change' || r.changeType === 'Transfer'),
      scope: 'Manager changes and transfers',
    },
    toManagerId: {
      applies: each((r) => r.changeType === 'Manager change' || r.changeType === 'Transfer'),
      scope: 'Manager changes and transfers',
    },
  },
  requisitions: {
    filledDate: { applies: each((r) => r.status === 'Filled'), scope: 'Filled requisitions' },
    closedDate: {
      applies: each((r) => r.status === 'Filled' || r.status === 'Cancelled'),
      scope: 'Filled or cancelled requisitions',
    },
  },
  candidates: {
    // Coordinators schedule interviews from the hiring manager stage on.
    coordinator: reached('Hiring manager'),
    screenDate: reached('Screen'),
    hmDate: reached('Hiring manager'),
    onsiteDate: reached('Onsite'),
    offerDate: reached('Offer'),
    hiredDate: reached('Hired'),
    rejectedDate: {
      applies: each((r) => LEFT_PROCESS.has(String(r.status))),
      scope: 'Rejected, withdrawn or declined candidates',
    },
    rejectionReason: {
      applies: each((r) => LEFT_PROCESS.has(String(r.status))),
      scope: 'Rejected, withdrawn or declined candidates',
    },
    nextEventDate: {
      applies: each((r) => r.status === 'Active' && INTERVIEW_STAGES.has(String(r.currentStage))),
      scope: 'Active candidates in interview stages',
      blankOk: true,
    },
  },
  cases: {
    resolvedAt: {
      applies: each((r) => r.status === 'Resolved' || r.status === 'Closed'),
      scope: 'Resolved or closed cases',
    },
  },
  succession: {
    readiness: { applies: each((r) => hasValue(r.successorId)), scope: 'Roles with a named successor' },
  },
}

export function fieldCoverage(
  def: DatasetDef,
  rows: readonly object[],
  fills?: FieldFills | null,
): DatasetCoverage {
  const rules = CONDITIONAL_FIELDS[def.key] ?? {}
  const all = rows as readonly Row[]
  const notInFile = fills ? new Set(fills.notInFile) : null
  const fields: FieldCoverage[] = def.fields.map((f) => {
    const rule = rules[f.key]
    const applies = rule?.applies(all)
    let expected = 0
    let present = 0
    for (const r of all) {
      if (applies && !applies(r)) continue
      expected++
      if (isFilled(r[f.key])) present++
    }
    const defaulted = Math.min(present, fills?.defaulted[f.key] ?? 0)
    const filled = present - defaulted
    return {
      key: f.key,
      label: f.label,
      requirement: requirementOf(f),
      pay: !!f.pay,
      expected,
      filled,
      share: expected ? filled / expected : null,
      scope: rule?.scope ?? null,
      rowsNoun: rule ? (rule.noun ?? rule.scope.charAt(0).toLowerCase() + rule.scope.slice(1)) : 'rows',
      blankOk: !!rule?.blankOk,
      event: EVENT_FIELDS[def.key]?.[f.key] ?? null,
      defaulted,
      inFile: notInFile ? !notInFile.has(f.key) : null,
    }
  })
  const core = fields.filter((f) => f.requirement !== 'optional' && f.share != null)
  return {
    key: def.key,
    rows: rows.length,
    fields,
    core: rows.length && core.length ? core.reduce((a, f) => a + (f.share ?? 0), 0) / core.length : null,
    emptyCore: core.filter((f) => f.filled === 0),
  }
}

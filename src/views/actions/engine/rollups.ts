/**
 * Roll-ups for a role's two lists (docs/ACTION-CENTER-AUDIT.md 4.3 and part 6, Volume; the homes
 * and actions review of 8 Oct 2026). A role reads its work, not every record behind it: items one
 * person or one queue works through fold into one line with the count, who holds them and the
 * oldest, and the line's About opens the items. Folding happens after the role split
 * (`roleItems`), per mode, so HR's full list and every view keep their own items:
 *
 *  - **HR, CHRO, Developer (escalations):** legal exposure, critical roles and exit clusters stay
 *    one line each; critical items long overdue fold into one line per practice ("Recruiting: 55
 *    items more than 14 d overdue across 8 recruiters and 4 coordinators").
 *  - **HR ops:** one agent's or one queue's items of one kind fold from three ("Amanda Wright: 15
 *    Immigration & mobility cases past target"); day-one tasks not started and not yet due fold
 *    per start date. Legal exposure and employee relations cases never fold.
 *  - **Recruiter, one recruiter:** one line per req for its candidate steps and its age; a req
 *    past its target with no step waiting stands alone only when critical, the rest share a line.
 *    **Every recruiter:** one line per recruiter, and one for the reqs open past the critical bar.
 *  - **Manager:** interview decisions fold per req ("REQ-4558 Emulation Engineer: 10 candidates").
 *  - **HRBP (Waiting on others):** one line per owner group and kind ("Managers: 26 interview
 *    decisions with 9 managers"), with each owner's note inside; stay conversations, probation
 *    decisions and critical items stay one line each.
 *
 * A roll-up is an `OpenAction` with `members`: its id is stable ('rollup:<key>'), so Mark handled
 * and Snooze keep to it, and its fingerprint is its members, so a handled roll-up opens again when
 * an item joins or leaves it. Its severity is its worst member's, its due date the earliest, and
 * it carries legal exposure when a member does. Pure.
 */
import { escalationRank, isMine, type RoleLens } from '@/access/items'
import type { Mode } from '@/access/modes'
import { itemKindOf, kindMatches } from '@/access/policy/routing'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { dateWords } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { ACTION_OWNER_LABEL, type ActionItem, type ActionOwnerRole } from '@/views/types'
import { isPrivateItem, type OpenAction } from './collect'
import { daysToDue } from './due'
import { kindOf } from './kind'
import { hashKey, markKeyOf } from './marks'
import { itemsDrill } from './rows'

/** One agent's or one queue's items of one kind fold into one line from this many (HR ops). */
export const QUEUE_FOLD_AT = 3

/** The prefix of every roll-up's id. */
export const ROLLUP_PREFIX = 'rollup:'

type Ctx = Pick<AnalyticsContext, 'asOf' | 'scopeLabel'>

export const isRollup = (a: Pick<OpenAction, 'id'>): boolean => a.id.startsWith(ROLLUP_PREFIX)

/* ───────────── words ───────────── */

/** Count nouns by kind label, singular and plural ("application to review"). */
const NOUN: Readonly<Record<string, readonly [string, string]>> = {
  'Interview decision': ['interview decision', 'interview decisions'],
  'Offer awaiting an answer': ['offer out', 'offers out'],
  'Application to review': ['application to review', 'applications to review'],
  'Offer to send': ['offer to send', 'offers to send'],
  'Interview to schedule': ['interview to schedule', 'interviews to schedule'],
  'Empty funnel': ['empty funnel', 'empty funnels'],
  'Req past its time-to-fill target': [
    'req past its time-to-fill target',
    'reqs past their time-to-fill target',
  ],
  'Day-one task': ['day-one task', 'day-one tasks'],
  'Probation decision': ['probation decision', 'probation decisions'],
  'I-9 Section 2': ['I-9 Section 2', 'I-9 Section 2 forms'],
  'Req not in the hiring plan': ['req not in the hiring plan', 'reqs not in the hiring plan'],
  'Hiring behind plan': ['department behind plan', 'departments behind plan'],
  'Planned role with no open req': [
    'planned role group with no open req',
    'planned role groups with no open req',
  ],
  'Span of control': ['span of control', 'spans of control'],
  'Stay conversations': ['team for stay conversations', 'teams for stay conversations'],
  'New manager with a large team': ['new manager with a large team', 'new managers with a large team'],
  'Single-report chain': ['single-report chain', 'single-report chains'],
  'Required training overdue': ['team with overdue training', 'teams with overdue training'],
  'Promotion to review': ['promotion review', 'promotion reviews'],
  'Critical role without a ready successor': [
    'critical role without a ready successor',
    'critical roles without a ready successor',
  ],
  'Required course below target': ['required course below target', 'required courses below target'],
  'Ratings missing': ['team with ratings missing', 'teams with ratings missing'],
  'Case past target': ['case past target', 'cases past target'],
  'Transaction past due': ['transaction past due', 'transactions past due'],
  'Return from leave': ['return from leave', 'returns from leave'],
  'Work authorization to reverify': ['work authorization to reverify', 'work authorizations to reverify'],
  'Export license': ['export license', 'export licenses'],
  'Pay below range minimum': ['group paid below range minimum', 'groups paid below range minimum'],
  'Merit outside guideline': ['merit exception group', 'merit exception groups'],
  'Merit spend over budget': ['unit over its merit budget', 'units over their merit budget'],
  'High performers paid low in range': [
    'group of high performers paid low',
    'groups of high performers paid low',
  ],
  'Merit proposals missing': ['unit with merit proposals missing', 'units with merit proposals missing'],
  'Low upward feedback': ['manager with low upward feedback', 'managers with low upward feedback'],
  'Stay risk': ['stay risk', 'stay risks'],
  'Exit survey reason': ['exit survey reason', 'exit survey reasons'],
  'Day-30 readiness': ['day-30 readiness item', 'day-30 readiness items'],
}

/** The kind label of an item, as the Action center names it. */
const labelOf = (a: OpenAction): string => kindOf(a.item, a.viewLabel)

/** "3 applications to review", or "3 Monthly people report items" for a kind not named above. */
export function countOf(n: number, label: string): string {
  const noun = NOUN[label]
  return noun ? plural(n, noun[0], noun[1]) : plural(n, `${label.toLowerCase()} item`)
}

/** Owner group nouns for "across 8 recruiters and 4 coordinators", "with 2 people in People operations". */
const ROLE_NOUN: Readonly<Record<ActionOwnerRole, readonly [string, string]>> = {
  manager: ['manager', 'managers'],
  hrbp: ['HR business partner', 'HR business partners'],
  recruiter: ['recruiter', 'recruiters'],
  coordinator: ['coordinator', 'coordinators'],
  'hr-ops': ['person in People operations', 'people in People operations'],
  payroll: ['person in Payroll', 'people in Payroll'],
  it: ['person in IT', 'people in IT'],
  facilities: ['person in Facilities', 'people in Facilities'],
  'trade-compliance': ['person in Trade compliance', 'people in Trade compliance'],
  immigration: ['person in Global mobility', 'people in Global mobility'],
  talent: ['person in Talent management', 'people in Talent management'],
  'total-rewards': ['person in Total rewards', 'people in Total rewards'],
  finance: ['person in Finance', 'people in Finance'],
  benefits: ['person in Benefits', 'people in Benefits'],
}

/** "a, b and c". */
export function listWords(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** Who holds a set of items: "Amanda Wright", "IT and Facilities", "8 recruiters and 4 coordinators". */
export function ownersOf(members: readonly OpenAction[]): string {
  const byKey = new Map<string, OpenAction>()
  for (const a of members) if (!byKey.has(a.ownerKey)) byKey.set(a.ownerKey, a)
  const owners = [...byKey.values()]
  if (owners.length <= 3) return listWords(owners.map((a) => a.ownerName))
  const byRole = new Map<ActionOwnerRole, number>()
  for (const a of owners) byRole.set(a.role, (byRole.get(a.role) ?? 0) + 1)
  return listWords(
    [...byRole].sort((x, y) => y[1] - x[1]).map(([r, n]) => plural(n, ROLE_NOUN[r][0], ROLE_NOUN[r][1])),
  )
}

/** "29 applications to review, 14 interviews to schedule and 8 reqs past their time-to-fill target". */
export function kindsOf(members: readonly OpenAction[]): string {
  const n = new Map<string, number>()
  for (const a of members) n.set(labelOf(a), (n.get(labelOf(a)) ?? 0) + 1)
  return listWords([...n].sort((x, y) => y[1] - x[1]).map(([label, k]) => countOf(k, label)))
}

/** Days the most overdue member is overdue, or null when none is. */
function oldestOverdue(members: readonly OpenAction[], asOf: string): number | null {
  let worst: number | null = null
  for (const a of members) {
    const d = daysToDue(a.item.due, asOf)
    if (d != null && d < 0 && (worst == null || -d > worst)) worst = -d
  }
  return worst
}

const overdueCount = (members: readonly OpenAction[], asOf: string) =>
  members.filter((a) => (daysToDue(a.item.due, asOf) ?? 0) < 0).length

/** "; 3 overdue, the oldest 41 d", or "; the first due 8 Oct", or "". */
function dueTail(members: readonly OpenAction[], asOf: string): string {
  const over = overdueCount(members, asOf)
  const oldest = oldestOverdue(members, asOf)
  if (over && oldest != null)
    return over === members.length
      ? `; the oldest is ${fmt(oldest, 'days')} overdue`
      : `; ${fmt(over, 'int')} overdue, the oldest by ${fmt(oldest, 'days')}`
  const first = members
    .map((a) => a.item.due)
    .filter((d): d is string => !!d)
    .sort()[0]
  return first ? `; the first is due ${dateWords(first, asOf)}` : ''
}

/* ───────────── one roll-up ───────────── */

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, good: 3 } as const

export interface RollupSpec {
  /** Stable among roll-ups, never a record id an employee relations case could carry. */
  key: string
  what: string
  /** What the About cell says (it opens the items). */
  subject: string
  /** The kind of work, for "Where your items wait". */
  kind: string
  /** The polite ask Copy note uses, when the line is copied whole. */
  note?: string
  /** The items drill's title. */
  title: string
  /** Who it waits on when its members have more than one owner: their group, or a phrase. */
  owner?: Pick<OpenAction, 'role' | 'ownerName'>
}

/**
 * One line for its members, most pressing first. Its owner is theirs when they share one; else
 * the spec's (an owner group, or a phrase such as "8 recruiters and 4 coordinators").
 */
export function rollupOf(members: readonly OpenAction[], spec: RollupSpec, ctx: Ctx): OpenAction {
  const first = members[0]
  const worst = [...members].sort(
    (a, b) => SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity],
  )[0]
  const dues = members
    .map((a) => a.item.due)
    .filter((d): d is string => !!d)
    .sort()
  const one = new Set(members.map((a) => a.ownerKey)).size === 1
  const views = new Set(members.map((a) => a.item.view))
  const tabs = new Set(members.map((a) => a.item.tab ?? ''))
  const sameTab = views.size === 1 && tabs.size === 1
  const role = one ? first.role : (spec.owner?.role ?? first.role)
  const ownerName = one ? first.ownerName : (spec.owner?.ownerName ?? ownersOf(members))
  const uses = new Set<FieldRef>()
  for (const a of members) for (const u of a.item.uses ?? []) uses.add(u)
  const id = `${ROLLUP_PREFIX}${spec.key}`
  const list = [...members]
  const item: ActionItem = {
    id,
    kind: spec.kind,
    ownerRole: role,
    ownerId: one ? first.ownerId : null,
    ownerName,
    due: dues[0] ?? null,
    severity: worst.item.severity,
    what: spec.what,
    subject: { kind: 'none', label: spec.subject },
    view: first.item.view,
    ...(sameTab && first.item.tab ? { tab: first.item.tab } : {}),
    drill: () => itemsDrill(ctx, spec.title, list),
    ...(spec.note ? { note: spec.note } : {}),
    ...(uses.size ? { uses: [...uses] } : {}),
    // A handled roll-up opens again when an item joins or leaves it.
    size: members.length,
    fingerprint: `${members.length}:${hashKey(
      members
        .map((a) => `${a.markKey}|${a.item.fingerprint ?? ''}`)
        .sort()
        .join('\u0001'),
    )}`,
    ...(members.some((a) => a.item.exposure) ? { exposure: true } : {}),
    closesWhen: 'Each of its items closed, handled or snoozed',
  }
  const below = members.every((a) => a.below) ? first.below : null
  return {
    item,
    id,
    markKey: markKeyOf(id),
    role,
    roleLabel: ACTION_OWNER_LABEL[role],
    // An owner group's roll-ups share one owner block ("Managers"); a phrase is its own.
    ownerKey: one ? first.ownerKey : spec.owner ? `group:${role}` : `group:${spec.key}`,
    ownerId: item.ownerId ?? null,
    ownerName,
    isTeam: one ? first.isTeam : true,
    viewLabel: views.size === 1 ? first.viewLabel : 'Several views',
    tabLabel: sameTab ? first.tabLabel : null,
    from: views.size === 1 ? (sameTab ? first.from : first.viewLabel) : 'Several views',
    personId: null,
    team: one ? first.team : null,
    below,
    alsoFrom: [],
    members: list,
  }
}

/* ───────────── folding a list ───────────── */

/**
 * Fold the groups `keyOf` names (null leaves an item alone) that reach `min` members: each group
 * becomes the line `make` builds, at its first member's place in the list. `make` may return the
 * members unchanged (an array) to leave a group alone.
 */
export function foldBy(
  list: readonly OpenAction[],
  keyOf: (a: OpenAction) => string | null,
  min: number,
  make: (key: string, members: OpenAction[]) => OpenAction | readonly OpenAction[],
): OpenAction[] {
  const groups = new Map<string, OpenAction[]>()
  for (const a of list) {
    const k = keyOf(a)
    if (k == null) continue
    const g = groups.get(k)
    if (g) g.push(a)
    else groups.set(k, [a])
  }
  const out: OpenAction[] = []
  const done = new Set<string>()
  for (const a of list) {
    const k = keyOf(a)
    const g = k == null ? undefined : groups.get(k)
    if (k == null || !g || g.length < min) {
      out.push(a)
      continue
    }
    if (done.has(k)) continue
    done.add(k)
    const made = make(k, g)
    if (Array.isArray(made)) out.push(...made)
    else out.push(made as OpenAction)
  }
  return out
}

/** The id's view and kind ('services:case'). */
const kindKey = (a: OpenAction) => itemKindOf(a.id)

/* ───────────── HR, CHRO, Developer: escalations ───────────── */

function foldEscalations(needs: readonly OpenAction[], lens: RoleLens, ctx: Ctx): OpenAction[] {
  // Legal exposure (0) and the critical kinds (1) stay one line each; long overdue (2) folds per practice.
  const longOverdue = (a: OpenAction) => escalationRank(a.item, lens) === 2
  return foldBy(
    needs,
    (a) => (longOverdue(a) ? `escalation:${a.item.view}` : null),
    2,
    (key, members) => {
      const practice = members[0].viewLabel
      const oldest = oldestOverdue(members, ctx.asOf)
      const kinds = new Set(members.map(labelOf))
      const what =
        kinds.size === 1
          ? `${kindsOf(members)} more than ${fmt(lens.escalationDays, 'days')} overdue, ${new Set(members.map((a) => a.ownerKey)).size === 1 ? 'all with' : 'across'} ${ownersOf(members)}`
          : `${plural(members.length, 'item')} more than ${fmt(lens.escalationDays, 'days')} overdue across ${ownersOf(members)}: ${kindsOf(members)}`
      return rollupOf(
        members,
        {
          key,
          what: `${what}${oldest != null ? `; the oldest is ${fmt(oldest, 'days')} overdue` : ''}`,
          subject: `${practice}: ${plural(members.length, 'item')} long overdue`,
          kind: 'Critical items long overdue',
          title: `${practice}: critical items more than ${fmt(lens.escalationDays, 'days')} overdue`,
        },
        ctx,
      )
    },
  )
}

/* ───────────── HR ops: one agent's or queue's backlog ───────────── */

/** "Immigration & mobility" from "Immigration & mobility case HR-105374". */
const caseCategory = (a: OpenAction): string | null =>
  /^(.+) case \S+$/.exec(a.item.subject.label)?.[1] ?? null
/** "Job change" from "Job change, Hye-jin Yoon". */
const txType = (a: OpenAction): string | null => /^([^,]+), /.exec(a.item.subject.label)?.[1] ?? null

function queueLine(key: string, members: OpenAction[], ctx: Ctx): OpenAction {
  const owner = ownersOf(members)
  const kind = kindKey(members[0])
  const n = members.length
  let what: string
  let subject: string
  if (kind === 'services:case') {
    const cats = new Set(members.map(caseCategory))
    const cat = cats.size === 1 ? [...cats][0] : null
    const third = members.filter((a) => /waiting on a third party/.test(a.item.what)).length
    const oldest = oldestOverdue(members, ctx.asOf)
    what = `${plural(n, `${cat ? `${cat} ` : ''}case`)} past their resolution target${third ? `, ${fmt(third, 'int')} waiting on a third party` : ''}${oldest != null ? `; the oldest is ${fmt(oldest, 'days')} past target` : ''}`
    subject = `Cases with ${owner}`
  } else if (kind === 'services:tx') {
    const types = new Set(members.map(txType))
    const type = types.size === 1 ? [...types][0] : null
    what = `${plural(n, `${type ? `${type.toLowerCase()} ` : ''}transaction`)} not processed by their due date${dueTail(members, ctx.asOf)}`
    subject = `${owner}: ${type ? `${type.toLowerCase()} transactions` : 'transactions'}`
  } else if (kind === 'services:return') {
    what = `${plural(n, 'return from leave', 'returns from leave')} without pay, access or equipment ready${dueTail(members, ctx.asOf)}`
    subject = `${owner}: returns from leave`
  } else {
    what = `${countOf(n, labelOf(members[0]))}${dueTail(members, ctx.asOf)}`
    subject = `${owner}: ${countOf(n, labelOf(members[0])).replace(/^[\d,]+ /, '')}`
  }
  return rollupOf(
    members,
    {
      key,
      what,
      subject,
      kind: labelOf(members[0]),
      title: `${labelOf(members[0])}: ${owner}`,
      note: 'Could you share where these stand, and which of them you expect to close this week?',
    },
    ctx,
  )
}

function foldHrOps(needs: readonly OpenAction[], ctx: Ctx): OpenAction[] {
  // Day-one tasks not started and not yet due: one line per start date.
  const starts = foldBy(
    needs,
    (a) =>
      a.item.batch && kindKey(a) === 'onboarding:task' && (daysToDue(a.item.due, ctx.asOf) ?? 0) >= 0
        ? `hr-ops:start:${a.item.batch.key}`
        : null,
    2,
    (key, members) => {
      const label = members[0].item.batch?.label ?? 'the starts'
      const people = new Set(members.map((a) => a.item.subject.id ?? a.item.subject.label)).size
      return rollupOf(
        members,
        {
          key,
          what: `${countOf(members.length, 'Day-one task')} not started for ${plural(people, 'start')} ${label.replace(/^the starts /, '')}${dueTail(members, ctx.asOf)}`,
          subject: `Day-one tasks, ${label}`,
          kind: 'Day-one task',
          title: `Day-one tasks not started, ${label}`,
          note: 'Could you confirm these tasks will be done before day one?',
        },
        ctx,
      )
    },
  )
  // One agent's or one queue's items of one kind, never legal exposure or employee relations.
  return foldBy(
    starts,
    (a) =>
      a.members || a.item.exposure || isPrivateItem(a.item)
        ? null
        : `hr-ops:queue:${kindKey(a)}:${a.ownerKey}`,
    QUEUE_FOLD_AT,
    (key, members) => queueLine(key, members, ctx),
  )
}

/* ───────────── Recruiter ───────────── */

const REQ_KINDS = ['recruiting:past-target', 'recruiting:empty-funnel'] as const

/** The req an item is on: a candidate step's batch, or a req item's subject. */
function reqOf(a: OpenAction): string | null {
  if (a.item.batch?.key.startsWith('req:')) return a.item.batch.key
  if (kindMatches(kindKey(a), REQ_KINDS) && a.item.subject.id) return `req:${a.item.subject.id}`
  return null
}

/** "open 57 d; the target is 45 d", "no candidate past the screen after 42 d open". */
function reqAgeWords(a: OpenAction): string {
  const w = a.item.what
  const m = /^Req .+? has been open (.+)$/.exec(w)
  if (m) return `open ${m[1].replace(/; the target is /, ' against a target of ')}`
  return `${w.charAt(0).toLowerCase()}${w.slice(1)}`
}

function foldOneRecruiter(needs: readonly OpenAction[], ctx: Ctx): OpenAction[] {
  // Reqs past their target with no candidate step waiting: alone when critical, else one shared line.
  const stepsOn = new Set(needs.filter((a) => a.item.batch).map(reqOf))
  const quiet = (a: OpenAction) =>
    kindKey(a) === 'recruiting:past-target' && a.item.severity !== 'critical' && !stepsOn.has(reqOf(a))
  const byReq = foldBy(
    needs,
    (a) => (quiet(a) ? null : reqOf(a)),
    1,
    (key, members) => {
      const steps = members.filter((a) => a.item.batch)
      const reqItems = members.filter((a) => !a.item.batch)
      if (members.length === 1) return members
      if (!steps.length) return members
      const label = steps[0].item.batch?.label ?? key.slice(4)
      return rollupOf(
        members,
        {
          key: `recruiter:${key}`,
          what: `${kindsOf(steps)}${reqItems.length ? `; ${reqItems.map(reqAgeWords).join('; ')}` : ''}`,
          subject: label,
          kind: 'Req with candidates waiting',
          title: `${label}: open items`,
          note: 'Could we move these candidates to their next step this week?',
        },
        ctx,
      )
    },
  )
  return foldBy(
    byReq,
    (a) => (quiet(a) ? 'recruiter:quiet-reqs' : null),
    2,
    (key, members) =>
      rollupOf(
        members,
        {
          key,
          what: `${countOf(members.length, 'Req past its time-to-fill target')} with no candidate waiting on a step: ${listWords(members.map((a) => a.item.subject.id ?? a.item.subject.label))}`,
          subject: plural(members.length, 'req past target', 'reqs past target'),
          kind: 'Req past its time-to-fill target',
          title: 'Reqs past their time-to-fill target with no candidate waiting',
        },
        ctx,
      ),
  )
}

function foldEveryRecruiter(needs: readonly OpenAction[], ctx: Ctx): OpenAction[] {
  // Reqs open past the critical bar stand together; every other item is its recruiter's line.
  const longOpen = (a: OpenAction) =>
    kindKey(a) === 'recruiting:past-target' && a.item.severity === 'critical'
  return foldBy(
    needs,
    (a) => (longOpen(a) ? 'recruiter:long-open' : `recruiter:owner:${a.ownerKey}`),
    1,
    (key, members) => {
      if (key === 'recruiter:long-open') {
        if (members.length === 1) return members
        return rollupOf(
          members,
          {
            key,
            what: `${countOf(members.length, 'Req past its time-to-fill target')} at or past the critical bar, across ${ownersOf(members)}`,
            subject: plural(members.length, 'req open far past target', 'reqs open far past target'),
            kind: 'Req past its time-to-fill target',
            title: 'Reqs open far past their time-to-fill target',
          },
          ctx,
        )
      }
      if (members.length === 1) return members
      const reqs = new Set(members.map(reqOf).filter(Boolean)).size
      const over = overdueCount(members, ctx.asOf)
      const critical = members.filter((a) => a.item.severity === 'critical').length
      const oldest = oldestOverdue(
        members.filter((a) => a.item.batch),
        ctx.asOf,
      )
      const name = members[0].ownerName
      return rollupOf(
        members,
        {
          key,
          what: `${plural(members.length, 'item')} on ${plural(reqs, 'req')}, ${fmt(over, 'int')} overdue and ${fmt(critical, 'int')} critical${oldest != null ? `; the oldest candidate step is ${fmt(oldest, 'days')} overdue` : ''}`,
          subject: `${name}'s reqs`,
          kind: 'Recruiter queue',
          title: `Items waiting on ${name}`,
        },
        ctx,
      )
    },
  )
}

/* ───────────── Manager: decisions per req ───────────── */

function foldDecisions(needs: readonly OpenAction[], lens: RoleLens, ctx: Ctx): OpenAction[] {
  return foldBy(
    needs,
    (a) =>
      kindKey(a) === 'recruiting:decision' && a.item.batch ? `manager:decision:${a.item.batch.key}` : null,
    2,
    (key, members) => {
      const label = members[0].item.batch?.label ?? key
      const mine = isMine(lens, members[0]) === true
      const dues = members
        .map((a) => a.item.due)
        .filter((d): d is string => !!d)
        .sort()
      const range =
        dues.length && dues[0] !== dues[dues.length - 1]
          ? `, due ${dateWords(dues[0], ctx.asOf)} to ${dateWords(dues[dues.length - 1], ctx.asOf)}`
          : dues.length
            ? `, due ${dateWords(dues[0], ctx.asOf)}`
            : ''
      return rollupOf(
        members,
        {
          key,
          what: `${plural(members.length, 'candidate')} waiting on ${mine ? 'your' : 'a'} decision after their interviews${range}`,
          subject: label,
          kind: 'Interview decision',
          title: `${label}: interview decisions`,
          note: 'Could you ask the panel to submit scorecards and make a decision this week?',
        },
        ctx,
      )
    },
  )
}

/* ───────────── HRBP: Waiting on others by owner group and kind ───────────── */

/** Kinds an HRBP reads one by one: stay conversations and probation decisions. */
const ONE_BY_ONE = ['hrbp:stay-conversations', 'onboarding:probation'] as const

function foldHrbpWaiting(waiting: readonly OpenAction[], ctx: Ctx): OpenAction[] {
  return foldBy(
    waiting,
    (a) =>
      a.item.severity === 'critical' || kindMatches(kindKey(a), ONE_BY_ONE)
        ? null
        : `hrbp:waiting:${a.role}:${labelOf(a)}`,
    2,
    (key, members) => {
      const role = members[0].role
      const label = labelOf(members[0])
      const owners = new Set(members.map((a) => a.ownerKey)).size
      const with_ =
        owners === 1
          ? ` with ${members[0].ownerName}`
          : owners === members.length
            ? `, each with its own ${ROLE_NOUN[role][0]}`
            : ` with ${plural(owners, ROLE_NOUN[role][0], ROLE_NOUN[role][1])}`
      return rollupOf(
        members,
        {
          key,
          what: `${countOf(members.length, label)}${with_}${dueTail(members, ctx.asOf)}`,
          subject: `${ACTION_OWNER_LABEL[role]}: ${countOf(members.length, label).replace(/^[\d,]+ /, '')}`,
          kind: label,
          title: `${ACTION_OWNER_LABEL[role]}: ${label.toLowerCase()}`,
          owner: { role, ownerName: ACTION_OWNER_LABEL[role] },
        },
        ctx,
      )
    },
  )
}

/* ───────────── per mode ───────────── */

const ESCALATING: ReadonlySet<Mode> = new Set(['hr', 'chro', 'developer'])

/** A mode's two lists with its roll-ups (the lists as `roleItems` split them, most pressing first). */
export function foldRoleLists(
  lists: { needs: readonly OpenAction[]; waiting: readonly OpenAction[] },
  lens: RoleLens,
  ctx: Ctx,
): { needs: OpenAction[]; waiting: OpenAction[] } {
  const mode = lens.mode
  let needs = [...lists.needs]
  let waiting = [...lists.waiting]
  if (ESCALATING.has(mode)) needs = foldEscalations(needs, lens, ctx)
  else if (mode === 'hr-ops') needs = foldHrOps(needs, ctx)
  else if (mode === 'recruiter')
    needs = lens.me ? foldOneRecruiter(needs, ctx) : foldEveryRecruiter(needs, ctx)
  else if (mode === 'manager') needs = foldDecisions(needs, lens, ctx)
  else if (mode === 'hrbp-unit' || mode === 'hrbp-region') waiting = foldHrbpWaiting(waiting, ctx)
  return { needs, waiting }
}

/** Every item a list holds, a roll-up's members in its place. */
export const unfold = (list: readonly OpenAction[]): OpenAction[] =>
  list.flatMap((a) => (a.members ? [...a.members] : [a]))

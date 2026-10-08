/**
 * Whose an Action center item is, per mode (docs/ROLES-V2.md 6.1; docs/ACTION-CENTER-AUDIT.md 5.12
 * and the item changes of ROLES-V2 5.14). Plain data, so the Security center can lay overrides on
 * it and the routing snapshot shows every change in review.
 *
 * Each mode has an ordered list of rules; the first rule that matches an item decides its list:
 * `needs` ("Needs attention": owned by the role, its "me" or its queues) or `waiting` ("Waiting on
 * others": in the role's area, owned by someone else). An item no rule matches is left out of the
 * mode's lists (counted, never shown).
 *
 * - `kinds` match the item id's view and kind ('recruiting:review'); an entry ending in `*`
 *   matches every kind that starts with it ('compliance:*', 'recruiting:schedule-*').
 * - `owners` limit a rule to items whose owner group is one of them.
 * - `me` limits a rule to items owned by the lens's person (the manager, the one recruiter); a
 *   lens without one ("Every recruiter") skips the condition.
 * - `escalation` matches the escalations (Developer, HR and CHRO's Needs attention, ROLES-V2 5.4):
 *   legal exposure, the critical kinds below, and any critical item overdue more than the
 *   `escalationDays` setting on `actions.items.critical`.
 * - `severities` limit a rule to items of those severities.
 * - `site` limits a rule to items about a site or the region rather than one person or record
 *   (an exit survey reason at a location, day-30 readiness in a region).
 * - `person` limits a rule to items owned by a named person, not a team queue.
 *
 * `owned` rules come first when the lens names the mode's person from Settings: HRBP for a region
 * with a regional HR business partner on the Regions list (docs/ACTION-CENTER-AUDIT.md 5.8 and
 * part 8, question 3). Their own items and the region's site matters are their Needs attention;
 * the business unit HRBPs keep their own items about people in the region, which wait on them.
 * Without a regional HRBP named, region items route by kind inside the scope (ROLES-V2 5.5).
 *
 * `unlisted` names items a mode does not list at all, not even in the full list of Developer, HR
 * and CHRO: HR and the CHRO get one item per required course below target in place of the
 * per-manager training roll-ups, which stay the managers' (ROLES-V2 5.14).
 *
 * Pure: no React, no view registry.
 */
import type { Severity } from '@/components/types'
import type { ActionOwnerRole } from '@/views/types'
import type { Mode } from '../modes'

export type ItemList = 'needs' | 'waiting'

export interface RouteRule {
  kinds?: readonly string[]
  owners?: readonly ActionOwnerRole[]
  me?: boolean
  escalation?: boolean
  severities?: readonly Severity[]
  site?: boolean
  person?: boolean
  list: ItemList
}

/** Items a mode does not list at all: by kind and owner group. */
export type UnlistedRule = Pick<RouteRule, 'kinds' | 'owners'>

export interface ModeRouting {
  /** Who "Needs attention" is for, in a sentence: "Nothing is waiting on Total rewards". */
  practice: string
  rules: readonly RouteRule[]
  /** Tried before `rules` when the lens names the mode's person from Settings (a regional HRBP). */
  owned?: readonly RouteRule[]
  unlisted?: readonly UnlistedRule[]
}

/* ───────────── the kinds, by the routing table's rows (audit 5.12) ───────────── */

/** Recruiting candidate steps. */
export const CANDIDATE_STEPS = [
  'recruiting:review',
  'recruiting:schedule-*',
  'recruiting:decision',
  'recruiting:offer',
  'recruiting:offer-answer',
] as const
/** Empty funnel and req aging. */
export const REQ_AGING = ['recruiting:empty-funnel', 'recruiting:past-target'] as const
export const DAY_ONE = ['onboarding:task'] as const
export const PROBATION = ['onboarding:probation'] as const
/** I-9, reverification and export licenses (Onboarding's I-9 item folds into Compliance's). */
export const COMPLIANCE = ['onboarding:i9', 'compliance:*'] as const
/** Cases, transactions and returns from leave. */
export const HR_OPS_QUEUES = ['services:*'] as const
/** The per-manager training roll-up. */
export const TRAINING = ['talent:training-overdue'] as const
export const COURSES = ['talent:course-below-target'] as const
export const RATINGS = ['talent:review-missing'] as const
export const PROMOTION = ['talent:promotion-overdue'] as const
export const CRITICAL_ROLES = ['talent:critical-role'] as const
/** Span of control, single-report chains and new managers with a large team. */
export const ORG_DESIGN = ['hrbp:span', 'org:*'] as const
export const STAY = ['hrbp:stay-conversations'] as const
/** Pay position and the merit cycle (ratios; amounts never in the text). */
export const PAY_ITEMS = [
  'comp:below-minimum',
  'comp:guideline-exception',
  'comp:high-rated-low-compa',
  'comp:no-proposal',
] as const
/** Merit spend over budget (a total). */
export const SPEND = ['comp:over-budget'] as const
export const LISTENING = ['listening:*'] as const
/** The kinds an HR business partner owns (5.5): org design, promotions, survey reasons, stay conversations. */
export const HRBP_KINDS = [...ORG_DESIGN, ...PROMOTION, ...LISTENING, ...STAY] as const
/** The hiring plan items Finance owns. */
export const PLAN = ['onboarding:not-in-plan', 'onboarding:plan-behind', 'onboarding:plan-no-req'] as const

/** The queues HR ops works (5.8): every HR ops owner group, plus IT and Facilities day-one tasks. */
const OPS_QUEUES: readonly ActionOwnerRole[] = [
  'hr-ops',
  'payroll',
  'benefits',
  'immigration',
  'trade-compliance',
  'it',
  'facilities',
]

/* ───────────── escalations (ROLES-V2 5.4, audit 5.1) ───────────── */

/** Kinds that escalate when their view rates them critical: a critical role at high risk of loss, a regretted exit cluster. */
export const ESCALATING_KINDS: readonly string[] = ['talent:critical-role', 'hrbp:stay-conversations']

/** The default of the `escalationDays` setting: a critical item overdue more than this escalates. */
export const ESCALATION_DAYS = 14

/** Escalations listed before "Show all" (CHRO's "at most 10"). */
export const ESCALATIONS_SHOWN = 10

/* ───────────── the table ───────────── */

const ESCALATIONS: readonly RouteRule[] = [
  { escalation: true, list: 'needs' },
  { severities: ['critical'], list: 'waiting' },
]

/** HR and the CHRO read training by course; the per-manager roll-ups are the managers'. */
const BY_COURSE: readonly UnlistedRule[] = [{ kinds: TRAINING, owners: ['manager'] }]

const HRBP: ModeRouting = {
  practice: 'HR business partners',
  rules: [
    { kinds: [...ORG_DESIGN, ...PROMOTION], list: 'needs' },
    // Exit survey reasons other than pay, low upward feedback: the HRBP's. Pay reasons are Total rewards'.
    { kinds: [...LISTENING, ...STAY], owners: ['hrbp'], list: 'needs' },
    {
      kinds: [
        ...CANDIDATE_STEPS,
        ...REQ_AGING,
        ...DAY_ONE,
        ...PROBATION,
        ...COMPLIANCE,
        ...HR_OPS_QUEUES,
        ...TRAINING,
        ...COURSES,
        ...RATINGS,
        ...CRITICAL_ROLES,
        ...STAY,
        ...LISTENING,
        ...PAY_ITEMS,
      ],
      list: 'waiting',
    },
  ],
}

/**
 * HRBP for a region with a regional HR business partner named (Settings, Official lists, Regions;
 * audit 5.8): their own items and the region's site matters (they co-own them) are Needs
 * attention; the business unit HRBPs keep their own items about people in the region, which wait
 * on them. Items an HRBP team queue holds stay the regional HRBP's, by the rules after these.
 */
const REGIONAL_OWNER: readonly RouteRule[] = [
  { me: true, list: 'needs' },
  { kinds: LISTENING, site: true, list: 'needs' },
  { kinds: HRBP_KINDS, owners: ['hrbp'], person: true, list: 'waiting' },
]

export const ROUTING: Readonly<Record<Mode, ModeRouting>> = {
  developer: { practice: 'the HR team', rules: ESCALATIONS },
  hr: { practice: 'the HR team', rules: ESCALATIONS, unlisted: BY_COURSE },
  chro: { practice: 'the CHRO', rules: ESCALATIONS, unlisted: BY_COURSE },
  'hrbp-unit': HRBP,
  'hrbp-region': { ...HRBP, owned: REGIONAL_OWNER },
  compensation: {
    practice: 'Total rewards',
    rules: [
      { kinds: [...PAY_ITEMS, ...SPEND], list: 'needs' },
      { kinds: ['listening:exit'], owners: ['total-rewards'], list: 'needs' },
      // Compensation changes Payroll processes, where the mode shows them.
      { kinds: ['services:tx'], owners: ['payroll'], list: 'waiting' },
    ],
  },
  'talent-management': {
    practice: 'Talent management',
    rules: [
      { kinds: [...CRITICAL_ROLES, ...COURSES, ...RATINGS, 'listening:stay'], list: 'needs' },
      // Training with no manager on record; per-manager training stays the managers'.
      { kinds: TRAINING, owners: ['talent'], list: 'needs' },
    ],
  },
  'hr-ops': {
    practice: 'HR ops',
    rules: [
      { kinds: [...HR_OPS_QUEUES, ...COMPLIANCE], list: 'needs' },
      { kinds: DAY_ONE, owners: OPS_QUEUES, list: 'needs' },
      { kinds: [...DAY_ONE, ...PROBATION, 'listening:readiness'], list: 'waiting' },
    ],
  },
  recruiter: {
    practice: 'recruiting',
    rules: [
      { kinds: [...CANDIDATE_STEPS, ...REQ_AGING], owners: ['recruiter'], me: true, list: 'needs' },
      // Decisions with hiring managers, interviews with coordinators, other recruiters' steps, starts.
      { kinds: [...CANDIDATE_STEPS, ...REQ_AGING, ...DAY_ONE], list: 'waiting' },
    ],
  },
  finance: {
    practice: 'Finance',
    rules: [
      { kinds: PLAN, owners: ['finance'], list: 'needs' },
      { kinds: SPEND, list: 'waiting' },
    ],
  },
  manager: {
    practice: 'you',
    rules: [
      { me: true, list: 'needs' },
      {
        kinds: [
          ...CANDIDATE_STEPS,
          ...REQ_AGING,
          ...DAY_ONE,
          ...PROBATION,
          ...TRAINING,
          ...RATINGS,
          ...PROMOTION,
          ...CRITICAL_ROLES,
          ...STAY,
        ],
        list: 'waiting',
      },
    ],
  },
}

/* ───────────── matching ───────────── */

/** The id's view and kind ('recruiting:review'), or the id itself when it has no kind. */
export function itemKindOf(id: string): string {
  const [view, kind] = id.split(':')
  return view && kind ? `${view}:${kind}` : id
}

export function kindMatches(kind: string, entries: readonly string[]): boolean {
  for (const e of entries) if (e.endsWith('*') ? kind.startsWith(e.slice(0, -1)) : kind === e) return true
  return false
}

/** Whether a mode leaves an item out of every list, its full list included. */
export function isUnlisted(routing: ModeRouting, kind: string, owner: ActionOwnerRole): boolean {
  return !!routing.unlisted?.some(
    (r) => (!r.kinds || kindMatches(kind, r.kinds)) && (!r.owners || r.owners.includes(owner)),
  )
}

/** What a rule needs to know about an item. */
export interface RouteFacts {
  kind: string
  owner: ActionOwnerRole
  severity: Severity
  /** The item is owned by the lens's person; null when the lens has none. */
  mine: boolean | null
  escalation: boolean
  /** About a site or the region, not one person or record. */
  site?: boolean
  /** Owned by a named person, not a team queue. */
  person?: boolean
}

function firstMatch(rules: readonly RouteRule[], f: RouteFacts): ItemList | null {
  for (const r of rules) {
    if (r.escalation && !f.escalation) continue
    if (r.kinds && !kindMatches(f.kind, r.kinds)) continue
    if (r.owners && !r.owners.includes(f.owner)) continue
    if (r.severities && !r.severities.includes(f.severity)) continue
    if (r.me && f.mine === false) continue
    if (r.site && !f.site) continue
    if (r.person && !f.person) continue
    return r.list
  }
  return null
}

/** The list a mode's routing puts an item in, or null for neither. */
export function listOf(routing: ModeRouting, f: RouteFacts): ItemList | null {
  // The rules for a person named in Settings apply only while the lens names one.
  if (routing.owned && f.mine !== null) {
    const owned = firstMatch(routing.owned, f)
    if (owned) return owned
  }
  return firstMatch(routing.rules, f)
}

/* ───────────── the snapshot (docs/ROLES-V2.md 6.2, check 4) ───────────── */

/** The snapshot's columns, in the access matrix's order; `owned` reads the mode with its person named. */
const COLUMNS: readonly [Mode, string, 'owned'?][] = [
  ['developer', 'Dev'],
  ['hr', 'HR'],
  ['chro', 'CHRO'],
  ['hrbp-unit', 'BU'],
  ['hrbp-region', 'Rgn'],
  ['hrbp-region', 'Rgn+', 'owned'],
  ['compensation', 'Comp'],
  ['talent-management', 'Tal'],
  ['hr-ops', 'Ops'],
  ['recruiter', 'Rec'],
  ['finance', 'Fin'],
  ['manager', 'Mgr'],
]

const RGN_OWNED_NOTE =
  'Rgn+ is HRBP for a region with a regional HR business partner named in Settings (Official lists, Regions): items they own are always Needs attention; S is Needs attention when about a site or the region.'

/**
 * The routing table as text: one row per item kind, one column per mode. `N` needs, `W` waiting,
 * `-` not listed (also when the mode does not show the kind's view), `n` needs for some owner
 * groups and waiting or not listed for the rest (the second part names them), `w` waiting for
 * some owner groups only, `E` the escalation rules (Developer, HR, CHRO: every item listed, the
 * escalations in Needs attention), `e` the same for some owner groups only, `M` needs when owned
 * by the mode's person, waiting otherwise. `Rgn+` reads HRBP for a region with a regional HRBP
 * named: their own items are always needs (not marked), `S` needs when the item is about a site or
 * the region and as the other letters say otherwise.
 */
export function routingText(
  kinds: readonly { kind: string; owners: readonly ActionOwnerRole[] }[],
  /** Whether the mode lists the kind at all: its view shown and its id prefix not left out. */
  listed: (mode: Mode, kind: string) => boolean,
): string {
  const lines: string[] = []
  const detail: string[] = []
  const width = Math.max(...kinds.map((k) => k.kind.length)) + 2
  lines.push(`${'Kind'.padEnd(width)}${COLUMNS.map(([, c]) => c.padEnd(5)).join('')}`.trimEnd())
  lines.push('-'.repeat(width + COLUMNS.length * 5))
  for (const { kind, owners } of kinds) {
    const cells: string[] = []
    for (const [mode, column, owned] of COLUMNS) {
      // The plain column reads the mode without a person named in Settings.
      const routing = owned || !ROUTING[mode].owned ? ROUTING[mode] : { ...ROUTING[mode], owned: undefined }
      if (!listed(mode, kind)) {
        cells.push('-')
        continue
      }
      if (owned) {
        // Owned by someone else (a named person), about a person or about a site.
        const base = { kind, severity: 'warning' as Severity, escalation: false, mine: false, person: true }
        const plain = owners.map((owner) => listOf(routing, { ...base, owner }))
        const site = owners.map((owner) => listOf(routing, { ...base, owner, site: true }))
        if (site.some((l, i) => l !== plain[i])) {
          cells.push('S')
          continue
        }
        const needs = owners.filter((_, i) => plain[i] === 'needs')
        const waiting = owners.filter((_, i) => plain[i] === 'waiting')
        cells.push(
          needs.length === owners.length
            ? 'N'
            : waiting.length === owners.length
              ? 'W'
              : !needs.length && !waiting.length
                ? '-'
                : needs.length
                  ? 'n'
                  : 'w',
        )
        continue
      }
      if (routing.rules === ESCALATIONS) {
        const out = owners.filter((o) => isUnlisted(routing, kind, o))
        if (out.length === owners.length) cells.push('-')
        else if (out.length) {
          cells.push('e')
          detail.push(`${kind}  ${column}  every item but: ${out.join(', ')}`)
        } else cells.push('E')
        continue
      }
      const base = { kind, severity: 'warning' as Severity, escalation: false }
      const asMine = owners.map((owner) => listOf(routing, { ...base, owner, mine: true }))
      const asOthers = owners.map((owner) => listOf(routing, { ...base, owner, mine: false }))
      const usesMe = asMine.some((l, i) => l !== asOthers[i])
      if (usesMe) {
        cells.push('M')
        continue
      }
      const needs = owners.filter((_, i) => asOthers[i] === 'needs')
      const waiting = owners.filter((_, i) => asOthers[i] === 'waiting')
      if (needs.length === owners.length) cells.push('N')
      else if (waiting.length === owners.length) cells.push('W')
      else if (!needs.length && !waiting.length) cells.push('-')
      else {
        cells.push(needs.length ? 'n' : 'w')
        const part = (xs: readonly string[]) => (xs.length ? xs.join(', ') : 'none')
        detail.push(
          `${kind}  ${column}  needs: ${part(needs)}; waiting: ${part(waiting)}; not listed: ${part(
            owners.filter((o) => !needs.includes(o) && !waiting.includes(o)),
          )}`,
        )
      }
    }
    lines.push(`${kind.padEnd(width)}${cells.map((c) => c.padEnd(5)).join('')}`.trimEnd())
  }
  if (detail.length) lines.push('', 'Owner groups where a kind splits:', ...detail)
  lines.push('', RGN_OWNED_NOTE)
  return `${lines.join('\n')}\n`
}

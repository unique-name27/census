/**
 * Canonical spellings for free-text fields that have a known vocabulary: case categories and
 * channels, candidate sources, learning categories, work sites, currencies, onboarding tasks and
 * their owners. Unlike enum fields, an unknown value here is kept as written.
 */
import {
  CASE_CATEGORIES,
  CASE_CHANNELS,
  type DatasetKey,
  LEARNING_CATEGORIES,
  ONBOARDING_OWNERS,
  ONBOARDING_TASKS,
  SITES,
  SOURCES,
} from '../schema'
import { normText } from './text'
import { matchCanonical } from './vocab'

const CATEGORY_ALIASES: Record<string, string> = {
  pay: 'Payroll',
  paycheck: 'Payroll',
  benefit: 'Benefits',
  leave: 'Leave & accommodation',
  loa: 'Leave & accommodation',
  'leave of absence': 'Leave & accommodation',
  accommodation: 'Leave & accommodation',
  'new hire': 'Onboarding',
  exit: 'Offboarding',
  termination: 'Offboarding',
  verification: 'Employment verification',
  'verification of employment': 'Employment verification',
  voe: 'Employment verification',
  records: 'HR data & records',
  'hr data': 'HR data & records',
  'data change': 'HR data & records',
  access: 'Systems access',
  'system access': 'Systems access',
  systems: 'Systems access',
  compensation: 'Compensation & equity',
  comp: 'Compensation & equity',
  equity: 'Compensation & equity',
  stock: 'Compensation & equity',
  immigration: 'Immigration & mobility',
  visa: 'Immigration & mobility',
  mobility: 'Immigration & mobility',
  'global mobility': 'Immigration & mobility',
  policy: 'Policy question',
  policies: 'Policy question',
  er: 'Employee relations',
  relations: 'Employee relations',
}

const CHANNEL_ALIASES: Record<string, string> = {
  web: 'Portal',
  'self service': 'Portal',
  'service portal': 'Portal',
  online: 'Portal',
  ess: 'Portal',
  'e mail': 'Email',
  mail: 'Email',
  'live chat': 'Chat',
  teams: 'Chat',
  slack: 'Chat',
  chatbot: 'Chat',
  messaging: 'Chat',
  call: 'Phone',
  telephone: 'Phone',
  voice: 'Phone',
  'phone call': 'Phone',
  'walk in': 'Walk-in',
  walkin: 'Walk-in',
  'in person': 'Walk-in',
}

const SOURCE_ALIASES: Record<string, string> = {
  'employee referral': 'Referral',
  referrals: 'Referral',
  'careers page': 'Careers site',
  'career site': 'Careers site',
  'company website': 'Careers site',
  'jobs page': 'Careers site',
  careers: 'Careers site',
  'job boards': 'Job board',
  campus: 'University',
  'university recruiting': 'University',
  'internal applicant': 'Internal',
  'internal candidate': 'Internal',
  'internal mobility': 'Internal',
  'recruiting agency': 'Agency',
  'staffing agency': 'Agency',
  sourcing: 'Sourced',
  prospecting: 'Sourced',
  outbound: 'Sourced',
}

const LOCATION_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  blr: 'Bengaluru',
  saigon: 'Ho Chi Minh City',
  hcmc: 'Ho Chi Minh City',
  'ho chi minh': 'Ho Chi Minh City',
  hcm: 'Ho Chi Minh City',
  munchen: 'Munich',
  muenchen: 'Munich',
  'hsin chu': 'Hsinchu',
  sanjose: 'San Jose',
}

const SITE_NAMES = SITES.map((s) => s.location)

const TASK_NAMES = ONBOARDING_TASKS.map((t) => t.task)
const TASK_ALIASES: Record<string, string> = Object.fromEntries(
  ONBOARDING_TASKS.flatMap((t) => t.aliases.map((a) => [a, t.task])),
)

const OWNER_ALIASES: Record<string, string> = {
  hr: 'People ops',
  'hr ops': 'People ops',
  'hr operations': 'People ops',
  'people operations': 'People ops',
  'people ops team': 'People ops',
  'hr shared services': 'People ops',
  onboarding: 'People ops',
  'onboarding team': 'People ops',
  'it team': 'IT',
  'it service desk': 'IT',
  'service desk': 'IT',
  helpdesk: 'IT',
  'help desk': 'IT',
  workplace: 'Facilities',
  'workplace services': 'Facilities',
  security: 'Facilities',
  'physical security': 'Facilities',
  'real estate': 'Facilities',
  'export compliance': 'Trade compliance',
  'export control': 'Trade compliance',
  'global trade': 'Trade compliance',
  'hiring manager': 'Manager',
  'line manager': 'Manager',
  'people manager': 'Manager',
  ta: 'Recruiter',
  'talent acquisition': 'Recruiter',
  recruiting: 'Recruiter',
  employee: 'New hire',
  'new joiner': 'New hire',
  candidate: 'New hire',
  self: 'New hire',
  starter: 'New hire',
}

/** Words too common in category names to identify one ("Employee benefits" is about benefits). */
const GENERIC_WORDS = new Set([
  'employee',
  'employees',
  'hr',
  'general',
  'other',
  'question',
  'questions',
  'request',
  'issue',
  'help',
  'and',
])

function vocabMatch(
  values: readonly string[],
  aliases: Record<string, string>,
  raw: unknown,
  byWord = false,
): string | null {
  const t = normText(raw)
  if (!t) return null
  const exact = matchCanonical(values, t) ?? aliases[t] ?? null
  if (exact) return exact
  // "San Jose, CA" or "Munich (DE)": try the part before a comma or bracket.
  const head = normText(String(raw).split(/[,(/|]/)[0])
  if (head && head !== t) {
    const h = matchCanonical(values, head) ?? aliases[head]
    if (h) return h
  }
  if (byWord) {
    // "Benefits enrollment" → Benefits: the first distinctive word that names exactly one entry.
    for (const w of t.split(' ')) {
      if (GENERIC_WORDS.has(w)) continue
      const hits = values.filter((v) => normText(v).split(' ')[0] === w)
      if (hits.length === 1) return hits[0]
      if (aliases[w]) return aliases[w]
    }
  }
  return null
}

/**
 * Canonical spelling for free-text fields that have a known vocabulary (case category, channel,
 * source, learning category, site). Returns null when the value is not in the vocabulary; the
 * importer then keeps the original text.
 */
export function canonicalText(dataset: DatasetKey, field: string, raw: unknown): string | null {
  switch (`${dataset}.${field}`) {
    case 'cases.category':
      return vocabMatch(
        CASE_CATEGORIES.map((c) => c.category),
        CATEGORY_ALIASES,
        raw,
        true,
      )
    case 'cases.channel':
      return vocabMatch(CASE_CHANNELS, CHANNEL_ALIASES, raw)
    case 'candidates.source':
      return vocabMatch(SOURCES, SOURCE_ALIASES, raw)
    case 'learning.category':
      return vocabMatch(LEARNING_CATEGORIES, {}, raw, true)
    case 'employees.location':
    case 'requisitions.location':
    case 'cases.location':
      return vocabMatch(SITE_NAMES, LOCATION_ALIASES, raw)
    case 'comp.currency':
      return normalizeCurrency(raw)
    case 'hiringPlan.location':
      return vocabMatch(SITE_NAMES, LOCATION_ALIASES, raw)
    case 'onboardingTasks.task':
      return vocabMatch(TASK_NAMES, TASK_ALIASES, raw)
    case 'onboardingTasks.owner':
      return vocabMatch(ONBOARDING_OWNERS, OWNER_ALIASES, raw)
    default:
      return null
  }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  us$: 'USD',
  c$: 'CAD',
  ca$: 'CAD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'CNY',
  rmb: 'CNY',
  '₹': 'INR',
  rs: 'INR',
  nt$: 'TWD',
  ntd: 'TWD',
  '₪': 'ILS',
  nis: 'ILS',
  '₫': 'VND',
  'us dollar': 'USD',
  'us dollars': 'USD',
  'canadian dollar': 'CAD',
  euro: 'EUR',
  euros: 'EUR',
  'indian rupee': 'INR',
  rupee: 'INR',
  'new taiwan dollar': 'TWD',
  yuan: 'CNY',
  renminbi: 'CNY',
  shekel: 'ILS',
  'israeli shekel': 'ILS',
  dong: 'VND',
}

/** ISO 4217 code from a code, symbol or common name; null when it is not a currency. */
export function normalizeCurrency(raw: unknown): string | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!s) return null
  if (CURRENCY_SYMBOLS[s]) return CURRENCY_SYMBOLS[s]
  return /^[a-z]{3}$/.test(s) ? s.toUpperCase() : null
}

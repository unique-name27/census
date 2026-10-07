/** Deterministic fake data for the chart gallery (not the sample company). */

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = rng(7)
const normal = (mu: number, sd: number) => {
  const u = 1 - rand()
  const v = rand()
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export const DEPARTMENTS = [
  'Process engineering',
  'Design verification',
  'Physical design',
  'Test engineering',
  'Fab operations',
  'Supply chain',
  'Finance',
  'People',
  'Sales',
  'Product marketing',
  'Facilities',
]

export const attritionByDept = DEPARTMENTS.map((department, i) => {
  const headcount = [212, 160, 140, 96, 380, 64, 38, 22, 41, 18, 4][i]
  const leavers = Math.round(
    headcount * [0.142, 0.081, 0.097, 0.11, 0.164, 0.07, 0.05, 0.09, 0.12, 0.06, 0.25][i],
  )
  return {
    department,
    headcount,
    leavers,
    rate: headcount < 5 ? null : leavers / headcount,
    regretted: Math.round(leavers * 0.4),
  }
})

export const timeToFill = DEPARTMENTS.slice(0, 8).map((department, i) => ({
  department,
  days: [62, 48, 71, 39, 33, 41, 37, 29][i],
  n: [18, 12, 9, 7, 22, 5, 4, 3][i],
}))

const MONTHS = [
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
]
export const SOURCES = ['Referral', 'Sourced', 'Careers site', 'Agency']

export const hiresByMonth = MONTHS.flatMap((month, m) =>
  SOURCES.map((source, s) => ({
    month,
    source,
    hires: Math.max(0, Math.round([6, 4, 9, 2][s] + 3 * Math.sin((m + s) / 2) + (m > 8 ? 3 : 0))),
  })),
)

export const hiresTotal = MONTHS.map((month) => ({
  month,
  hires: hiresByMonth.filter((h) => h.month === month).reduce((a, b) => a + b.hires, 0),
}))

export const headcountTrend = ['Logic', 'Memory', 'Analog'].flatMap((unit, u) =>
  [...MONTHS.map((m) => `${m}-01`)].map((date, i) => ({
    date,
    unit,
    headcount: Math.round([620, 410, 260][u] + i * [6, -3, 2][u] + 8 * Math.sin(i / 2 + u)),
  })),
)

export const attritionTrend = MONTHS.map((month, i) => ({
  month,
  rate: 0.11 + 0.02 * Math.sin(i / 3) + i * 0.002,
}))

export const CASE_CATEGORIES = ['Payroll', 'Benefits', 'Leave', 'Employee data', 'Immigration', 'Relocation']
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4']
export const casesByCategory = CASE_CATEGORIES.flatMap((category, c) =>
  PRIORITIES.map((priority, p) => ({
    category,
    priority,
    cases: Math.round(
      [
        [4, 30, 120, 60],
        [2, 18, 90, 40],
        [1, 12, 50, 30],
        [0, 8, 70, 45],
        [3, 10, 25, 5],
        [0, 4, 16, 9],
      ][c][p],
    ),
  })),
)

export const compaRatios = Array.from({ length: 420 }, (_, i) => ({
  id: `E${String(10000 + i)}`,
  level: ['L2', 'L3', 'L4', 'L5', 'L6'][i % 5],
  compaRatio: Math.round(normal(i % 5 === 4 ? 0.94 : 1.0, 0.075) * 1000) / 1000,
}))

export const LEVELS = ['L2', 'L3', 'L4', 'L5', 'L6']
export const heat = DEPARTMENTS.slice(0, 7).flatMap((department, d) =>
  LEVELS.map((level, l) => ({
    department,
    level,
    rate:
      d === 4 && l === 1
        ? null
        : Math.max(0, 0.04 + 0.03 * Math.sin(d * 1.3 + l) + (d === 0 ? 0.06 : 0) + l * 0.004),
    delta: 0.05 * Math.sin(d * 0.9 + l * 1.7),
    n: 10 + ((d * 7 + l * 3) % 40),
  })),
)

export const managers = Array.from({ length: 64 }, (_, i) => {
  const span = Math.round(3 + rand() * 12)
  return {
    id: `M${100 + i}`,
    name: `Manager ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`,
    span,
    attrition: Math.max(0, normal(0.1 + (span > 11 ? 0.06 : 0), 0.035)),
    teams: Math.round(1 + rand() * 3),
    tone: span > 12 ? ('warning' as const) : ('default' as const),
  }
})

export const ranges = LEVELS.map((level, i) => {
  const mid = [92_000, 118_000, 146_000, 182_000, 228_000][i]
  return {
    level,
    min: mid * 0.8,
    mid,
    max: mid * 1.2,
    q1: mid * (0.9 + i * 0.005),
    median: mid * (0.97 + (i === 4 ? -0.04 : 0)),
    q3: mid * 1.05,
    market: mid * (1.02 + i * 0.01),
    p10: mid * 0.82,
    p90: mid * 1.16,
  }
})

export const training = [
  { course: 'Export control', rate: 0.97, tone: 'good' as const },
  { course: 'Information security', rate: 0.91, tone: 'warning' as const },
  { course: 'Harassment prevention', rate: 0.78, tone: 'critical' as const },
]

/* Contract demos: ordinal series, "Other" series, glyph tones, quarterly ticks. */

export const RATINGS = ['1', '2', '3', '4', '5']
export const ratingMix = ['Fab', 'Test', 'Design', 'Finance'].flatMap((group, g) =>
  RATINGS.map((rating, r) => ({
    group,
    rating,
    people: [
      [3, 10, 52, 25, 10],
      [5, 14, 48, 23, 10],
      [2, 8, 45, 30, 15],
      [4, 12, 58, 18, 8],
    ][g][r],
  })),
)

export const hiresWithOther = MONTHS.slice(-6).flatMap((month, m) =>
  ['Referral', 'Sourced', 'Other (3)', 'Careers site'].map((source, s) => ({
    month,
    source,
    hires: [6, 4, 2, 8][s] + ((m + s) % 3),
  })),
)

export const quarterlyAttrition = ['Logic', 'Memory', 'Other'].flatMap((unit, u) =>
  [
    '2024-12-31',
    '2025-03-31',
    '2025-06-30',
    '2025-09-30',
    '2025-12-31',
    '2026-03-31',
    '2026-06-30',
    '2026-09-30',
  ].map((date, i) => ({ date, unit, rate: [0.1, 0.13, 0.09][u] + 0.01 * Math.sin(i + u) })),
)

/* Follow-up demos: signed values, small counts, all-hidden groups, links. */

export const attritionChange = DEPARTMENTS.slice(0, 7).map((department, i) => ({
  department,
  change: [0.008, -0.004, 0.012, -0.011, 0.002, 0, 0.006][i],
}))

export const READINESS = ['Ready now', 'Ready later']
/** Successor counts by quarter: small integers, and one quarter hidden (fewer than 5 roles). */
export const successorCounts = ['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026'].flatMap((quarter, q) =>
  READINESS.map((band, b) => ({
    quarter,
    band,
    people: q === 1 ? null : [1, 2, 2, 3][q] - b,
  })),
)

/** A grid where every group is under 5 people, so every value is hidden. */
export const hiddenGrid = ['Finance', 'People', 'Facilities'].flatMap((department) =>
  ['L5', 'L6'].map((level) => ({ department, level, rate: null as number | null, n: 3 })),
)

export const reqLinks = [
  { id: 'R-1042', title: 'Process engineer', daysOpen: 48, url: 'https://ats.example.com/reqs/R-1042' },
  {
    id: 'R-1057',
    title: 'Design verification lead',
    daysOpen: 71,
    url: 'https://ats.example.com/reqs/R-1057',
  },
  { id: 'R-1063', title: 'Test technician', daysOpen: 12, url: null },
  { id: 'R-1071', title: 'Fab shift supervisor', daysOpen: 33, url: 'javascript:alert(1)' },
]

export const legendShapes = [
  { shape: 'rect' as const, label: 'Bars and areas' },
  { shape: 'line' as const, label: 'Lines and ticks' },
  { shape: 'dot' as const, label: 'Points' },
  { shape: 'diamond' as const, label: 'Diamond markers' },
  { shape: 'medal' as const, label: 'Tier-coded marks' },
]

/* ───────── Refresh additions: bullets, status split, trend grid, annotations ───────── */

export const measures = [
  {
    practice: 'Recruiting',
    measure: 'Median time to fill',
    value: 52,
    target: 45,
    format: 'days' as const,
    status: 'missed' as const,
  },
  {
    practice: 'Recruiting',
    measure: 'Offer acceptance',
    value: 0.781,
    target: 0.85,
    format: 'pct' as const,
    status: 'missed' as const,
  },
  {
    practice: 'Recruiting',
    measure: 'Hires vs plan',
    value: 0.93,
    target: 0.9,
    format: 'pct' as const,
    status: 'met' as const,
  },
  {
    practice: 'Onboarding',
    measure: 'Day-one readiness',
    value: 0.91,
    target: 0.95,
    format: 'pct' as const,
    status: 'watch' as const,
  },
  {
    practice: 'People stats',
    measure: 'Voluntary attrition',
    value: 0.094,
    target: 0.1,
    format: 'pct' as const,
    status: 'met' as const,
  },
  {
    practice: 'People stats',
    measure: 'Regretted attrition',
    value: 0.041,
    target: null,
    format: 'pct' as const,
    status: 'none' as const,
  },
  {
    practice: 'HR ops',
    measure: 'Cases resolved within SLA',
    value: 0.88,
    target: 0.9,
    format: 'pct' as const,
    status: 'watch' as const,
  },
]

export const statusCounts = { met: 4, watch: 7, missed: 10, none: 3 }

export const trendSeries = measures.slice(0, 6).map((m, k) => ({
  id: `gal.${k}`,
  name: m.measure,
  values: MONTHS.slice(-6).map((_, i) => (m.value ?? 0) * (0.9 + 0.04 * i + 0.03 * Math.sin(i + k))),
  periods: MONTHS.slice(-6),
  target: m.target,
  format: m.format,
}))

export const acceptanceByQuarter = [
  { quarterEnd: '2025-12-31', rate: 0.84 },
  { quarterEnd: '2026-03-31', rate: 0.82 },
  { quarterEnd: '2026-06-30', rate: 0.8 },
  { quarterEnd: '2026-09-30', rate: 0.68 },
]

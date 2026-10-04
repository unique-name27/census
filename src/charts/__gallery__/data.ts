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

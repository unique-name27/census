/**
 * Education on the sample's Employees (docs/ANALYSES.md, 2.10): university, degree level and
 * field of study, drawn from their own stream after every other module, so no existing story
 * moves. Every school is fictional, like the people; the names were checked against real
 * institutions and the ones that came close (a real college with a similar name) were replaced.
 *
 * The stories are planted by choosing who studied where from how each hire turned out
 * (`./outcomes`), measured on the quality of hire cohort with the default settings:
 *
 * 1. Coyote Valley University (San Jose): about 40 hires who do well and stay, clearly above the
 *    company and well above what their site and levels predict.
 * 2. Vrishabha Hills Institute of Technology (Bengaluru): the strongest first reviews of any
 *    school, but about a third did not stay a year, so its quality of hire matches other
 *    Bengaluru hires: the site explains it.
 * 3. Barton Creek Polytechnic (Austin): a dozen hires well below the company, too few to be sure.
 * 4. Fourteen small schools with a handful of hires each, folded into Other universities.
 * 5. Master's above Bachelor's; PhDs with the strongest first reviews and the company's retention;
 *    Associate degrees mostly for test technicians.
 * 6. Bachelor's in computer science placed in Silicon Engineering design and verification roles,
 *    most of whom did not stay a year.
 * 7. Education recorded for about 88% of the cohort, about 70% in Go-to-Market and Corporate.
 *
 * Nobody gets a graduation year. Pure: the same rows and stream give the same result.
 */
import type { DegreeLevel, Employee, ISODate, JobChange, Review } from '../schema'
import { expectedScore, groupScore, type HireOutcome, hireOutcomes } from './outcomes'
import type { Rng } from './prng'

export const COYOTE_VALLEY = 'Coyote Valley University'
export const VRISHABHA_HILLS = 'Vrishabha Hills Institute of Technology'
export const BARTON_CREEK = 'Barton Creek Polytechnic'

const MISSION_PEAK = 'Mission Peak University'
const FRONT_RANGE = 'Front Range Technical University'
const CEDAR_SOUND = 'Cedar Sound Institute of Technology'
const PEDERNALES = 'Pedernales State University'
const LONGLEAF = 'Longleaf Pine Polytechnic'
const KANVA_LAKE = 'Kanva Lake College of Engineering'
const MALNAD = 'Malnad Plateau University'
const BAMBOO_WIND = 'Bamboo Wind University'
const JADE_TERRACE = 'Jade Terrace Institute of Technology'
const EAST_REED = 'East Reed University'
const LOTUS_DELTA = 'Lotus Delta Institute of Technology'
const KISHON = 'Kishon Valley Institute of Technology'
const CYPRESS = 'Cypress Shore College'
const WURMTAL = 'Wurmtal Technical University'
const AMMER = 'Lake Ammer University of Applied Sciences'
const RIDEAU = 'Rideau Ridge Polytechnic'
const MAPLE = 'Maple Narrows University'
const MANGROVE = 'Mangrove Coast University'
const SILK_LANTERN = 'Silk Lantern Institute of Technology'

/** Schools with a handful of hires each: they fold into "Other universities". */
export const SMALL_SCHOOLS: readonly string[] = [
  'Sandhill Crane University',
  'Granite Arch University',
  'Tamarack Lake University',
  'Juniper Mesa College of Engineering',
  'Blue Heron Institute of Technology',
  'Kestrel Bay University',
  'Silver Fir Polytechnic',
  'Northwind Technical University',
  'Copper Kettle Institute of Technology',
  'Coromandel Coast Institute of Technology',
  'Quarry Hill University',
  'Heron Point Polytechnic',
  'Saltmarsh University',
  'Driftwood Institute of Technology',
]

/** The schools of each site's people, with weights. The story schools take only their chosen hires in the cohort. */
const SITE_SCHOOLS: Readonly<Record<string, readonly (readonly [string, number])[]>> = {
  'San Jose': [
    [COYOTE_VALLEY, 25],
    [MISSION_PEAK, 22],
    [FRONT_RANGE, 10],
    [CEDAR_SOUND, 10],
    [PEDERNALES, 8],
    [LONGLEAF, 5],
  ],
  Austin: [
    [BARTON_CREEK, 22],
    [PEDERNALES, 35],
    [FRONT_RANGE, 12],
    [MISSION_PEAK, 10],
  ],
  Raleigh: [
    [LONGLEAF, 55],
    [PEDERNALES, 15],
    [MISSION_PEAK, 10],
  ],
  Boulder: [
    [FRONT_RANGE, 60],
    [CEDAR_SOUND, 15],
  ],
  Seattle: [
    [CEDAR_SOUND, 60],
    [MISSION_PEAK, 15],
    [FRONT_RANGE, 10],
  ],
  Bengaluru: [
    [VRISHABHA_HILLS, 28],
    [KANVA_LAKE, 45],
    [MALNAD, 22],
  ],
  Hsinchu: [
    [BAMBOO_WIND, 55],
    [JADE_TERRACE, 35],
  ],
  Shanghai: [
    [EAST_REED, 55],
    [LOTUS_DELTA, 35],
  ],
  Haifa: [
    [KISHON, 60],
    [CYPRESS, 30],
  ],
  Munich: [
    [WURMTAL, 60],
    [AMMER, 30],
  ],
  Toronto: [
    [RIDEAU, 55],
    [MAPLE, 35],
  ],
  Vancouver: [
    [MAPLE, 55],
    [RIDEAU, 30],
  ],
  'Ho Chi Minh City': [
    [MANGROVE, 60],
    [SILK_LANTERN, 30],
  ],
}

const STORY_SCHOOLS = new Set([COYOTE_VALLEY, VRISHABHA_HILLS, BARTON_CREEK])

/** Every school the sample uses, main ones first. */
export const SAMPLE_UNIVERSITIES: readonly string[] = [
  ...new Set([...Object.values(SITE_SCHOOLS).flatMap((xs) => xs.map(([s]) => s)), ...SMALL_SCHOOLS]),
]

type Group = 'silicon' | 'software' | 'product' | 'ops' | 'gtm' | 'corp' | 'tech' | 'exec'

const SOFTWARE = new Set(['Firmware', 'Software'])
const PRODUCT = new Set(['Product Engineering', 'Test Engineering', 'Quality & Reliability'])
const OPS = new Set(['Supply Chain', 'Procurement', 'Foundry Operations', 'Facilities'])
const TECH = new Set(['Information Technology', 'Information Security', 'EDA & CAD Infrastructure'])

function groupOf(e: Employee): Group {
  const fn = e.jobFunction ?? ''
  if (fn === 'Executive Leadership') return 'exec'
  if (SOFTWARE.has(fn)) return 'software'
  if (PRODUCT.has(fn)) return 'product'
  if (OPS.has(fn)) return 'ops'
  if (TECH.has(fn)) return 'tech'
  if (e.jobFamily === 'Silicon Engineering' || e.jobFamily === 'Systems & Software Engineering')
    return 'silicon'
  if (e.jobFamily === 'Go-to-Market') return 'gtm'
  return 'corp'
}

type Field = string
const FIELDS: Readonly<Record<Group, readonly (readonly [Field, number])[]>> = {
  silicon: [
    ['Electrical Engineering', 62],
    ['Computer Engineering', 22],
    ['Physics', 7],
    ['Materials Science', 3],
    ['Mathematics', 3],
    ['Computer Science', 3],
  ],
  software: [
    ['Computer Science', 50],
    ['Computer Engineering', 38],
    ['Electrical Engineering', 10],
    ['Mathematics', 2],
  ],
  product: [
    ['Electrical Engineering', 40],
    ['Materials Science', 15],
    ['Chemical Engineering', 15],
    ['Mechanical Engineering', 15],
    ['Physics', 10],
    ['Other', 5],
  ],
  ops: [
    ['Business', 35],
    ['Mechanical Engineering', 25],
    ['Chemical Engineering', 10],
    ['Materials Science', 10],
    ['Other', 20],
  ],
  gtm: [
    ['Electrical Engineering', 40],
    ['Business', 40],
    ['Computer Engineering', 10],
    ['Other', 10],
  ],
  corp: [
    ['Business', 50],
    ['Mathematics', 12],
    ['Other', 38],
  ],
  tech: [
    ['Computer Science', 50],
    ['Computer Engineering', 30],
    ['Electrical Engineering', 20],
  ],
  exec: [
    ['Electrical Engineering', 50],
    ['Business', 30],
    ['Computer Engineering', 20],
  ],
}

/** Degree levels of people outside the cohort (inside it the plant decides PhD and Associate). */
const DEGREES: Readonly<Record<Group, readonly (readonly [DegreeLevel, number])[]>> = {
  silicon: [
    ["Bachelor's", 42],
    ["Master's", 46],
    ['PhD', 10],
    ['Other', 2],
  ],
  software: [
    ["Bachelor's", 50],
    ["Master's", 44],
    ['PhD', 6],
  ],
  product: [
    ["Bachelor's", 52],
    ["Master's", 34],
    ['PhD', 4],
    ['Associate', 6],
    ['Other', 4],
  ],
  ops: [
    ["Bachelor's", 58],
    ["Master's", 15],
    ['Associate', 10],
    ['Other', 17],
  ],
  gtm: [
    ["Bachelor's", 55],
    ["Master's", 40],
    ['Other', 5],
  ],
  corp: [
    ["Bachelor's", 50],
    ["Master's", 40],
    ['Other', 10],
  ],
  tech: [
    ["Bachelor's", 60],
    ["Master's", 32],
    ['Associate', 4],
    ['Other', 4],
  ],
  exec: [
    ["Bachelor's", 25],
    ["Master's", 60],
    ['PhD', 15],
  ],
}

const TECHNICIAN = /Technician/

export interface Education {
  university: string | null
  degreeLevel: DegreeLevel | null
  fieldOfStudy: string | null
}

const NONE: Education = { university: null, degreeLevel: null, fieldOfStudy: null }

/** The groups the plant chose, for its tests and the README. */
export interface EducationPlan {
  byId: ReadonlyMap<string, Education>
  coyote: readonly string[]
  vrishabha: readonly string[]
  barton: readonly string[]
  phd: readonly string[]
  associate: readonly string[]
  /** Bachelor's in computer science in Silicon Engineering design and verification roles. */
  csDesign: readonly string[]
}

/** Try `propose` until `accept` passes (deterministic: the stream decides each try). */
function search<T>(tries: number, propose: () => T, accept: (t: T) => boolean): T {
  let last = propose()
  for (let i = 0; i < tries; i++) {
    if (accept(last)) return last
    last = propose()
  }
  throw new Error('Education plant: no draw met its targets')
}

const ids = (hs: readonly HireOutcome[]) => hs.map((h) => h.e.employeeId)

export function planEducation(
  employees: readonly Employee[],
  reviews: readonly Review[],
  jobChanges: readonly JobChange[],
  asOf: ISODate,
  rng: Rng,
): EducationPlan {
  const cohort = hireOutcomes(employees, reviews, jobChanges, asOf)
  const company = groupScore(cohort)
  const cQ = company.Q ?? 0
  const scored = cohort.filter((h) => h.Q != null)
  const at = (site: string) => scored.filter((h) => h.e.location === site)
  const taken = new Set<string>()
  const free = (hs: readonly HireOutcome[]) => hs.filter((h) => !taken.has(h.e.employeeId))
  const take = (hs: readonly HireOutcome[]) => {
    for (const h of hs) taken.add(h.e.employeeId)
    return hs
  }

  // Associate degrees: the test and lab technicians, and a few in operations.
  const technicians = free(cohort.filter((h) => TECHNICIAN.test(h.e.jobTitle)))
  const associate = take([
    ...technicians,
    ...rng.sample(
      free(cohort.filter((h) => groupOf(h.e) === 'ops' && !TECHNICIAN.test(h.e.jobTitle))),
      Math.min(technicians.length - 1, Math.max(2, 10 - technicians.length)),
    ),
  ])

  // 1. Coyote Valley: San Jose hires who did well and stayed, and one or two who did not.
  const sj = free(at('San Jose'))
  const coyote = take(
    search(
      600,
      () => [
        ...rng.sample(
          sj.filter((h) => h.R === 100 && (h.P ?? 0) >= 50),
          rng.int(36, 40),
        ),
        ...rng.sample(
          sj.filter((h) => h.R === 0 && (h.P ?? 0) >= 50),
          rng.int(1, 2),
        ),
      ],
      (g) => {
        const s = groupScore(g)
        const exp = expectedScore(g, cohort) ?? 0
        return (
          s.n >= 35 &&
          s.n <= 45 &&
          (s.Q ?? 0) >= cQ + 10 &&
          (s.low ?? 0) > cQ + 2 &&
          (s.Q ?? 0) - exp >= 9 &&
          Math.abs(exp - 65) <= 3 &&
          (s.P ?? 0) <= 64
        )
      },
    ),
  )

  // 2. Vrishabha Hills: Bengaluru's strongest first reviews, a third gone within the year.
  const blr = free(at('Bengaluru'))
  const pick = (pool: readonly HireOutcome[], lo: number, hi: number) => rng.sample(pool, rng.int(lo, hi))
  const vrishabha = take(
    search(
      2000,
      () => [
        ...pick(
          blr.filter((h) => (h.P ?? 0) >= 75 && h.R === 0),
          5,
          8,
        ),
        ...pick(
          blr.filter((h) => (h.P ?? 0) >= 75 && h.R === 100),
          12,
          18,
        ),
        ...pick(
          blr.filter((h) => h.P === 50 && h.R === 100),
          3,
          8,
        ),
        ...pick(
          blr.filter((h) => h.P == null && h.Q === 0),
          2,
          5,
        ),
      ],
      (g) => {
        const s = groupScore(g)
        const exp = expectedScore(g, cohort) ?? 0
        return (
          s.n >= 29 &&
          s.n <= 35 &&
          (s.P ?? 0) >= 68 &&
          (s.R ?? 100) <= 68 &&
          (s.R ?? 0) >= 58 &&
          Math.abs((s.Q ?? 0) - exp) <= 2
        )
      },
    ),
  )

  // 3. Barton Creek: a dozen Austin hires, well below the company, with an interval that crosses it.
  const aus = free(at('Austin'))
  const barton = take(
    search(
      2000,
      () => [
        ...pick(
          aus.filter((h) => (h.Q ?? 100) <= 37.5),
          2,
          3,
        ),
        ...pick(
          aus.filter((h) => h.R === 100 && (h.P ?? 100) <= 50),
          8,
          10,
        ),
      ],
      (g) => {
        const s = groupScore(g)
        return s.n >= 10 && s.n <= 14 && (s.Q ?? 100) <= cQ - 9 && (s.high ?? 0) > cQ + 1
      },
    ),
  )

  // 5. PhDs: strong first reviews, the company's retention, in engineering at L3 and up.
  const engineering = (h: HireOutcome) => {
    const g = groupOf(h.e)
    return (g === 'silicon' || g === 'software') && h.band !== 'L1-L2'
  }
  const phd = take(
    search(
      2000,
      () => {
        const pool = free(scored.filter(engineering))
        return [
          ...pick(
            pool.filter((h) => (h.P ?? 0) >= 75 && h.R === 100),
            15,
            19,
          ),
          ...pick(
            pool.filter((h) => (h.P ?? 0) >= 75 && h.R === 0),
            2,
            4,
          ),
          ...pick(
            pool.filter((h) => h.P === 50 && h.R === 100),
            2,
            4,
          ),
        ]
      },
      (g) => {
        const s = groupScore(g)
        return s.n >= 20 && s.n <= 27 && (s.P ?? 0) >= 72 && Math.abs((s.R ?? 0) - (company.R ?? 0)) <= 4
      },
    ),
  )

  // 6. Computer science bachelor's in Silicon Engineering design and verification roles.
  const design = (h: HireOutcome) =>
    h.e.businessUnit === 'Silicon Engineering' &&
    (h.e.jobFunction === 'Design RTL' || h.e.jobFunction === 'Design Verification')
  const csDesign = take(
    search(
      2000,
      () => {
        const pool = free(scored.filter(design))
        return [
          ...pick(
            pool.filter((h) => h.R === 0),
            6,
            7,
          ),
          ...pick(
            pool.filter((h) => h.R === 100 && (h.P ?? 100) <= 50),
            6,
            8,
          ),
        ]
      },
      (g) => {
        const s = groupScore(g)
        return s.n >= 12 && s.n <= 15 && (s.R ?? 100) <= 55 && (s.Q ?? 100) <= 50
      },
    ),
  )

  const byId = new Map<string, Education>()
  const school = (e: Employee, cohortHire: boolean): string => {
    const options = (SITE_SCHOOLS[e.location] ?? SITE_SCHOOLS['San Jose']).filter(
      ([s]) => !cohortHire || !STORY_SCHOOLS.has(s),
    )
    return rng.pickPair(options)
  }
  const fieldFor = (e: Employee): string => rng.pickPair(FIELDS[groupOf(e)])

  // 7. Who has no education on record: about 30% in Go-to-Market and Corporate, 4% elsewhere.
  const lowCoverage = (e: Employee) => e.businessUnit === 'Go-to-Market' || e.businessUnit === 'Corporate'
  const blank = new Set<string>()
  for (const unit of [...new Set(cohort.map((h) => h.e.businessUnit))].sort()) {
    const hires = cohort.filter((h) => h.e.businessUnit === unit)
    const k = Math.round(hires.length * (lowCoverage(hires[0].e) ? 0.3 : 0.045))
    for (const h of rng.sample(free(hires), k)) blank.add(h.e.employeeId)
  }

  // The rest of the cohort: Master's for more of those who did well (the plant's own lean).
  const coyoteIds = new Set(ids(coyote))
  const vrishabhaIds = new Set(ids(vrishabha))
  const bartonIds = new Set(ids(barton))
  const phdIds = new Set(ids(phd))
  const associateIds = new Set(ids(associate))
  const csIds = new Set(ids(csDesign))
  const smallPool = rng.sample(
    cohort.filter((h) => !taken.has(h.e.employeeId) && !blank.has(h.e.employeeId)),
    44,
  )
  const small = new Map(smallPool.map((h, i) => [h.e.employeeId, SMALL_SCHOOLS[i % SMALL_SCHOOLS.length]]))
  // The other cohort hires of a site are dealt to its schools in order of quality of hire, so each
  // school gets a spread like its site's and none stands out by the luck of the draw.
  const dealt = new Map<string, string>()
  for (const site of Object.keys(SITE_SCHOOLS)) {
    const options = SITE_SCHOOLS[site].filter(([x]) => !STORY_SCHOOLS.has(x))
    const hires = cohort
      .filter(
        (h) =>
          h.e.location === site &&
          !taken.has(h.e.employeeId) &&
          !blank.has(h.e.employeeId) &&
          !small.has(h.e.employeeId),
      )
      .sort((a, b) => (a.Q ?? 60) - (b.Q ?? 60) || a.e.employeeId.localeCompare(b.e.employeeId))
    const total = options.reduce((t, [, w]) => t + w, 0)
    const given = new Map<string, number>()
    hires.forEach((h, i) => {
      // Largest remainder: the school furthest behind its share takes the next hire.
      let best = options[0][0]
      let behind = -Infinity
      for (const [x, w] of options) {
        const gap = ((i + 1) * w) / total - (given.get(x) ?? 0)
        if (gap > behind) {
          behind = gap
          best = x
        }
      }
      given.set(best, (given.get(best) ?? 0) + 1)
      dealt.set(h.e.employeeId, best)
    })
  }
  for (const h of cohort) {
    const e = h.e
    const id = e.employeeId
    if (blank.has(id)) {
      byId.set(id, NONE)
      continue
    }
    const university = coyoteIds.has(id)
      ? COYOTE_VALLEY
      : vrishabhaIds.has(id)
        ? VRISHABHA_HILLS
        : bartonIds.has(id)
          ? BARTON_CREEK
          : (small.get(id) ?? dealt.get(id) ?? school(e, true))
    let degreeLevel: DegreeLevel
    if (phdIds.has(id)) degreeLevel = 'PhD'
    else if (associateIds.has(id)) degreeLevel = 'Associate'
    else if (csIds.has(id)) degreeLevel = "Bachelor's"
    else {
      const strong = (h.Q ?? 60) >= 70
      degreeLevel = rng.pickPair([
        ["Master's", strong ? 58 : 32],
        ["Bachelor's", strong ? 38 : 62],
        ['Other', 4],
      ])
    }
    const fieldOfStudy = csIds.has(id)
      ? 'Computer Science'
      : associateIds.has(id) && TECHNICIAN.test(e.jobTitle)
        ? rng.pickPair([
            ['Electrical Engineering', 60],
            ['Other', 40],
          ])
        : fieldFor(e)
    byId.set(id, { university, degreeLevel, fieldOfStudy })
  }

  // Keep the lean the plant needs, whatever the draw: Master's at least 5 points above Bachelor's,
  // and computer science bachelor's below electrical engineering ones company-wide and in Silicon
  // Engineering. Swaps touch only hires outside the chosen groups.
  const fixed = (id: string) => taken.has(id) || blank.has(id)
  const of = (
    pred: (x: Education, h: HireOutcome) => boolean,
    inScope: (h: HireOutcome) => boolean = () => true,
  ) => cohort.filter((h) => inScope(h) && pred(byId.get(h.e.employeeId) ?? NONE, h))
  const meanQ = (hs: readonly HireOutcome[]) => groupScore(hs).Q ?? 0
  const scoredSort = (hs: HireOutcome[], dir: 1 | -1) =>
    hs.filter((h) => h.Q != null).sort((a, b) => dir * ((a.Q as number) - (b.Q as number)))
  for (let i = 0; i < 200; i++) {
    const masters = of((x) => x.degreeLevel === "Master's")
    const bachelors = of((x) => x.degreeLevel === "Bachelor's")
    if (meanQ(masters) - meanQ(bachelors) >= 5) break
    const b = scoredSort(
      bachelors.filter((h) => !fixed(h.e.employeeId)),
      -1,
    )[0]
    const m = scoredSort(
      masters.filter((h) => !fixed(h.e.employeeId)),
      1,
    )[0]
    if (!b || !m) break
    byId.set(b.e.employeeId, { ...(byId.get(b.e.employeeId) as Education), degreeLevel: "Master's" })
    byId.set(m.e.employeeId, { ...(byId.get(m.e.employeeId) as Education), degreeLevel: "Bachelor's" })
  }
  const silicon = (h: HireOutcome) => h.e.businessUnit === 'Silicon Engineering'
  for (const [scope, gap] of [
    [() => true, 7],
    [silicon, 13],
  ] as const)
    for (let i = 0; i < 200; i++) {
      const csB = of((x) => x.degreeLevel === "Bachelor's" && x.fieldOfStudy === 'Computer Science', scope)
      const eeB = of(
        (x) => x.degreeLevel === "Bachelor's" && x.fieldOfStudy === 'Electrical Engineering',
        scope,
      )
      if (meanQ(eeB) - meanQ(csB) >= gap) break
      const top = scoredSort(
        csB.filter((h) => !fixed(h.e.employeeId)),
        -1,
      )[0]
      if (!top) break
      byId.set(top.e.employeeId, {
        ...(byId.get(top.e.employeeId) as Education),
        fieldOfStudy: 'Computer Engineering',
      })
    }

  // Everyone outside the cohort: by site and job, with the same gaps in Go-to-Market and Corporate.
  for (const e of employees) {
    if (byId.has(e.employeeId)) continue
    const share =
      e.employmentType === 'Contractor'
        ? 0.5
        : e.employmentType === 'Intern'
          ? 0.7
          : lowCoverage(e)
            ? 0.72
            : 0.95
    if (!rng.chance(share)) {
      byId.set(e.employeeId, NONE)
      continue
    }
    const g = groupOf(e)
    const degreeLevel: DegreeLevel =
      e.employmentType === 'Intern'
        ? rng.pickPair([
            ["Bachelor's", 60],
            ['Other', 40],
          ])
        : TECHNICIAN.test(e.jobTitle)
          ? 'Associate'
          : rng.pickPair(DEGREES[g])
    byId.set(e.employeeId, { university: school(e, false), degreeLevel, fieldOfStudy: fieldFor(e) })
  }

  // A few partial records, as HR systems hold them: a degree with no school, a school with no field.
  for (const e of employees) {
    const x = byId.get(e.employeeId)
    if (!x?.university || taken.has(e.employeeId)) continue
    const r = rng.next()
    if (r < 0.015) byId.set(e.employeeId, { ...x, university: null })
    else if (r < 0.035) byId.set(e.employeeId, { ...x, fieldOfStudy: null })
  }

  return {
    byId,
    coyote: ids(coyote),
    vrishabha: ids(vrishabha),
    barton: ids(barton),
    phd: ids(phd),
    associate: ids(associate),
    csDesign: ids(csDesign),
  }
}

/** Employees with university, degree level and field of study (blank where the plan has none). */
export function withEducation(employees: readonly Employee[], plan: EducationPlan): Employee[] {
  return employees.map((e) => ({ ...e, ...(plan.byId.get(e.employeeId) ?? NONE) }))
}

/**
 * The sample's job architecture (docs/TAXONOMY.md, section 4). A job family is the broad group
 * (Silicon Engineering) and contains job functions (Design RTL). Every person, current and former,
 * gets both from their department and job title; departments and business units stay org
 * structure, so a family is not derived from them. Packaging and Post-Silicon Validation sit in
 * the Systems & Software business unit and in the Silicon Engineering family.
 *
 * Chip development stages (docs/ANALYSES.md, 4.3 and 4.10): every engineering function has one
 * saved on the sample's Job functions list, except Packaging, left blank so Census proposes
 * Signoff and tape-out from its name and Engineering by stage shows it as proposed. Product
 * engineering, test and quality sit in Product & Test Operations, a family that is not marked
 * engineering, and count through their saved stage; EDA & CAD Infrastructure does the same from
 * Corporate.
 */
import type { ChipStageKey, Employee, Level } from '../schema'

export interface SampleFunction {
  name: string
  /** Its chip development stage as saved on the sample's list; none for functions outside engineering. */
  stage?: ChipStageKey
  /** The stage Census proposes from the name, left unsaved on purpose (Packaging). */
  proposed?: ChipStageKey
}

export interface SampleFamily {
  family: string
  /** The Job families list's Engineering attribute in the sample. */
  engineering: boolean
  functions: readonly SampleFunction[]
}

/** Families in order, each with its functions in order (Silicon Engineering's in the chip flow). */
export const JOB_ARCHITECTURE: readonly SampleFamily[] = [
  {
    family: 'Silicon Engineering',
    engineering: true,
    functions: [
      { name: 'Architecture', stage: 'architecture' },
      { name: 'Design RTL', stage: 'rtl' },
      { name: 'Analog & Mixed-Signal', stage: 'ams' },
      { name: 'Design Verification', stage: 'verification' },
      { name: 'DFT', stage: 'dft' },
      { name: 'Physical Design', stage: 'physical' },
      { name: 'Packaging', proposed: 'signoff' },
      { name: 'Post-Silicon Validation', stage: 'postSilicon' },
    ],
  },
  {
    family: 'Systems & Software Engineering',
    engineering: true,
    functions: [
      { name: 'Hardware Engineering', stage: 'postSilicon' },
      { name: 'Firmware', stage: 'software' },
      { name: 'Software', stage: 'software' },
      { name: 'Systems Validation', stage: 'postSilicon' },
    ],
  },
  {
    family: 'Product & Test Operations',
    engineering: false,
    functions: [
      { name: 'Product Engineering', stage: 'productTest' },
      { name: 'Test Engineering', stage: 'productTest' },
      { name: 'Quality & Reliability', stage: 'productTest' },
      { name: 'Supply Chain' },
      { name: 'Procurement' },
      { name: 'Foundry Operations' },
    ],
  },
  {
    family: 'Go-to-Market',
    engineering: false,
    functions: [
      { name: 'Sales' },
      { name: 'Sales Operations' },
      { name: 'Field Applications' },
      { name: 'Product Marketing' },
    ],
  },
  {
    family: 'Corporate',
    engineering: false,
    functions: [
      { name: 'Accounting' },
      { name: 'FP&A' },
      { name: 'Tax & Treasury' },
      { name: 'Talent Acquisition' },
      { name: 'HR Business Partnering' },
      { name: 'People Operations' },
      { name: 'Total Rewards' },
      { name: 'Learning & Development' },
      { name: 'Legal' },
      { name: 'Information Technology' },
      { name: 'Information Security' },
      { name: 'EDA & CAD Infrastructure', stage: 'shared' },
      { name: 'Facilities' },
      { name: 'Strategy & Communications' },
      { name: 'Executive Administration' },
    ],
  },
  { family: 'Executive', engineering: false, functions: [{ name: 'Executive Leadership' }] },
]

export const FAMILY_OF_FUNCTION: ReadonlyMap<string, string> = new Map(
  JOB_ARCHITECTURE.flatMap((f) => f.functions.map((fn) => [fn.name, f.family] as const)),
)

/** The chip development stage saved for each function that has one. */
export const STAGE_OF_FUNCTION: ReadonlyMap<string, ChipStageKey> = new Map(
  JOB_ARCHITECTURE.flatMap((f) =>
    f.functions.flatMap((fn) => (fn.stage == null ? [] : [[fn.name, fn.stage] as const])),
  ),
)

/** The Engineering attribute of each sample family ('Yes' or 'No'). */
export const ENGINEERING_OF_FAMILY: ReadonlyMap<string, 'Yes' | 'No'> = new Map(
  JOB_ARCHITECTURE.map((f) => [f.family, f.engineering ? 'Yes' : 'No'] as const),
)

/** Per department: title substrings → function, first match wins; then the department's own function. */
const RULES: Readonly<Record<string, { rules: readonly [readonly string[], string][]; otherwise: string }>> =
  {
    'Systems Validation': {
      rules: [[['Post-Silicon Validation'], 'Post-Silicon Validation']],
      otherwise: 'Systems Validation',
    },
    'Hardware Engineering': { rules: [[['Package Design'], 'Packaging']], otherwise: 'Hardware Engineering' },
    'Test & Product Engineering': {
      rules: [[['Test Engineer', 'Test Technician'], 'Test Engineering']],
      otherwise: 'Product Engineering',
    },
    'Supply Chain': {
      rules: [
        [['Procurement'], 'Procurement'],
        [['Foundry Operations'], 'Foundry Operations'],
      ],
      otherwise: 'Supply Chain',
    },
    Sales: { rules: [[['Sales Operations'], 'Sales Operations']], otherwise: 'Sales' },
    Finance: {
      rules: [
        [['Financial Analyst', 'FP&A'], 'FP&A'],
        [['Tax', 'Treasury'], 'Tax & Treasury'],
      ],
      otherwise: 'Accounting',
    },
    People: {
      rules: [
        [['Recruit', 'Talent Acquisition'], 'Talent Acquisition'],
        [['HR Business Partner', 'Employee Relations'], 'HR Business Partnering'],
        [['Compensation', 'Total Rewards', 'Equity'], 'Total Rewards'],
        [['Learning'], 'Learning & Development'],
      ],
      otherwise: 'People Operations',
    },
    IT: {
      rules: [
        [['Security Engineer'], 'Information Security'],
        [['CAD'], 'EDA & CAD Infrastructure'],
      ],
      otherwise: 'Information Technology',
    },
    'Executive Office': {
      rules: [[['Executive Business Partner'], 'Executive Administration']],
      otherwise: 'Strategy & Communications',
    },
    'Digital Design': { rules: [], otherwise: 'Design RTL' },
  }

const EXEC_LEVELS = new Set<Level>(['E1', 'E2', 'E3'])

/**
 * The family and function for a person: E1-E3 are Executive Leadership; otherwise the first
 * title rule of the department that matches, else the department's own function.
 */
export function sampleJob(
  department: string,
  jobTitle: string,
  level: Level | null,
): { jobFamily: string; jobFunction: string } {
  let fn: string
  if (level && EXEC_LEVELS.has(level)) fn = 'Executive Leadership'
  else {
    const dept = RULES[department]
    fn = dept
      ? (dept.rules.find(([parts]) => parts.some((p) => jobTitle.includes(p)))?.[1] ?? dept.otherwise)
      : department
  }
  const family = FAMILY_OF_FUNCTION.get(fn)
  if (!family) throw new Error(`No job family for ${department} / ${jobTitle}`)
  return { jobFamily: family, jobFunction: fn }
}

/** Rows with jobFamily and jobFunction set right after jobTitle (the column order the roster has today). */
export function withJobs(rows: readonly Employee[]): Employee[] {
  return rows.map((e) => {
    const { employeeId, name, jobTitle, jobFamily: _f, jobFunction: _p, ...rest } = e
    return { employeeId, name, jobTitle, ...sampleJob(e.department, jobTitle, e.level), ...rest }
  })
}

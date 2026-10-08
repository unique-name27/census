/**
 * Northgate Semiconductor's structure as data: business units, departments with their site mix,
 * level mix and career tracks, the executive layer, and cost centers.
 */
import type { Level } from '../schema'
import type { Tag } from './model'

export type IcLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'
export const IC_LEVELS: readonly IcLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']

export const SE = 'Silicon Engineering'
export const SS = 'Systems & Software'
export const OPS = 'Operations'
export const GTM = 'Go-to-Market'
export const CORP = 'Corporate'
export const EO = 'Executive Office'

export type Ladder = 'eng' | 'biz' | 'tech'

export interface Track {
  role: string
  w: number
  /** Comp market seed for the track (see `Person.marketKey`); the department name when absent. */
  marketKey?: string
  min?: IcLevel
  max?: IcLevel
  ladder?: Ladder
  /** Explicit titles for roles that don't follow a standard ladder. */
  titles?: Partial<Record<IcLevel, string>>
}

interface TeamPlant {
  site: string
  size: number
  tag: Tag
}

export interface DeptSpec {
  name: string
  bu: string
  /** Active employees today, including executives seated in the department. */
  size: number
  sites: readonly (readonly [string, number])[]
  /** Relative weights of IC levels L1..L6. */
  mix: readonly number[]
  tracks: Track[]
  directors: number
  /** Senior ICs reporting straight to each (non-planted) director. */
  dirIcs: number
  /** Fixed manager count for small departments; otherwise derived from size. */
  managers?: number
  directorTitles?: string[]
  manager: string
  /** Executive slot the directors (or managers, when there are no directors) report to. */
  boss: string
  costCenter: number
  /** Built by hand rather than by the generic team builder. */
  explicit?: boolean
  plants?: { teams?: TeamPlant[]; singleDirector?: string }
}

const ENG_MIX = [3, 13, 26, 28, 22, 8]
const OPS_MIX = [8, 18, 28, 26, 15, 5]
const GTM_MIX = [3, 15, 25, 30, 20, 7]
const CORP_MIX = [8, 18, 30, 26, 14, 4]

export const DEPTS: DeptSpec[] = [
  {
    name: 'Architecture',
    bu: SE,
    size: 46,
    costCenter: 1110,
    boss: 'vp-arch',
    directors: 1,
    dirIcs: 2,
    sites: [
      ['San Jose', 55],
      ['Haifa', 25],
      ['Austin', 10],
      ['Munich', 10],
    ],
    mix: [0, 3, 12, 25, 35, 25],
    manager: 'Architecture Manager',
    tracks: [
      { role: 'SoC Architect', w: 3, min: 'L4' },
      { role: 'CPU Architect', w: 2, min: 'L4' },
      { role: 'Performance Modeling Engineer', w: 3, min: 'L2', max: 'L5' },
      { role: 'Power Architect', w: 1, min: 'L4' },
    ],
  },
  {
    name: 'Digital Design',
    bu: SE,
    size: 128,
    costCenter: 1120,
    boss: 'vp-arch',
    directors: 3,
    dirIcs: 1,
    sites: [
      ['San Jose', 33],
      ['Austin', 17],
      ['Bengaluru', 27],
      ['Haifa', 13],
      ['Munich', 10],
    ],
    mix: ENG_MIX,
    manager: 'Digital Design Manager',
    tracks: [
      { role: 'ASIC Design Engineer', w: 4 },
      { role: 'RTL Design Engineer', w: 3 },
      { role: 'Digital IP Design Engineer', w: 2 },
      { role: 'Low Power Design Engineer', w: 1, min: 'L3' },
    ],
    plants: { teams: [{ site: 'Bengaluru', size: 9, tag: 'new-manager' }] },
  },
  {
    name: 'Design Verification',
    bu: SE,
    size: 150,
    costCenter: 1130,
    boss: 'vp-verif',
    directors: 4,
    dirIcs: 1,
    sites: [
      ['San Jose', 22],
      ['Bengaluru', 45],
      ['Austin', 8],
      ['Hsinchu', 8],
      ['Ho Chi Minh City', 10],
      ['Raleigh', 7],
    ],
    mix: ENG_MIX,
    manager: 'Design Verification Manager',
    tracks: [
      { role: 'Design Verification Engineer', w: 6 },
      { role: 'Formal Verification Engineer', w: 1, min: 'L3' },
      { role: 'Emulation Engineer', w: 2 },
    ],
    plants: { teams: [{ site: 'San Jose', size: 6, tag: 'hm-awaiting' }] },
  },
  {
    name: 'Physical Design',
    bu: SE,
    size: 112,
    costCenter: 1140,
    boss: 'vp-pd',
    directors: 3,
    dirIcs: 1,
    sites: [
      ['Austin', 30],
      ['San Jose', 20],
      ['Bengaluru', 30],
      ['Hsinchu', 10],
      ['Shanghai', 10],
    ],
    mix: ENG_MIX,
    manager: 'Physical Design Manager',
    tracks: [
      { role: 'Physical Design Engineer', w: 5 },
      { role: 'Static Timing Analysis Engineer', w: 2 },
      { role: 'Physical Verification Engineer', w: 2 },
    ],
    plants: { teams: [{ site: 'Austin', size: 6, tag: 'pd-austin-manager' }] },
  },
  {
    name: 'Analog & Mixed-Signal',
    bu: SE,
    size: 70,
    costCenter: 1150,
    boss: 'vp-pd',
    directors: 2,
    dirIcs: 1,
    sites: [
      ['San Jose', 37],
      ['Boulder', 37],
      ['Munich', 16],
      ['Hsinchu', 10],
    ],
    mix: [2, 10, 22, 30, 26, 10],
    manager: 'Analog Design Manager',
    tracks: [
      { role: 'Analog Design Engineer', w: 4 },
      { role: 'Mixed-Signal Design Engineer', w: 3 },
      { role: 'Analog Layout Engineer', w: 2, max: 'L5' },
      { role: 'SerDes Design Engineer', w: 2, min: 'L3' },
    ],
  },
  {
    name: 'DFT',
    bu: SE,
    size: 50,
    costCenter: 1160,
    boss: 'vp-verif',
    directors: 1,
    dirIcs: 1,
    sites: [
      ['Bengaluru', 45],
      ['San Jose', 28],
      ['Austin', 15],
      ['Hsinchu', 12],
    ],
    mix: ENG_MIX,
    manager: 'DFT Manager',
    tracks: [
      { role: 'DFT Engineer', w: 5 },
      { role: 'Memory BIST Engineer', w: 1, min: 'L2' },
    ],
  },
  {
    name: 'Firmware',
    bu: SS,
    size: 90,
    costCenter: 1210,
    boss: 'vp-sw',
    directors: 2,
    dirIcs: 1,
    sites: [
      ['Bengaluru', 33],
      ['San Jose', 22],
      ['Raleigh', 18],
      ['Toronto', 17],
      ['Haifa', 10],
    ],
    mix: ENG_MIX,
    manager: 'Firmware Engineering Manager',
    tracks: [
      { role: 'Firmware Engineer', w: 5 },
      { role: 'Embedded Software Engineer', w: 3 },
      { role: 'Security Firmware Engineer', w: 1, min: 'L3' },
    ],
  },
  {
    name: 'Software',
    bu: SS,
    size: 122,
    costCenter: 1220,
    boss: 'vp-sw',
    directors: 3,
    dirIcs: 1,
    sites: [
      ['San Jose', 23],
      ['Seattle', 24],
      ['Toronto', 12],
      ['Vancouver', 16],
      ['Bengaluru', 25],
    ],
    mix: ENG_MIX,
    manager: 'Software Engineering Manager',
    tracks: [
      { role: 'Software Engineer', w: 4 },
      { role: 'Driver Engineer', w: 2 },
      { role: 'Compiler Engineer', w: 2 },
      { role: 'SDK Engineer', w: 1 },
      { role: 'Software Tools Engineer', w: 1 },
    ],
    plants: {
      teams: [
        { site: 'Bengaluru', size: 13, tag: 'span-wide' },
        { site: 'Seattle', size: 6, tag: 'hm-awaiting' },
      ],
    },
  },
  {
    name: 'Systems Validation',
    bu: SS,
    size: 70,
    costCenter: 1230,
    boss: 'vp-sys',
    directors: 2,
    dirIcs: 0,
    sites: [
      ['San Jose', 33],
      ['Hsinchu', 20],
      ['Shanghai', 20],
      ['Bengaluru', 17],
      ['Ho Chi Minh City', 10],
    ],
    mix: ENG_MIX,
    manager: 'Systems Validation Manager',
    tracks: [
      { role: 'Systems Validation Engineer', w: 4 },
      { role: 'Post-Silicon Validation Engineer', w: 3 },
      { role: 'Validation Automation Engineer', w: 1 },
    ],
  },
  {
    name: 'Hardware Engineering',
    bu: SS,
    size: 55,
    costCenter: 1240,
    boss: 'vp-sys',
    directors: 2,
    dirIcs: 1,
    sites: [
      ['San Jose', 42],
      ['Boulder', 22],
      ['Raleigh', 22],
      ['Hsinchu', 14],
    ],
    mix: ENG_MIX,
    manager: 'Hardware Engineering Manager',
    tracks: [
      { role: 'Hardware Engineer', w: 3 },
      { role: 'Signal Integrity Engineer', w: 2 },
      { role: 'Board Design Engineer', w: 2 },
      { role: 'Package Design Engineer', w: 2 },
    ],
    plants: { singleDirector: 'Boulder' },
  },
  {
    name: 'Test & Product Engineering',
    bu: OPS,
    size: 92,
    costCenter: 1310,
    boss: 'vp-test',
    directors: 2,
    dirIcs: 0,
    sites: [
      ['Hsinchu', 25],
      ['Shanghai', 25],
      ['San Jose', 22],
      ['Ho Chi Minh City', 16],
      ['Austin', 12],
    ],
    mix: OPS_MIX,
    manager: 'Product Engineering Manager',
    tracks: [
      { role: 'Product Engineer', w: 3 },
      { role: 'Test Engineer', w: 3 },
      { role: 'Yield Engineer', w: 2 },
      { role: 'Test Technician', w: 2, max: 'L3', ladder: 'tech' },
    ],
    plants: { teams: [{ site: 'Hsinchu', size: 14, tag: 'span-wide' }] },
  },
  {
    name: 'Supply Chain',
    bu: OPS,
    size: 44,
    costCenter: 1320,
    boss: 'vp-scm',
    directors: 1,
    dirIcs: 0,
    sites: [
      ['San Jose', 45],
      ['Hsinchu', 25],
      ['Shanghai', 30],
    ],
    mix: OPS_MIX,
    manager: 'Supply Chain Manager',
    tracks: [
      { role: 'Supply Chain Planner', w: 3, ladder: 'biz' },
      { role: 'Foundry Operations Engineer', w: 2 },
      { role: 'Procurement Specialist', w: 2, ladder: 'biz', marketKey: 'Procurement' },
      { role: 'Logistics Specialist', w: 1, ladder: 'biz', max: 'L4' },
    ],
  },
  {
    name: 'Quality & Reliability',
    bu: OPS,
    size: 34,
    costCenter: 1330,
    boss: 'vp-scm',
    directors: 1,
    dirIcs: 0,
    sites: [
      ['Hsinchu', 32],
      ['San Jose', 40],
      ['Shanghai', 28],
    ],
    mix: OPS_MIX,
    manager: 'Quality Engineering Manager',
    tracks: [
      { role: 'Reliability Engineer', w: 3 },
      { role: 'Quality Engineer', w: 3 },
      { role: 'Failure Analysis Engineer', w: 2 },
    ],
  },
  {
    name: 'Sales',
    bu: GTM,
    size: 86,
    costCenter: 1410,
    boss: 'vp-sales',
    directors: 2,
    dirIcs: 0,
    directorTitles: ['Director, Sales, Americas', 'Director, Sales, Asia Pacific and Europe'],
    sites: [
      ['San Jose', 28],
      ['Shanghai', 20],
      ['Munich', 14],
      ['Hsinchu', 8],
      ['Austin', 10],
      ['Seattle', 6],
      ['Bengaluru', 12],
    ],
    mix: GTM_MIX,
    manager: 'Regional Sales Manager',
    tracks: [
      {
        role: 'Account Manager',
        w: 5,
        min: 'L2',
        titles: {
          L2: 'Sales Development Representative',
          L3: 'Account Manager',
          L4: 'Senior Account Manager',
          L5: 'Strategic Account Manager',
          L6: 'Global Account Director',
        },
      },
      { role: 'Sales Operations Analyst', w: 1, ladder: 'biz', marketKey: 'Sales operations', max: 'L5' },
    ],
  },
  {
    name: 'Field Applications',
    bu: GTM,
    size: 64,
    costCenter: 1420,
    boss: 'vp-fae',
    directors: 2,
    dirIcs: 0,
    directorTitles: [
      'Director, Field Applications, Americas and Europe',
      'Director, Field Applications, Asia Pacific',
    ],
    sites: [
      ['San Jose', 25],
      ['Shanghai', 20],
      ['Hsinchu', 15],
      ['Munich', 15],
      ['Bengaluru', 15],
      ['Haifa', 10],
    ],
    mix: GTM_MIX,
    manager: 'Field Applications Manager',
    tracks: [
      { role: 'Field Applications Engineer', w: 5 },
      { role: 'Customer Program Manager', w: 1, ladder: 'biz', min: 'L3' },
    ],
  },
  {
    name: 'Product Marketing',
    bu: GTM,
    size: 34,
    costCenter: 1430,
    boss: 'vp-pmm',
    directors: 0,
    dirIcs: 0,
    sites: [
      ['San Jose', 80],
      ['Austin', 20],
    ],
    mix: GTM_MIX,
    manager: 'Product Marketing Lead',
    tracks: [
      {
        role: 'Product Marketing Manager',
        w: 3,
        min: 'L2',
        titles: {
          L2: 'Associate Product Marketing Manager',
          L3: 'Product Marketing Manager',
          L4: 'Senior Product Marketing Manager',
          L5: 'Lead Product Marketing Manager',
          L6: 'Principal Product Marketing Manager',
        },
      },
      { role: 'Technical Marketing Engineer', w: 2 },
      { role: 'Marketing Communications Specialist', w: 1, ladder: 'biz', max: 'L4' },
    ],
    plants: { teams: [{ site: 'San Jose', size: 1, tag: 'span-single' }] },
  },
  {
    name: 'Finance',
    bu: CORP,
    size: 50,
    costCenter: 1510,
    boss: 'vp-fin',
    directors: 3,
    dirIcs: 1,
    directorTitles: ['Director, Accounting', 'Director, FP&A', 'Director, Tax & Treasury'],
    sites: [
      ['San Jose', 70],
      ['Bengaluru', 20],
      ['Hsinchu', 10],
    ],
    mix: CORP_MIX,
    manager: 'Finance Manager',
    tracks: [
      { role: 'Accountant', w: 3, ladder: 'biz', marketKey: 'Accounting' },
      { role: 'Financial Analyst', w: 3, ladder: 'biz', marketKey: 'FP&A' },
      { role: 'Tax Analyst', w: 1, ladder: 'biz', marketKey: 'Tax', min: 'L2' },
      { role: 'Treasury Analyst', w: 1, ladder: 'biz', marketKey: 'Treasury', min: 'L2' },
    ],
    plants: { singleDirector: 'San Jose' },
  },
  {
    name: 'People',
    bu: CORP,
    size: 46,
    costCenter: 1520,
    boss: 'cpo',
    directors: 3,
    dirIcs: 0,
    explicit: true,
    sites: [
      ['San Jose', 55],
      ['Bengaluru', 20],
      ['Austin', 15],
      ['Hsinchu', 10],
    ],
    mix: CORP_MIX,
    manager: 'People Operations Manager',
    tracks: [
      { role: 'HR Operations Specialist', w: 3, ladder: 'biz', marketKey: 'People operations', max: 'L4' },
      {
        role: 'Technical Recruiter',
        w: 2,
        ladder: 'biz',
        marketKey: 'Talent acquisition',
        min: 'L2',
        max: 'L5',
      },
      { role: 'Recruiting Coordinator', w: 1, ladder: 'tech', marketKey: 'Talent acquisition', max: 'L3' },
      {
        role: 'HR Business Partner',
        w: 1,
        marketKey: 'HR business partnering',
        min: 'L4',
        titles: {
          L4: 'HR Business Partner',
          L5: 'Senior HR Business Partner',
          L6: 'Principal HR Business Partner',
        },
      },
    ],
  },
  {
    name: 'Legal',
    bu: CORP,
    size: 20,
    costCenter: 1530,
    boss: 'gc',
    directors: 2,
    dirIcs: 2,
    managers: 3,
    directorTitles: ['Associate General Counsel, Commercial', 'Associate General Counsel, Corporate'],
    sites: [['San Jose', 100]],
    mix: [0, 15, 25, 30, 22, 8],
    manager: 'Legal Operations Manager',
    tracks: [
      {
        role: 'Corporate Counsel',
        w: 2,
        min: 'L4',
        titles: { L4: 'Corporate Counsel', L5: 'Senior Corporate Counsel', L6: 'Lead Counsel' },
      },
      { role: 'Paralegal', w: 2, ladder: 'tech', max: 'L4' },
      {
        role: 'Contracts Manager',
        w: 2,
        min: 'L3',
        max: 'L5',
        titles: { L3: 'Contracts Specialist', L4: 'Contracts Manager', L5: 'Senior Contracts Manager' },
      },
      {
        role: 'Trade Compliance Specialist',
        w: 1,
        ladder: 'biz',
        marketKey: 'Trade compliance',
        min: 'L3',
        max: 'L5',
      },
    ],
    plants: { teams: [{ site: 'San Jose', size: 1, tag: 'span-single' }] },
  },
  {
    name: 'IT',
    bu: CORP,
    size: 50,
    costCenter: 1540,
    boss: 'vp-it',
    directors: 2,
    dirIcs: 0,
    directorTitles: ['Director, IT Infrastructure', 'Director, Enterprise Applications'],
    sites: [
      ['San Jose', 40],
      ['Bengaluru', 40],
      ['Raleigh', 20],
    ],
    mix: CORP_MIX,
    manager: 'IT Manager',
    tracks: [
      { role: 'IT Support Specialist', w: 2, ladder: 'biz', max: 'L3' },
      { role: 'Systems Administrator', w: 2, ladder: 'biz', max: 'L5' },
      { role: 'Enterprise Applications Engineer', w: 2, marketKey: 'Enterprise applications' },
      { role: 'Security Engineer', w: 2, marketKey: 'Information security', min: 'L2' },
      { role: 'CAD Infrastructure Engineer', w: 2, marketKey: 'EDA and CAD', min: 'L2' },
    ],
    plants: { teams: [{ site: 'Bengaluru', size: 12, tag: 'span-wide' }] },
  },
  {
    name: 'Facilities',
    bu: CORP,
    size: 30,
    costCenter: 1550,
    boss: 'cfo',
    directors: 1,
    dirIcs: 0,
    directorTitles: ['Director, Workplace and Facilities'],
    sites: [
      ['San Jose', 40],
      ['Bengaluru', 20],
      ['Austin', 20],
      ['Hsinchu', 20],
    ],
    mix: [15, 30, 30, 18, 6, 1],
    manager: 'Facilities Manager',
    tracks: [
      { role: 'Facilities Coordinator', w: 2, ladder: 'biz', max: 'L4' },
      { role: 'Lab Operations Technician', w: 2, ladder: 'tech', max: 'L3' },
      { role: 'EHS Specialist', w: 1, ladder: 'biz', min: 'L3', max: 'L5' },
      { role: 'Workplace Experience Specialist', w: 1, ladder: 'biz', max: 'L4' },
    ],
  },
  {
    name: 'Executive Office',
    bu: EO,
    size: 7,
    costCenter: 1010,
    boss: 'ceo',
    directors: 1,
    dirIcs: 0,
    explicit: true,
    sites: [['San Jose', 100]],
    mix: [0, 0, 20, 40, 40, 0],
    manager: 'Chief of Staff',
    tracks: [{ role: 'Strategy Analyst', w: 1, ladder: 'biz', marketKey: 'Corporate strategy' }],
  },
]

const DEPT_BY_NAME = new Map(DEPTS.map((d) => [d.name, d]))
export const deptSpec = (name: string): DeptSpec => DEPT_BY_NAME.get(name)!

/** The executive layer: CEO, C-suite and SVPs, and VPs. */
interface ExecSlot {
  key: string
  title: string
  level: Level
  dept: string
  site: string
  boss: string | null
  hire: string
}
export const EXEC_SLOTS: ExecSlot[] = [
  {
    key: 'ceo',
    title: 'Chief Executive Officer',
    level: 'E3',
    dept: 'Executive Office',
    site: 'San Jose',
    boss: null,
    hire: '2014-03-03',
  },
  {
    key: 'svp-se',
    title: 'Senior Vice President, Silicon Engineering',
    level: 'E2',
    dept: 'Architecture',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2014-04-14',
  },
  {
    key: 'vp-arch',
    title: 'Vice President, Architecture and Digital Design',
    level: 'E1',
    dept: 'Architecture',
    site: 'San Jose',
    boss: 'svp-se',
    hire: '2015-08-03',
  },
  {
    key: 'vp-verif',
    title: 'Vice President, Verification and DFT',
    level: 'E1',
    dept: 'Design Verification',
    site: 'San Jose',
    boss: 'svp-se',
    hire: '2017-02-06',
  },
  {
    key: 'vp-pd',
    title: 'Vice President, Physical Design and Analog',
    level: 'E1',
    dept: 'Physical Design',
    site: 'Austin',
    boss: 'svp-se',
    hire: '2016-05-02',
  },
  {
    key: 'svp-ss',
    title: 'Senior Vice President, Systems and Software',
    level: 'E2',
    dept: 'Software',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2016-01-11',
  },
  {
    key: 'vp-sw',
    title: 'Vice President, Software and Firmware',
    level: 'E1',
    dept: 'Software',
    site: 'Seattle',
    boss: 'svp-ss',
    hire: '2018-09-10',
  },
  {
    key: 'vp-sys',
    title: 'Vice President, Systems Engineering',
    level: 'E1',
    dept: 'Systems Validation',
    site: 'San Jose',
    boss: 'svp-ss',
    hire: '2024-06-03',
  },
  {
    key: 'coo',
    title: 'Chief Operating Officer',
    level: 'E3',
    dept: 'Test & Product Engineering',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2015-10-05',
  },
  {
    key: 'vp-test',
    title: 'Vice President, Test and Product Engineering',
    level: 'E1',
    dept: 'Test & Product Engineering',
    site: 'Hsinchu',
    boss: 'coo',
    hire: '2017-06-05',
  },
  {
    key: 'vp-scm',
    title: 'Vice President, Supply Chain and Quality',
    level: 'E1',
    dept: 'Supply Chain',
    site: 'San Jose',
    boss: 'coo',
    hire: '2019-03-04',
  },
  {
    key: 'cro',
    title: 'Chief Revenue Officer',
    level: 'E3',
    dept: 'Sales',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2019-01-07',
  },
  {
    key: 'vp-sales',
    title: 'Vice President, Worldwide Sales',
    level: 'E1',
    dept: 'Sales',
    site: 'San Jose',
    boss: 'cro',
    hire: '2020-02-03',
  },
  {
    key: 'vp-fae',
    title: 'Vice President, Field Applications',
    level: 'E1',
    dept: 'Field Applications',
    site: 'San Jose',
    boss: 'cro',
    hire: '2018-04-02',
  },
  {
    key: 'vp-pmm',
    title: 'Vice President, Product Marketing',
    level: 'E1',
    dept: 'Product Marketing',
    site: 'San Jose',
    boss: 'cro',
    hire: '2021-07-12',
  },
  {
    key: 'cfo',
    title: 'Chief Financial Officer',
    level: 'E3',
    dept: 'Finance',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2017-01-09',
  },
  {
    key: 'vp-fin',
    title: 'Vice President, Finance and Corporate Controller',
    level: 'E1',
    dept: 'Finance',
    site: 'San Jose',
    boss: 'cfo',
    hire: '2018-02-05',
  },
  {
    key: 'vp-it',
    title: 'Vice President, Information Technology',
    level: 'E1',
    dept: 'IT',
    site: 'San Jose',
    boss: 'cfo',
    hire: '2019-08-05',
  },
  {
    key: 'cpo',
    title: 'Chief People Officer',
    level: 'E2',
    dept: 'People',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2020-03-02',
  },
  {
    key: 'gc',
    title: 'General Counsel',
    level: 'E2',
    dept: 'Legal',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2018-06-04',
  },
]

const SITE_CODE: Record<string, string> = {
  'San Jose': 'SJC',
  Austin: 'AUS',
  Raleigh: 'RDU',
  Boulder: 'BLD',
  Seattle: 'SEA',
  Toronto: 'YYZ',
  Vancouver: 'YVR',
  Munich: 'MUC',
  Haifa: 'HFA',
  Bengaluru: 'BLR',
  Hsinchu: 'HSZ',
  Shanghai: 'SHA',
  'Ho Chi Minh City': 'SGN',
}
export const costCenter = (dept: string, site: string): string =>
  `${deptSpec(dept).costCenter}-${SITE_CODE[site]}`

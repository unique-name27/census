import { describe, expect, it } from 'vitest'
import { inferStructure } from '@/data/reference'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { layoutDiagram } from './diagram'
import {
  activeManagerIds,
  BLANK,
  employeesOnly,
  functionLevelCells,
  functionOrder,
  jobDiagram,
  jobRows,
  levelText,
  locationDiagram,
  locationRows,
  MAX_TITLES,
  OTHER_TITLES,
  orgDiagram,
  orgRows,
  titleRows,
} from './structure'
import { AS_OF, messyCompany } from './test-company'

const data = messyCompany()
const report = inferStructure(data, { asOf: AS_OF })
const emps = data.employees

describe('employeesOnly', () => {
  it('leaves out contractors and interns', () => {
    expect(employeesOnly([0, 3, 4], emps)).toEqual([0, 4])
  })
})

describe('orgDiagram', () => {
  const { spec, parts } = orgDiagram(report, emps)

  it('orders units by headcount with blanks last, departments under their main unit', () => {
    expect(spec.nodes.filter((n) => n.column === 0).map((n) => n.label)).toEqual([
      'Silicon',
      'Systems',
      BLANK.businessUnit,
    ])
    expect(spec.nodes.filter((n) => n.column === 1).map((n) => n.label)).toEqual([
      'Design Verification',
      'Firmware',
      'Facilities',
    ])
  })

  it('weights by active headcount and flags the conflicts', () => {
    const dv = spec.nodes.find((n) => n.id === 'd:Design Verification')!
    expect(dv.value).toBe(4)
    expect(dv.flag).toBe('warning')
    expect(spec.nodes.find((n) => n.id === 'u:')?.flag).toBe('warning')
    expect(spec.links.find((l) => l.id === 'u:Systems>d:Design Verification')?.flag).toBe('warning')
    expect(spec.links.find((l) => l.id === 'u:Silicon>d:Design Verification')?.flag).toBeNull()
  })

  it('keeps the employees behind every part for the drill', () => {
    expect(parts.get('d:Design Verification')?.rows).toEqual([0, 1, 2, 4])
    expect(parts.get('u:Silicon>d:Design Verification')?.rows).toEqual([0, 1, 2])
    expect(parts.get('d:Design Verification')?.flag).toMatch(/2 business units/)
    for (const [, p] of parts) expect(p.rows.length).toBe(p.headcount)
  })

  it('lays out without gaps in the data', () => {
    const layout = layoutDiagram(spec, { width: 480, measure: (t) => t.length * 6 })
    expect(layout.nodes).toHaveLength(6)
    expect(layout.links).toHaveLength(4)
  })
})

describe('orgRows', () => {
  const active = report.org.flatMap((e) => e.rows)
  const managers = activeManagerIds(emps, active)
  const rows = orgRows(report, emps, managers)

  it('lists each unit and department with its leader, managers and status', () => {
    const dv = rows.find((r) => r.businessUnit === 'Silicon' && r.department === 'Design Verification')!
    expect(dv.headcount).toBe(3)
    expect(dv.leader).toBe('Person 1')
    expect(dv.leaderLevel).toBe('E1')
    expect(dv.managers).toBe(1)
    expect(dv.managerRows).toEqual([0])
    expect(dv.status).toBe('Under several business units')
    const fac = rows.find((r) => r.department === 'Facilities')!
    expect(fac.businessUnit).toBe(BLANK.businessUnit)
    expect(fac.status).toBe('No business unit')
    expect(rows.find((r) => r.department === 'Firmware')?.flagged).toBe(false)
  })

  it('counts managers as people with an active direct report', () => {
    expect([...managers].sort()).toEqual(['E001', 'E006'])
  })
})

describe('locations', () => {
  it('runs location to country to region with unknown regions flagged', () => {
    const { spec, parts } = locationDiagram(report, emps)
    expect(spec.columns).toEqual(['Location', 'Country', 'Region'])
    expect(spec.nodes.filter((n) => n.column === 2).map((n) => n.label)).toEqual([
      'Americas',
      'APAC',
      BLANK.region,
    ])
    expect(spec.nodes.find((n) => n.id === 'r:')?.flag).toBe('warning')
    expect(parts.get('l:San Jose')?.headcount).toBe(4)
    expect(parts.get('c:India>r:APAC')?.rows).toEqual([5, 6])
  })

  it('has a table row per location and country', () => {
    const rows = locationRows(report, emps)
    expect(rows.find((r) => r.location === 'Atlantis')?.status).toBe('Region not known')
    expect(rows.find((r) => r.location === 'Bengaluru')?.region).toBe('APAC')
  })
})

describe('job architecture', () => {
  it('runs family to function with functions under several families flagged', () => {
    const { spec, parts } = jobDiagram(report, emps)
    expect(spec.columns).toEqual(['Job family', 'Job function'])
    expect(spec.nodes.filter((n) => n.column === 0).map((n) => n.label)).toEqual([
      'Silicon Engineering',
      'Operations',
      BLANK.jobFamily,
    ])
    expect(spec.nodes.find((n) => n.id === 'j:Firmware')?.flag).toBe('warning')
    expect(spec.nodes.find((n) => n.id === 'j:')?.label).toBe(BLANK.jobFunction)
    expect(parts.get('f:Silicon Engineering')?.headcount).toBe(5)
    expect(parts.get('j:Firmware')?.flag).toMatch(/2 job families/)
    // One of the two links is the minor placement.
    const minor = [...parts].filter(([id, p]) => id.endsWith('>j:Firmware') && p.flag)
    expect(minor.map(([, p]) => p.flag)).toEqual(['The job function sits mostly under another family.'])
  })

  it('adds the titles of one function, folding the smallest', () => {
    const { spec } = jobDiagram(report, emps, { value: 'Design Verification' })
    expect(spec.columns).toEqual(['Job family', 'Job function', 'Job title'])
    expect(spec.nodes.filter((n) => n.column === 1).map((n) => n.label)).toEqual(['Design Verification'])
    const titles = spec.nodes.filter((n) => n.column === 2)
    expect(titles.map((n) => n.label).sort()).toEqual(['Engineer', 'VP Silicon'])
    expect(titles.reduce((s, n) => s + n.value, 0)).toBe(4)
  })

  it('folds titles past the limit into one node', () => {
    const d = messyCompany()
    for (let i = 0; i < MAX_TITLES + 5; i++)
      d.employees.push({ ...d.employees[1], employeeId: `X${i}`, jobTitle: `Title ${i}` })
    const r = inferStructure(d, { asOf: AS_OF })
    const { spec } = jobDiagram(r, d.employees, { value: 'Design Verification' })
    const titles = spec.nodes.filter((n) => n.column === 2)
    expect(titles).toHaveLength(MAX_TITLES)
    expect(titles.at(-1)?.label).toMatch(new RegExp(`^${OTHER_TITLES} \\(\\d+\\)$`))
  })

  it('has job and title rows and a level grid in the diagram order', () => {
    expect(functionOrder(report)[0]).toBe('Design Verification')
    const jobs = jobRows(report, emps)
    expect(Object.keys(jobs[0]).slice(0, 2)).toEqual(['jobFamily', 'jobFunction'])
    expect(jobs.find((r) => r.jobFunction === 'Firmware' && r.jobFamily === 'Operations')?.status).toBe(
      'Under several families',
    )
    expect(jobs.find((r) => r.jobFunction === BLANK.jobFunction)?.status).toBe('No job function')
    const titles = titleRows(report, emps)
    expect(titles.find((t) => t.jobTitle === 'VP Silicon')?.levels).toBe('E1 1')
    const grid = functionLevelCells(report, emps)
    expect(grid.levels).toEqual(['L3', 'L4', 'E1'])
    expect(grid.functions[0]).toBe('Design Verification')
    expect(grid.cells.find((c) => c.jobFunction === 'Design Verification' && c.level === 'L4')?.rows).toEqual(
      [2],
    )
    // A function under two families is one row of the grid.
    expect(grid.cells.find((c) => c.jobFunction === 'Firmware' && c.level === 'L3')?.headcount).toBe(2)
  })

  it('writes levels in ladder order', () => {
    expect(levelText({ M1: 2, L3: 4 })).toBe('L3 4 · M1 2')
    expect(levelText({})).toBe('')
  })
})

describe('on the sample company', () => {
  const sample = generateSample()
  const r = inferStructure(sample, { asOf: SAMPLE_AS_OF })

  it('draws the six job families, Silicon Engineering first', () => {
    const { spec } = jobDiagram(r, sample.employees)
    expect(spec.nodes.filter((n) => n.column === 0).map((n) => n.label)).toEqual([
      'Silicon Engineering',
      'Systems & Software Engineering',
      'Corporate',
      'Go-to-Market',
      'Product & Test Operations',
      'Executive',
    ])
    expect(spec.nodes.filter((n) => n.column === 1)).toHaveLength(38)
    expect(spec.nodes.filter((n) => n.flag)).toEqual([])
  })

  it('every diagram adds up and lays out with finite numbers', () => {
    for (const { spec, parts } of [
      orgDiagram(r, sample.employees),
      locationDiagram(r, sample.employees),
      jobDiagram(r, sample.employees),
      jobDiagram(r, sample.employees, { value: 'Software' }),
    ]) {
      const cols = spec.columns.map((_, c) =>
        spec.nodes.filter((n) => n.column === c).reduce((s, n) => s + n.value, 0),
      )
      expect(new Set(cols).size).toBe(1)
      for (const [, p] of parts) expect(p.rows.length).toBe(p.headcount)
      const layout = layoutDiagram(spec, { width: 900, measure: (t) => t.length * 6.5 })
      for (const n of layout.nodes) expect(Number.isFinite(n.x + n.y + n.h)).toBe(true)
      for (const l of layout.links) expect(l.d).not.toMatch(/NaN/)
    }
  })

  it('shows the six business units and their departments', () => {
    const { spec } = orgDiagram(r, sample.employees)
    expect(spec.nodes.filter((n) => n.column === 0)).toHaveLength(6)
    expect(spec.nodes.find((n) => n.id === 'u:Silicon Engineering')?.value).toBe(556)
    const grid = functionLevelCells(r, sample.employees)
    expect(grid.cells.reduce((s, c) => s + c.headcount, 0)).toBe(1450)
    expect(grid.functions).toHaveLength(38)
  })
})

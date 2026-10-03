import { describe, expect, it } from 'vitest'
import {
  applyMapping,
  autoMap,
  type ImportIssue,
  readWorkbook,
  suggestOptions,
  summarizeValues,
  withChoice,
} from '@/data/import'
import { datasetDef, LEVELS } from '@/data/schema'
import {
  actionSeverity,
  blockingFields,
  cellText,
  effectiveValue,
  fixChoices,
  headerOptions,
  issueCounts,
  issuesFileStem,
  learnedPicks,
  openValueRows,
  openValues,
  orderedFields,
  PAY_HIDDEN_ISSUE,
  redactPayIssues,
  replacedMessage,
  sampleValues,
  textDateHeaders,
  unusedHeaders,
  valueFields,
} from './flow'
import { planSheets } from './plan'

const issue = (over: Partial<ImportIssue>): ImportIssue => ({
  row: 2,
  id: null,
  field: 'level',
  label: 'Level',
  value: 'x',
  code: 'unknown-value',
  issue: '"x" is not a recognized level.',
  action: 'left-blank',
  ...over,
})

describe('mapping table helpers', () => {
  it('orders required, then recommended, then optional fields', () => {
    const fields = orderedFields(datasetDef('employees')).map((f) => f.key)
    expect(fields.slice(0, 2)).toEqual(['employeeId', 'hireDate'])
    expect(fields.indexOf('name')).toBeLessThan(fields.indexOf('jobTitle'))
    expect(fields).toHaveLength(datasetDef('employees').fields.length)
  })

  it('shows cells as short text', () => {
    expect(cellText(new Date(Date.UTC(2026, 2, 4)))).toBe('2026-03-04')
    expect(cellText(new Date(Date.UTC(2026, 2, 4, 9, 30)))).toBe('2026-03-04 09:30')
    expect(cellText(12.5)).toBe('12.5')
    expect(cellText(Number.NaN)).toBe('')
    expect(cellText(true)).toBe('Yes')
    expect(cellText('  a ')).toBe('a')
    expect(cellText(null)).toBe('')
  })

  it('takes three distinct non-blank sample values in file order', () => {
    const rows = [{ h: null }, { h: 'b' }, { h: 'b' }, { h: '' }, { h: 'a' }, { h: 'c' }, { h: 'd' }]
    expect(sampleValues({ rows }, 'h')).toEqual(['b', 'a', 'c'])
    expect(sampleValues({ rows: [] }, 'h')).toEqual([])
  })

  it('ranks likely columns first and says which field already uses a column', () => {
    const def = datasetDef('employees')
    const headers = ['Worker ID', 'Name', 'Badge']
    const mapping = autoMap(headers, [{ 'Worker ID': 'E1', Name: 'Ann Lee', Badge: 'x' }], def)
    const opts = headerOptions(
      def,
      headers,
      [{ header: 'Worker ID', score: 0.9, confidence: 'high', reason: '' }],
      mapping,
      'name',
    )
    expect(opts.suggested).toEqual([{ header: 'Worker ID', score: 0.9, usedBy: 'Employee ID' }])
    expect(opts.others.map((o) => o.header)).toEqual(['Name', 'Badge'])
    expect(opts.others[0].usedBy).toBeNull()
    expect(unusedHeaders(headers, mapping)).toEqual(['Badge'])
  })

  it('asks for a day order only for slashed dates typed as text', () => {
    const rows = [
      { a: '03/04/2026', b: new Date(Date.UTC(2026, 3, 3)), c: '2026-04-03', d: null },
      { a: '04/05/2026', b: null, c: '2026-05-04', d: '5.4.2026' },
    ]
    const guess = { order: 'MDY' as const, certain: false }
    expect(textDateHeaders({ rows }, { a: guess, b: guess, c: guess, d: guess })).toEqual(['a', 'd'])
  })

  it('finds required fields that block the import, using the importer itself', () => {
    const def = datasetDef('employees')
    const sheet = { name: 'S', headerRow: 0, headers: ['Name'], rows: [{ Name: 'A' }], rowNumbers: [2] }
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    expect(blockingFields(applyMapping, sheet, def, mapping)).toEqual(['employeeId', 'hireDate'])
    // Candidates can derive their application ID, stage and status, so those never block.
    const cand = datasetDef('candidates')
    const cs = { name: 'S', headerRow: 0, headers: ['Name', 'Req'], rows: [], rowNumbers: [] }
    const cm = withChoice(withChoice(autoMap(cs.headers, [], cand), 'candidateName', 'Name'), 'reqId', 'Req')
    expect(blockingFields(applyMapping, cs, cand, cm)).toEqual(['appliedDate'])
  })
})

describe('value grid helpers', () => {
  it('lists mapped list, level and yes/no fields', () => {
    const def = datasetDef('employees')
    const headers = ['Employee ID', 'Level', 'Regrettable', 'Termination type']
    const mapping = autoMap(headers, [], def)
    expect(valueFields(def, mapping).map((f) => f.key)).toEqual(['level', 'terminationType', 'regrettable'])
  })

  it('offers fixes for lists and levels, not for yes/no', () => {
    const def = datasetDef('employees')
    const f = (k: string) => def.fields.find((x) => x.key === k)!
    expect(fixChoices(f('terminationType'))).toEqual(['Voluntary', 'Involuntary'])
    expect(fixChoices(f('level'))).toBe(LEVELS)
    expect(fixChoices(f('regrettable'))).toBeNull()
  })

  it('applies fixes and counts what is still open', () => {
    const s = [
      { raw: 'FTE', key: 'fte', count: 6, value: 'Employee', recognized: true },
      { raw: 'Contractr', key: 'contractr', count: 2, value: null, recognized: false },
      { raw: '??', key: '??', count: 1, value: null, recognized: false },
    ]
    expect(openValues(s, undefined)).toBe(2)
    expect(openValueRows(s, undefined)).toBe(3)
    const fixes = { contractr: 'Contractor', '??': null }
    expect(effectiveValue(s[1], fixes)).toEqual({ value: 'Contractor', fixed: true, open: false })
    expect(effectiveValue(s[2], fixes)).toEqual({ value: null, fixed: true, open: false })
    expect(effectiveValue(s[0], fixes)).toEqual({ value: 'Employee', fixed: false, open: false })
    expect(openValues(s, fixes)).toBe(0)
  })
})

describe('validation summary helpers', () => {
  it('counts issues by action and distinct rows', () => {
    const c = issueCounts([
      issue({ row: 2, action: 'left-blank' }),
      issue({ row: 2, action: 'defaulted', code: 'defaulted' }),
      issue({ row: 5, action: 'row-skipped', code: 'missing-required' }),
      issue({ row: 0, action: 'defaulted', code: 'defaulted' }),
    ])
    expect(c.total).toBe(4)
    expect(c.rows).toBe(2)
    expect(c.byAction).toEqual({
      'row-skipped': 1,
      'left-blank': 1,
      cleared: 0,
      defaulted: 2,
      converted: 0,
      kept: 0,
    })
    expect(issueCounts([]).total).toBe(0)
  })

  it('grades actions and words the apply toast', () => {
    expect(actionSeverity('row-skipped')).toBe('critical')
    expect(actionSeverity('cleared')).toBe('warning')
    expect(actionSeverity('converted')).toBe('info')
    expect(replacedMessage('Employees', 1912)).toBe('Employees replaced: 1,912 rows')
    expect(replacedMessage('Succession plans', 1)).toBe('Succession plans replaced: 1 row')
  })

  it('names the issues file from the dataset and sheet', () => {
    expect(issuesFileStem('Employees', 'Roster (EMEA)')).toBe('census-import-issues-employees-roster-emea')
    expect(issuesFileStem('Employees', 'Employees')).toBe('census-import-issues-employees')
  })

  it('remembers only the columns the person picked', () => {
    const def = datasetDef('employees')
    let m = autoMap(['Worker', 'Start'], [], def)
    m = withChoice(m, 'hireDate', 'Start')
    expect(learnedPicks(m, ['hireDate', 'level'])).toEqual([{ field: 'hireDate', header: 'Start' }])
  })

  it('hides the values and wording of pay issues unless pay amounts are on', () => {
    const def = datasetDef('comp')
    const issues = [
      issue({
        field: 'baseSalary',
        label: 'Base salary',
        value: '98,000x',
        issue: '"98,000x" is not a number.',
      }),
      issue({ field: 'currency', label: 'Currency', value: 'ZZZ', issue: '"ZZZ" is not a currency.' }),
    ]
    const hidden = redactPayIssues(issues, def, false)
    expect(hidden[0]).toMatchObject({ value: '', issue: PAY_HIDDEN_ISSUE })
    expect(hidden[1]).toEqual(issues[1])
    expect(redactPayIssues(issues, def, true)).toEqual(issues)
  })
})

describe('a messy roster export through the whole flow', () => {
  const csv = [
    'Worker ID,Full Name,Dept,Site,Grade,Start Date,Exit Date,Exit Type,Worker Type,Reports To',
    '1001,Ana Ruiz,Finance,San Jose,Director,03/04/2015,,,FTE,',
    '1002,Ben Ode,Finance,San Jose,Senior,25/03/2019,,,FTE,Ana Ruiz',
    '1003,Cy Park,Finance,Austin,Lvl 9,14/02/2020,30/06/2025,Resigned,FTE,1001',
    '1004,Di Lu,IT,Austin,Staff,01/09/2021,,,Contractr,1001',
    ',No Id,IT,Austin,Staff,01/09/2021,,,FTE,1002',
    '1002,Ben Ode,Finance,San Jose,Senior,25/03/2019,,,FTE,Ana Ruiz',
  ].join('\n')

  it('detects, maps, asks about values, and imports with a precise log', async () => {
    const book = readWorkbook(new TextEncoder().encode(csv), 'roster.csv')
    const { guessDataset } = await import('@/data/import')
    const sheet = book.sheets[0]
    const plan = planSheets([
      {
        fileName: book.fileName,
        sheets: [{ sheetName: sheet.name, rows: sheet.rows.length, guesses: guessDataset(sheet) }],
      },
    ])
    expect(plan[0].dataset).toBe('employees')

    const def = datasetDef('employees')
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    expect(mapping.employeeId.header).toBe('Worker ID')
    expect(mapping.managerId.header).toBe('Reports To')

    const suggested = suggestOptions(sheet, def, mapping)
    expect(textDateHeaders(sheet, suggested.dateOrders).sort()).toEqual(['Exit Date', 'Start Date'])
    expect(suggested.dateOrders['Start Date']).toEqual({ order: 'DMY', certain: true })

    const grid = valueFields(def, mapping).map((f) => ({
      key: f.key,
      values: summarizeValues(sheet, mapping[f.key].header!, def, f.key),
    }))
    const open = Object.fromEntries(grid.map((g) => [g.key, openValues(g.values, undefined)]))
    expect(open).toEqual({ level: 1, terminationType: 0, employmentType: 1 })

    const valueMaps = { employmentType: { contractr: 'Contractor' }, level: { 'lvl 9': 'L5' } }
    const fixed = grid.map((g) => openValues(g.values, valueMaps[g.key as keyof typeof valueMaps]))
    expect(fixed).toEqual([0, 0, 0])

    const result = applyMapping<'employees'>({ sheet, def, mapping, options: { valueMaps } })
    expect(result.stats).toMatchObject({ rowsIn: 6, rowsOut: 4, skippedMissingRequired: 1, duplicates: 1 })
    const rows = Object.fromEntries(result.rows.map((r) => [r.employeeId, r]))
    expect(rows['1001'].hireDate).toBe('2015-04-03')
    expect(rows['1003']).toMatchObject({
      level: 'L5',
      terminationDate: '2025-06-30',
      terminationType: 'Voluntary',
    })
    expect(rows['1004'].employmentType).toBe('Contractor')
    expect(rows['1002'].managerId).toBe('1001')
    const counts = issueCounts(result.issues)
    expect(counts.byAction['row-skipped']).toBe(2)
    expect(counts.byAction['left-blank']).toBe(0)
  })
})

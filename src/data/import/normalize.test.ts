import { describe, expect, it } from 'vitest'
import { datasetDef } from '../schema'
import { canonicalText, normalizeCurrency } from './canonical'
import { readDate } from './dates'
import {
  coerceBoolean,
  coerceDate,
  coerceDateTime,
  coerceId,
  coerceLevel,
  coerceMoney,
  coerceNumber,
  coercePercent,
  coerceRating,
  coerceValue,
  detectDateOrder,
  detectPercentWhole,
} from './normalize'
import { normalizeEnumValue, normalizeLevel } from './vocab'

const enumOf = (dataset: Parameters<typeof datasetDef>[0], field: string, raw: string) => {
  const f = datasetDef(dataset).fields.find((x) => x.key === field)!
  return normalizeEnumValue(dataset, field, f.values ?? [], raw)
}

describe('dates', () => {
  it('reads ISO, compact, slashed year-first and named-month dates', () => {
    expect(coerceDate('2026-09-30').value).toBe('2026-09-30')
    expect(coerceDate('2026-9-3').value).toBe('2026-09-03')
    expect(coerceDate('2026/09/30').value).toBe('2026-09-30')
    expect(coerceDate('20260930').value).toBe('2026-09-30')
    expect(coerceDate(20260930).value).toBe('2026-09-30')
    expect(coerceDate('30-Sep-2026').value).toBe('2026-09-30')
    expect(coerceDate('1-Mar-26').value).toBe('2026-03-01')
    expect(coerceDate('30 September 2026').value).toBe('2026-09-30')
    expect(coerceDate('Sep 30, 2026').value).toBe('2026-09-30')
    expect(coerceDate('Tue, 30 Sep 2026').value).toBe('2026-09-30')
  })

  it('never shifts a date by a time zone', () => {
    expect(coerceDate('2026-09-30T23:30:00Z').value).toBe('2026-09-30')
    expect(coerceDate('2026-09-30T00:30:00+05:30').value).toBe('2026-09-30')
    expect(coerceDate(new Date(Date.UTC(2026, 8, 30))).value).toBe('2026-09-30')
    // Spreadsheet float noise just before midnight rounds to the intended day.
    expect(coerceDate(new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999))).value).toBe('2026-10-01')
  })

  it('reads Excel serial numbers, including the 1900 leap-year quirk', () => {
    expect(coerceDate(46295).value).toBe('2026-09-30')
    expect(coerceDate('46295').value).toBe('2026-09-30')
    expect(coerceDate(45658.5).value).toBe('2025-01-01')
    expect(readDate(44927)).toEqual({ ok: true, parts: { y: 2023, m: 1, d: 1, hh: 0, mi: 0 } })
    // Serials from the early 1900s are numbers mapped by mistake, not HR dates.
    expect(readDate(61)).toEqual({ ok: false, reason: 'out-of-range' })
    expect(readDate(1)).toEqual({ ok: false, reason: 'out-of-range' })
    expect(coerceDate(5).code).toBe('out-of-range')
    expect(coerceDate(90000).code).toBe('unreadable')
  })

  it('applies the column day order only to ambiguous slashed dates', () => {
    expect(coerceDate('03/04/2026', 'MDY').value).toBe('2026-03-04')
    expect(coerceDate('03/04/2026', 'DMY').value).toBe('2026-04-03')
    expect(coerceDate('14/03/2026', 'MDY').value).toBe('2026-03-14')
    expect(coerceDate('03/14/2026', 'DMY').value).toBe('2026-03-14')
    expect(coerceDate('30.09.2026', 'DMY').value).toBe('2026-09-30')
    expect(coerceDate('3/4/26', 'MDY').value).toBe('2026-03-04')
  })

  it('detects the day order of a column', () => {
    expect(detectDateOrder(['03/04/2026', '14/03/2026', '01/02/2026'])).toEqual({
      order: 'DMY',
      certain: true,
    })
    expect(detectDateOrder(['03/04/2026', '03/14/2026'])).toEqual({ order: 'MDY', certain: true })
    expect(detectDateOrder(['03/04/2026', '01/02/2026'])).toEqual({ order: 'MDY', certain: false })
    expect(detectDateOrder(['03.04.2026', '01.02.2026'])).toEqual({ order: 'DMY', certain: false })
    expect(detectDateOrder([new Date(), 46295, null])).toEqual({ order: 'MDY', certain: false })
  })

  it('reports values that are not dates', () => {
    expect(coerceDate('soon')).toEqual({ value: null, issue: '"soon" is not a date.', code: 'unreadable' })
    expect(coerceDate('2026-02-30').code).toBe('unreadable')
    expect(coerceDate('13/13/2026').code).toBe('unreadable')
    expect(coerceDate('1890-01-01').code).toBe('out-of-range')
    expect(coerceDate('N/A')).toEqual({ value: null })
    expect(coerceDate('  ')).toEqual({ value: null })
  })

  it('reads date-times to the minute', () => {
    expect(coerceDateTime('2026-09-30 14:05').value).toBe('2026-09-30T14:05')
    expect(coerceDateTime('2026-09-30T14:05:59').value).toBe('2026-09-30T14:05')
    expect(coerceDateTime('9/30/2026 2:05 PM').value).toBe('2026-09-30T14:05')
    expect(coerceDateTime('9/30/2026 12:10 am').value).toBe('2026-09-30T00:10')
    expect(coerceDateTime('2026-09-30').value).toBe('2026-09-30T00:00')
    expect(coerceDateTime(new Date(Date.UTC(2026, 8, 30, 14, 4, 59, 999))).value).toBe('2026-09-30T14:05')
    expect(coerceDateTime(46295.25).value).toBe('2026-09-30T06:00')
  })
})

describe('numbers', () => {
  it('strips currency, separators and codes', () => {
    expect(coerceNumber('$120,000').value).toBe(120000)
    expect(coerceNumber('€1.234,56').value).toBe(1234.56)
    expect(coerceNumber('1 234 567').value).toBe(1234567)
    expect(coerceNumber("1'234").value).toBe(1234)
    expect(coerceNumber('USD 95,000').value).toBe(95000)
    expect(coerceNumber('95000USD').value).toBe(95000)
    expect(coerceNumber('₹9,80,000').value).toBe(980000)
    expect(coerceNumber('1,23,45,678').value).toBe(12345678)
    expect(coerceNumber('NT$ 1,200,000').value).toBe(1200000)
    expect(coerceNumber('12,5').value).toBe(12.5)
    expect(coerceNumber('(1,234)').value).toBe(-1234)
    expect(coerceNumber('-42').value).toBe(-42)
    expect(coerceNumber('1e3').value).toBe(1000)
    expect(coerceNumber(7).value).toBe(7)
  })

  it('reads k and m suffixes on amounts only', () => {
    expect(coerceMoney('120k').value).toBe(120000)
    expect(coerceMoney('1.2M').value).toBe(1200000)
    expect(coerceMoney('$85K').value).toBe(85000)
    expect(coerceNumber('120k').code).toBe('unreadable')
  })

  it('treats placeholders as blank and words as unreadable', () => {
    expect(coerceNumber('-')).toEqual({ value: null })
    expect(coerceNumber('n/a')).toEqual({ value: null })
    expect(coerceNumber('lots').issue).toBe('"lots" is not a number.')
    expect(coerceMoney('lots').issue).toBe('"lots" is not an amount.')
    expect(coerceNumber(true).code).toBe('unreadable')
  })

  it('reads percentages as fractions', () => {
    expect(coercePercent('3.5%', false).value).toBeCloseTo(0.035)
    expect(coercePercent('3.5%', true).value).toBeCloseTo(0.035)
    expect(coercePercent(0.035, false).value).toBe(0.035)
    expect(coercePercent(3.5, true).value).toBeCloseTo(0.035)
    expect(coercePercent('12', true).value).toBeCloseTo(0.12)
  })

  it('detects whole-number percent columns by the median', () => {
    expect(detectPercentWhole([3, 3.5, 4, 0, 5])).toBe(true)
    expect(detectPercentWhole([0.03, 0.035, 0.04])).toBe(false)
    expect(detectPercentWhole([0.8, 1.1, 1.4])).toBe(false)
    expect(detectPercentWhole(['3%', '4%'])).toBe(false)
    expect(detectPercentWhole([])).toBe(false)
  })
})

describe('booleans', () => {
  it('reads yes and no in their common spellings', () => {
    for (const v of [
      'Yes',
      'y',
      'TRUE',
      '1',
      'x',
      'X',
      '✓',
      'Regretted',
      'Regrettable',
      'Mandatory',
      true,
      1,
      2,
    ])
      expect(coerceBoolean(v).value, String(v)).toBe(true)
    for (const v of [
      'No',
      'n',
      'false',
      '0',
      'Non-regretted',
      'Not regretted',
      'non regrettable',
      'Unregretted',
      'Optional',
      false,
      0,
    ])
      expect(coerceBoolean(v).value, String(v)).toBe(false)
    expect(coerceBoolean('')).toEqual({ value: null })
    expect(coerceBoolean(null)).toEqual({ value: null })
    expect(coerceBoolean('maybe').code).toBe('unknown-value')
  })
})

describe('levels', () => {
  const table: [unknown, string | null][] = [
    ['L1', 'L1'],
    ['l 4', 'L4'],
    ['L-6', 'L6'],
    ['M1', 'M1'],
    ['M2 Director', 'M2'],
    ['E3', 'E3'],
    ['L4 Senior', 'L4'],
    ['E1 Vice president', 'E1'],
    ['IC1', 'L1'],
    ['IC6', 'L6'],
    ['P3', 'L3'],
    ['T5', 'L5'],
    ['Level 2', 'L2'],
    [3, 'L3'],
    ['5', 'L5'],
    ['Junior', 'L1'],
    ['Entry', 'L1'],
    ['Associate', 'L1'],
    ['Intern', 'L1'],
    ['Senior', 'L4'],
    ['Sr.', 'L4'],
    ['Staff', 'L5'],
    ['Senior Staff', 'L5'],
    ['Principal', 'L6'],
    ['Distinguished Engineer', 'L6'],
    ['Fellow', 'L6'],
    ['Manager', 'M1'],
    ['Senior Manager', 'M1'],
    ['6 Manager', 'M1'],
    ['Director', 'M2'],
    ['Sr Director', 'M2'],
    ['Associate Director', 'M2'],
    ['VP', 'E1'],
    ['Vice President', 'E1'],
    ['SVP', 'E2'],
    ['EVP', 'E2'],
    ['Senior Vice President', 'E2'],
    ['CEO', 'E3'],
    ['CFO', 'E3'],
    ['COO', 'E3'],
    ['CTO', 'E3'],
    ['C-suite', 'E3'],
    ['Chief People Officer', 'E3'],
    ['Executive', 'E3'],
    ['M3', null],
    ['L7', null],
    [7, null],
    ['Individual contributor', null],
    ['Technician 2', null],
    ['', null],
  ]
  it.each(table)('%s → %s', (raw, expected) => {
    expect(normalizeLevel(raw)).toBe(expected)
  })
  it('reports unknown levels instead of guessing', () => {
    expect(coerceLevel('Wizard')).toEqual({
      value: null,
      issue: '"Wizard" is not a recognized level (L1-L6, M1-M2, E1-E3).',
      code: 'unknown-value',
    })
  })
})

describe('ratings', () => {
  it('reads numbers and rating labels', () => {
    expect(coerceRating(4).value).toBe(4)
    expect(coerceRating('3.5').value).toBe(3.5)
    expect(coerceRating('3,5').value).toBe(3.5)
    expect(coerceRating('4 - Exceeds').value).toBe(4)
    expect(coerceRating('Far exceeds').value).toBe(5)
    expect(coerceRating('Outstanding').value).toBe(5)
    expect(coerceRating('Exceeds expectations').value).toBe(4)
    expect(coerceRating('Meets').value).toBe(3)
    expect(coerceRating('Fully meets expectations').value).toBe(3)
    expect(coerceRating('Partially meets').value).toBe(2)
    expect(coerceRating('Below expectations').value).toBe(2)
    expect(coerceRating('Does not meet').value).toBe(1)
    expect(coerceRating(7).code).toBe('out-of-range')
    expect(coerceRating('Great').code).toBe('unknown-value')
  })
})

describe('enums', () => {
  it('checks involuntary before voluntary for termination type', () => {
    expect(enumOf('employees', 'terminationType', 'Involuntary')).toBe('Involuntary')
    expect(enumOf('employees', 'terminationType', 'invol')).toBe('Involuntary')
    expect(enumOf('employees', 'terminationType', 'Terminated')).toBe('Involuntary')
    expect(enumOf('employees', 'terminationType', 'Layoff')).toBe('Involuntary')
    expect(enumOf('employees', 'terminationType', 'RIF')).toBe('Involuntary')
    expect(enumOf('employees', 'terminationType', 'Terminate Employee > Involuntary > Performance')).toBe(
      'Involuntary',
    )
    expect(enumOf('employees', 'terminationType', 'Terminate Employee > Voluntary > Resignation')).toBe(
      'Voluntary',
    )
    expect(enumOf('employees', 'terminationType', 'Resigned')).toBe('Voluntary')
    expect(enumOf('employees', 'terminationType', 'Vol')).toBe('Voluntary')
    expect(enumOf('employees', 'terminationType', 'Retirement')).toBe('Voluntary')
    expect(enumOf('employees', 'terminationType', 'Deceased')).toBe(null)
  })

  it('normalizes employment types, contractor words before employee words', () => {
    for (const v of ['FTE', 'Regular', 'Full-time', 'Part time', 'Permanent', 'Employee', 'Salaried'])
      expect(enumOf('employees', 'employmentType', v), v).toBe('Employee')
    for (const v of [
      'Contractor',
      'Contingent worker',
      'Temp',
      'Temporary',
      'Consultant',
      'Vendor',
      'Contract employee',
    ])
      expect(enumOf('employees', 'employmentType', v), v).toBe('Contractor')
    for (const v of ['Intern', 'Co-op', 'Student', 'Apprentice', 'Summer intern'])
      expect(enumOf('employees', 'employmentType', v), v).toBe('Intern')
    expect(enumOf('employees', 'employmentType', 'Seasonal')).toBe(null)
  })

  it('applies the candidate status keyword priority', () => {
    const s = (v: string) => enumOf('candidates', 'status', v)
    expect(s('Hired')).toBe('Hired')
    expect(s('Offer accepted')).toBe('Hired')
    expect(s('Converted')).toBe('Hired')
    expect(s('Offer declined')).toBe('Declined')
    expect(s('Accepted another offer')).toBe('Declined')
    expect(s('Withdrew')).toBe('Withdrawn')
    expect(s('Candidate withdrew - not interested')).toBe('Withdrawn')
    expect(s('Rejected')).toBe('Rejected')
    expect(s('Archived')).toBe('Rejected')
    expect(s('Not selected')).toBe('Rejected')
    expect(s('Declined by company')).toBe('Rejected')
    expect(s('In process')).toBe('Active')
    expect(s('Active')).toBe('Active')
    expect(s('Not hired')).toBe(null)
    expect(s('Blue')).toBe(null)
  })

  it('maps stage names to the six canonical stages', () => {
    const st = (v: string) => enumOf('candidates', 'currentStage', v)
    expect(st('Application Review')).toBe('Applied')
    expect(st('New')).toBe('Applied')
    expect(st('Phone Screen')).toBe('Screen')
    expect(st('Recruiter Screen')).toBe('Screen')
    expect(st('HR screen')).toBe('Screen')
    expect(st('HM Screen')).toBe('Hiring manager')
    expect(st('Hiring Manager Interview')).toBe('Hiring manager')
    expect(st('Technical Screen')).toBe('Hiring manager')
    expect(st('Onsite')).toBe('Onsite')
    expect(st('Panel Interview')).toBe('Onsite')
    expect(st('Final Round')).toBe('Onsite')
    expect(st('Interview loop')).toBe('Onsite')
    expect(st('Face to Face')).toBe('Onsite')
    expect(st('Offer Extended')).toBe('Offer')
    expect(st('Offer')).toBe('Offer')
    expect(st('Hired')).toBe('Hired')
    expect(st('Accepted')).toBe('Hired')
    expect(st('Start')).toBe('Hired')
    expect(st('Background check pending xyz')).toBe(null)
  })

  it('normalizes requisition fields', () => {
    expect(enumOf('requisitions', 'status', 'Approved')).toBe('Open')
    expect(enumOf('requisitions', 'status', 'Sourcing')).toBe('Open')
    expect(enumOf('requisitions', 'status', 'Paused')).toBe('On hold')
    expect(enumOf('requisitions', 'status', 'Closed - Filled')).toBe('Filled')
    expect(enumOf('requisitions', 'status', 'Closed')).toBe('Cancelled')
    expect(enumOf('requisitions', 'status', 'Canceled')).toBe('Cancelled')
    expect(enumOf('requisitions', 'status', 'Draft')).toBe(null)
    expect(enumOf('requisitions', 'reqType', 'Replacement')).toBe('Backfill')
    expect(enumOf('requisitions', 'reqType', 'Net new')).toBe('New')
    expect(enumOf('requisitions', 'priority', 'Urgent')).toBe('Critical')
    expect(enumOf('requisitions', 'priority', 'Normal')).toBe('Standard')
  })

  it('normalizes service fields', () => {
    expect(enumOf('cases', 'status', 'Work in progress')).toBe('In progress')
    expect(enumOf('cases', 'status', 'Awaiting employee')).toBe('Waiting on employee')
    expect(enumOf('cases', 'status', 'On hold')).toBe('Waiting on employee')
    expect(enumOf('cases', 'status', 'Pending vendor')).toBe('Waiting on third party')
    expect(enumOf('cases', 'status', 'Closed Complete')).toBe('Closed')
    expect(enumOf('cases', 'status', 'Solved')).toBe('Resolved')
    expect(enumOf('cases', 'priority', '1 - Critical')).toBe('P1')
    expect(enumOf('cases', 'priority', 'Low')).toBe('P4')
    expect(enumOf('cases', 'tier', 'T2')).toBe('Tier 2')
    expect(enumOf('cases', 'tier', 'Self-service')).toBe('Tier 0')
    expect(enumOf('transactions', 'type', 'Hire')).toBe('New hire')
    expect(enumOf('transactions', 'type', 'Terminate Employee')).toBe('Termination')
    expect(enumOf('transactions', 'type', 'Request Compensation Change')).toBe('Compensation change')
    expect(enumOf('transactions', 'type', 'Return from Leave of Absence')).toBe('Return from leave')
    expect(enumOf('transactions', 'type', 'Leave of Absence')).toBe('Leave start')
    expect(enumOf('transactions', 'type', 'Change Job')).toBe('Job change')
    expect(enumOf('transactions', 'type', 'Change Personal Information')).toBe('Personal data change')
  })

  it('normalizes talent fields and job changes', () => {
    expect(enumOf('reviews', 'potential', 'Medium')).toBe('Moderate')
    expect(enumOf('reviews', 'potential', 'HiPo')).toBe('High')
    expect(enumOf('succession', 'readiness', 'Ready now')).toBe('Ready now')
    expect(enumOf('succession', 'readiness', '1-2 years')).toBe('Ready in 1-2 years')
    expect(enumOf('succession', 'readiness', '3+ years')).toBe('Ready in 3+ years')
    expect(enumOf('succession', 'readiness', 'Long term')).toBe('Ready in 3+ years')
    expect(enumOf('succession', 'criticality', 'Mission critical')).toBe('Critical')
    expect(enumOf('succession', 'incumbentRiskOfLoss', 'Med')).toBe('Medium')
    expect(enumOf('jobChanges', 'changeType', 'Promoted')).toBe('Promotion')
    expect(enumOf('jobChanges', 'changeType', 'Lateral transfer')).toBe('Lateral move')
    expect(enumOf('jobChanges', 'changeType', 'Supervisor change')).toBe('Manager change')
    expect(enumOf('jobChanges', 'changeType', 'Department change')).toBe('Transfer')
  })

  it('reports unknown values with the allowed list', () => {
    const f = datasetDef('requisitions').fields.find((x) => x.key === 'status')!
    expect(coerceValue('requisitions', f, 'Draft', { dateOrder: 'MDY', percentWhole: false })).toEqual({
      value: null,
      issue: '"Draft" is not a recognized status (Open, On hold, Filled, Cancelled).',
      code: 'unknown-value',
    })
  })

  it('uses manual value corrections first', () => {
    const f = datasetDef('candidates').fields.find((x) => x.key === 'currentStage')!
    const col = {
      dateOrder: 'MDY' as const,
      percentWhole: false,
      valueMap: { 'background check': 'Offer', 'talent pool': null },
    }
    expect(coerceValue('candidates', f, 'Background Check', col).value).toBe('Offer')
    expect(coerceValue('candidates', f, 'Talent pool', col)).toEqual({ value: null })
  })

  it('reads manual corrections through the field type, not as raw text', () => {
    const field = (ds: Parameters<typeof datasetDef>[0], key: string) =>
      datasetDef(ds).fields.find((x) => x.key === key)!
    const col = (valueMap: Record<string, string | null>) => ({
      dateOrder: 'MDY' as const,
      percentWhole: false,
      valueMap,
    })
    // yes/no
    const regrettable = field('employees', 'regrettable')
    const yesNo = col({ 'key talent': 'Yes', 'not key': 'No', 'maybe later': 'false' })
    expect(coerceValue('employees', regrettable, 'Key talent', yesNo)).toEqual({ value: true })
    expect(coerceValue('employees', regrettable, 'Not key', yesNo)).toEqual({ value: false })
    expect(coerceValue('employees', regrettable, 'Maybe later', yesNo)).toEqual({ value: false })
    // numbers (and ratings, which accept labels)
    const openings = field('requisitions', 'openings')
    expect(coerceValue('requisitions', openings, 'a few', col({ 'a few': '3' }))).toEqual({ value: 3 })
    const rating = field('reviews', 'rating')
    expect(coerceValue('reviews', rating, 'Star', col({ star: '5 - Far exceeds' }))).toEqual({ value: 5 })
    // levels and enums in their canonical spelling
    const level = field('employees', 'level')
    expect(coerceValue('employees', level, 'Band 4', col({ 'band 4': 'l4' })).value).toBe('L4')
    const stage = field('candidates', 'currentStage')
    expect(coerceValue('candidates', stage, 'BG check', col({ 'bg check': 'offer' })).value).toBe('Offer')
    expect(coerceValue('candidates', stage, 'Pool', col({ pool: 'Phone screen' })).value).toBe('Screen')
    // blanks stay blank; a correction the field can't read is reported, never stored as text
    expect(coerceValue('employees', level, 'TBD', col({ tbd: null }))).toEqual({ value: null })
    expect(coerceValue('employees', level, 'TBD', col({ tbd: '' }))).toEqual({ value: null })
    const bad = coerceValue('employees', level, 'TBD', col({ tbd: 'Wizard' }))
    expect(bad.value).toBeNull()
    expect(bad.code).toBe('unknown-value')
    expect(bad.issue).toMatch(/^Your correction "Wizard" is not a recognized level/)
  })
})

describe('text fields with vocabularies', () => {
  it('canonicalizes known sites, categories, channels and currencies', () => {
    expect(canonicalText('employees', 'location', 'bangalore')).toBe('Bengaluru')
    expect(canonicalText('employees', 'location', 'San Jose, CA')).toBe('San Jose')
    expect(canonicalText('employees', 'location', 'Saigon')).toBe('Ho Chi Minh City')
    expect(canonicalText('employees', 'location', 'Phoenix')).toBe(null)
    expect(canonicalText('cases', 'category', 'payroll')).toBe('Payroll')
    expect(canonicalText('cases', 'category', 'Benefits enrollment')).toBe('Benefits')
    expect(canonicalText('cases', 'category', 'Employee benefits')).toBe('Benefits')
    expect(canonicalText('cases', 'category', 'Leave of absence')).toBe('Leave & accommodation')
    expect(canonicalText('cases', 'category', 'HR Data and Records')).toBe('HR data & records')
    expect(canonicalText('cases', 'category', 'Time off')).toBe(null)
    expect(canonicalText('cases', 'channel', 'e-mail')).toBe('Email')
    expect(canonicalText('candidates', 'source', 'Employee Referral')).toBe('Referral')
    expect(canonicalText('candidates', 'source', 'LinkedIn')).toBe(null)
    expect(normalizeCurrency('$')).toBe('USD')
    expect(normalizeCurrency('eur')).toBe('EUR')
    expect(normalizeCurrency('NT$')).toBe('TWD')
    expect(normalizeCurrency('Euro')).toBe('EUR')
    expect(normalizeCurrency('dollars please')).toBe(null)
  })

  it('keeps unknown text as written', () => {
    const f = datasetDef('employees').fields.find((x) => x.key === 'location')!
    expect(coerceValue('employees', f, '  Phoenix  ', { dateOrder: 'MDY', percentWhole: false }).value).toBe(
      'Phoenix',
    )
    expect(coerceValue('employees', f, 'bangalore', { dateOrder: 'MDY', percentWhole: false }).value).toBe(
      'Bengaluru',
    )
  })

  it('reads IDs as text without spreadsheet decimals', () => {
    expect(coerceId(10234).value).toBe('10234')
    expect(coerceId('10234.0').value).toBe('10234')
    expect(coerceId(' E-0012 ').value).toBe('E-0012')
    expect(coerceId('00123').value).toBe('00123')
  })
})

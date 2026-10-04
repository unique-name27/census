import { describe, expect, it } from 'vitest'
import { droppedColumns, droppedText, dropReason } from './protected'
import { sheetFromRows } from './sheet'

describe('columns Census never imports', () => {
  it.each([
    'Gender',
    'Sex',
    'Ethnicity',
    'Race/Ethnicity',
    'Nationality',
    'Primary Nationality',
    'Citizenship',
    'Country of Citizenship',
    'Citizen?',
    'Date of Birth',
    'DOB',
    'Birth Date',
    'Age',
    'Age band',
    'Religion',
    'Disability status',
    'Veteran Status',
    'Sexual orientation',
    'Marital Status',
    'National origin',
  ])('drops %s as a protected characteristic', (h) => {
    expect(dropReason(h)).toBe('protected')
  })

  it.each(['Comments', 'Manager comment', 'Verbatim', 'Open text', 'Free text response'])(
    'drops %s as a free-text comment',
    (h) => {
      expect(dropReason(h)).toBe('comment')
    },
  )

  it.each([
    'Employee ID',
    'Req age (days)',
    'Stage',
    'Agency',
    'Orientation date',
    'Work authorization type',
    'Export license status',
    'Country',
    'Essex office',
    'Leave reason',
    'Driver',
    'Score',
  ])('keeps %s', (h) => {
    expect(dropReason(h)).toBeNull()
  })

  it('leaves the columns out of the sheet itself and says why', () => {
    const sheet = sheetFromRows('Right to work', [
      ['Employee ID', 'Citizenship', 'Visa type', 'Comments'],
      ['E1', 'Somewhere', 'H-1B', 'renewal filed late'],
    ])!
    expect(sheet.headers).toEqual(['Employee ID', 'Visa type'])
    expect(sheet.rows).toEqual([{ 'Employee ID': 'E1', 'Visa type': 'H-1B' }])
    expect(sheet.dropped).toEqual([
      { header: 'Citizenship', reason: 'protected' },
      { header: 'Comments', reason: 'comment' },
    ])
    expect(droppedText(sheet.dropped ?? [])).toBe(
      'Citizenship was left out: Census never imports protected characteristics. Comments was left out: free-text comments are never imported.',
    )
    expect(droppedText(droppedColumns(['Gender', 'Age']))).toBe(
      'Gender and Age were left out: Census never imports protected characteristics.',
    )
    expect(droppedText([])).toBeNull()
    expect(
      sheetFromRows('Plain', [
        ['A', 'B'],
        [1, 2],
      ])?.dropped,
    ).toBeUndefined()
  })
})

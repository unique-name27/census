/**
 * The person card labels its job line apart from its org line (docs/TAXONOMY.md): the function
 * sits in its family, and the word "family" stays visible, since the sample's functions and
 * families often share their words with the department and business unit.
 */
import { describe, expect, it } from 'vitest'
import { jobLine } from './person'

describe('the person card job line', () => {
  it('names the function in its family', () => {
    expect(jobLine({ jobFunction: 'Design Verification', jobFamily: 'Silicon Engineering' })).toBe(
      'Design Verification, Silicon Engineering family',
    )
  })

  it('reads with either part missing, and is empty with neither', () => {
    expect(jobLine({ jobFunction: null, jobFamily: 'Corporate' })).toBe('Corporate family')
    expect(jobLine({ jobFunction: 'Design RTL', jobFamily: '  ' })).toBe('Design RTL')
    expect(jobLine({})).toBe('')
  })
})

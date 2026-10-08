/**
 * The offer declines survey section per mode (docs/ROLES-V2.md 4.2): Compensation sees the analysis
 * without the candidate survey figure, so its section is titled "What to do next", never "What
 * candidates told us"; the modes that show Listening's Candidates & hiring keep the survey.
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { candidateSurveyShown } from './survey'

const shown = (mode: Parameters<typeof accessFor>[0]) => candidateSurveyShown({ access: accessFor(mode) })

describe('candidateSurveyShown', () => {
  it('hides the survey, and so its title, in Compensation mode', () => {
    expect(shown('compensation')).toBe(false)
  })

  it('keeps it where Listening, Candidates & hiring shows', () => {
    for (const mode of ['developer', 'hr', 'chro', 'hrbp-unit', 'hrbp-region'] as const)
      expect(shown(mode), mode).toBe(true)
  })

  it('leaves it out in the modes without the analysis or the survey', () => {
    for (const mode of ['talent-management', 'hr-ops', 'recruiter', 'finance', 'manager'] as const)
      expect(shown(mode), mode).toBe(false)
  })
})

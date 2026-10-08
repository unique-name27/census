/**
 * Range position, "Outside the range": the lead names the "Show pay amounts" switch only in the
 * modes that have it (docs/ROLES-V2.md 3.1); the HRBP modes show ratios and counts only.
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { S } from '@/access/surfaces'
import { outsideRangeDek } from './notes'

const dekIn = (mode: Parameters<typeof accessFor>[0]) => outsideRangeDek(accessFor(mode).can(S.pay('switch')))

describe('outsideRangeDek', () => {
  it('names the switch in the modes that have it', () => {
    for (const mode of ['developer', 'hr', 'chro', 'compensation'] as const)
      expect(dekIn(mode), mode).toContain('Show pay amounts')
  })

  it('never names it in the HRBP modes, which see the tab without the switch', () => {
    for (const mode of ['hrbp-unit', 'hrbp-region'] as const) {
      expect(dekIn(mode), mode).not.toContain('Show pay amounts')
      expect(dekIn(mode), mode).toContain('ratios and counts')
    }
  })
})

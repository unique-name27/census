/**
 * The planted stories survive the mess: every view finds the same findings on the messy sample
 * as on the clean one. Only numbers that rest on a planted problem move, a little.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { computeComp } from '@/views/comp/engine/model'
import { DEFAULT_SETTINGS } from '@/views/comp/engine/settings'
import { computeHrbp } from '@/views/hrbp/engine'
import { computeRecruitingUncached } from '@/views/recruiting/engine'
import { compute as computeServices } from '@/views/services/engine'
import { computeTalent } from '@/views/talent/engine'
import { generateSample } from '..'
import { starterSample } from '.'

function contextOf(data: Datasets): AnalyticsContext {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  return buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
}

const VIEWS: [string, (ctx: AnalyticsContext) => { id: string }[]][] = [
  ['recruiting', (c) => computeRecruitingUncached(c).findings],
  ['hrbp', (c) => computeHrbp(c).findings],
  ['services', (c) => computeServices(c).findings],
  ['talent', (c) => computeTalent(c).findings],
  ['comp', (c) => computeComp(c, DEFAULT_SETTINGS).findings],
]

let clean: AnalyticsContext
let messy: AnalyticsContext

beforeAll(() => {
  const base = generateSample()
  clean = contextOf(base)
  messy = contextOf(starterSample(base).data)
})

describe('planted stories on the messy sample', () => {
  for (const [view, findings] of VIEWS)
    it(`${view} finds the same stories`, () => {
      const ids = (c: AnalyticsContext) => findings(c).map((f) => f.id)
      expect(ids(messy)).toEqual(ids(clean))
    })
})

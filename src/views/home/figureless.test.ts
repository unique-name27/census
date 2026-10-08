/**
 * Home in Developer mode is links to the role previews, with no figures: its header offers no
 * quality switch and no figure exports, only Copy link (the roles review).
 */
import { describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'
import { SLUG_OF } from './engine/figures'
import { view } from './index'

const ctxIn = (mode: (typeof MODES)[number]) => ({ access: { mode } }) as unknown as AnalyticsContext

describe('Home without figures', () => {
  it('is figureless only in a mode with no home of its own', () => {
    expect(view.figureless?.(ctxIn('developer'))).toBe(true)
    for (const mode of MODES) expect(view.figureless?.(ctxIn(mode)), mode).toBe(!SLUG_OF[mode])
    expect(view.figureless?.(ctxIn('finance'))).toBe(false)
    expect(view.figureless?.(ctxIn('chro'))).toBe(false)
  })
})

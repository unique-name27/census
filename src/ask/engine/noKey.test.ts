/**
 * Before a key is added, Ask's four questions follow the mode: a question never reads a view the
 * mode hides or names a place outside its scope (the roles review: Recruiter and Talent management
 * were offered Bengaluru attrition and critical-role successors).
 */
import { describe, expect, it } from 'vitest'
import { HOME_OF, MODES, type Mode, SCOPE_OF } from '@/access/modes'
import { routeShown } from '@/access/policy'
import { noKeyQuestions, suggestionsFor } from './copy'

const questions = (mode: Mode, view = HOME_OF[mode]) =>
  noKeyQuestions({
    mode,
    scoped: SCOPE_OF[mode] != null,
    viewShown: (v) => routeShown(mode, v),
    view,
  })

describe('Ask before a key is added', () => {
  it('offers the examples across Census only where every view they read is shown and no scope is held', () => {
    for (const mode of ['hr', 'chro', 'developer'] as const)
      expect(questions(mode), mode).toContain('Which critical roles have no ready-now successor?')
  })

  it('offers every other mode the keyed panel’s own four for the page on screen', () => {
    for (const mode of MODES) {
      if (mode === 'hr' || mode === 'chro' || mode === 'developer') continue
      const view = HOME_OF[mode]
      expect(questions(mode), mode).toEqual(suggestionsFor(view, null, undefined, mode))
      for (const q of questions(mode)) expect(q, `${mode}: ${q}`).not.toMatch(/Bengaluru/)
    }
    expect(questions('recruiter')).not.toContain('Which critical roles have no ready-now successor?')
    expect(questions('recruiter')[0]).toMatch(/my reqs/)
    expect(questions('manager', 'team')[0]).toMatch(/my org/)
  })
})

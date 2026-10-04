import { describe, expect, it } from 'vitest'
import { DEFAULT_COMP_CYCLE } from '@/data/settings'
import { DEFAULT_TOOLS, mergeTools } from '../tools'
import {
  importedText,
  parseCompDraft,
  sameCompCycle,
  toCompDraft,
  toolChanges,
  toolErrors,
  toToolDraft,
} from './model'

describe('compensation cycle form', () => {
  it('fills the form in percent and reads it back as fractions', () => {
    const draft = toCompDraft(DEFAULT_COMP_CYCLE)
    expect(draft).toEqual({
      budget: '3.5',
      low: '0.90',
      high: '1.10',
      guideline: { 5: '6', 4: '4.5', 3: '3', 2: '1', 1: '0' },
    })
    const back = parseCompDraft(draft)
    expect(back.ok && sameCompCycle(back.settings, DEFAULT_COMP_CYCLE)).toBe(true)
  })

  it('names the first problem and its field', () => {
    const d = toCompDraft(DEFAULT_COMP_CYCLE)
    expect(parseCompDraft({ ...d, budget: '25' })).toEqual({
      ok: false,
      error: 'Merit budget must be between 0% and 20%.',
      field: 'budget',
    })
    expect(parseCompDraft({ ...d, budget: '' })).toMatchObject({ ok: false, field: 'budget' })
    expect(parseCompDraft({ ...d, low: '1.2', high: '1.1' })).toMatchObject({
      ok: false,
      error: 'The low end of the band must be below the high end.',
    })
    expect(parseCompDraft({ ...d, high: '2' })).toMatchObject({ ok: false, field: 'high' })
    expect(parseCompDraft({ ...d, guideline: { ...d.guideline, 4: '31' } })).toMatchObject({
      ok: false,
      field: 'g4',
      error: 'The guideline for rating 4 must be between 0% and 30%.',
    })
  })

  it('compares settings field by field', () => {
    expect(sameCompCycle(DEFAULT_COMP_CYCLE, { ...DEFAULT_COMP_CYCLE, healthyBand: [0.9, 1.15] })).toBe(false)
  })
})

describe('related tools form', () => {
  const tools = mergeTools({})

  it('flags text that is not a web link and allows blanks', () => {
    const draft = { ...toToolDraft(tools), lattice: 'javascript:alert(1)', toolkit: '' }
    const errors = toolErrors(tools, draft)
    expect(errors.lattice).toBe('Enter a web address (https://…)')
    expect(errors.toolkit).toBeNull()
  })

  it('saves only what changed: a new link, a cleared default, a restored default', () => {
    const current = mergeTools({ pipeline: 'https://old.example/p' })
    const draft = {
      ...toToolDraft(current),
      pipeline: DEFAULT_TOOLS[0].url!,
      lattice: 'lattice.example/paths',
      catalog: '',
    }
    expect(toolChanges(current, draft)).toEqual([
      { id: 'pipeline', url: undefined },
      { id: 'lattice', url: 'https://lattice.example/paths' },
      { id: 'catalog', url: null },
    ])
    expect(toolChanges(tools, toToolDraft(tools))).toEqual([])
  })
})

describe('settings import wording', () => {
  it('lists what the file changed', () => {
    expect(importedText(['theme'])).toBe('Applied the theme from the file.')
    expect(importedText(['theme', 'textSize', 'dataStandard'])).toBe(
      'Applied the theme, text size and data standard from the file.',
    )
    expect(importedText([])).toBe('Nothing in the file could be applied.')
  })
})

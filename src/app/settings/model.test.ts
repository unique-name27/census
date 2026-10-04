import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLS, mergeTools } from '../tools'
import { importDescription, importedText, toolChanges, toolErrors, toToolDraft } from './model'

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

describe('settings import wording with the metric dictionary', () => {
  const report = (changed: number, rejected = 0) => ({
    changed: Array.from({ length: changed }, () => ({}) as never),
    rejected: Array.from({ length: rejected }, () => ({}) as never),
    unknown: [],
    summary: changed ? `Changed ${changed} values in 1 metric.` : 'Nothing changed.',
  })

  it('adds what changed in the dictionary after the settings', () => {
    expect(importDescription(['theme'], report(2))).toBe(
      'Applied the theme from the file. Metric definitions: Changed 2 values in 1 metric.',
    )
  })

  it('says when the dictionary already matched, and leaves the settings line out when none applied', () => {
    expect(importDescription([], report(0))).toBe('The metric definitions already matched the file.')
    expect(importDescription([], report(0, 1))).toBe('Metric definitions: Nothing changed.')
  })

  it('reads as before for a file without a dictionary', () => {
    expect(importDescription(['tools'])).toBe('Applied the tool links from the file.')
  })
})

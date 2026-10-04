import { describe, expect, it } from 'vitest'
import { METRICS } from '@/metrics/catalog'
import { ARTICLES } from './articles'
import { buildGlossary } from './glossary'
import { buildIndex, search, words } from './search'

const index = buildIndex(ARTICLES, buildGlossary(METRICS))
const top = (q: string) => search(index, q).articles.map((h) => h.article.id)
const terms = (q: string) => search(index, q).terms.map((h) => h.entry.id)

describe('words', () => {
  it('lowercases, drops accents and splits on punctuation', () => {
    expect(words('Compa-ratio, I-9 Café')).toEqual(['compa', 'ratio', 'i', '9', 'cafe'])
    expect(words('  ')).toEqual([])
  })
})

describe('search', () => {
  it('finds the article a person would expect first', () => {
    expect(top('certify')[0]).toBe('data-certify')
    expect(top('pay amounts')[0]).toBe('privacy-pay')
    expect(top('keyboard shortcuts')[0]).toBe('shortcuts')
    expect(top('tiers')[0]).toBe('data-tiers')
    expect(top('upload')[0]).toBe('data-loading')
    expect(top('glossary')[0]).toBe('glossary')
    expect(top('reorg')[0]).toBe('view-org')
    expect(top('report a problem')[0]).toBe('report-problem')
    expect(top("what's new")[0]).toBe('whats-new')
  })

  it('finds view articles by the words HR people use', () => {
    expect(top('attrition')).toContain('view-hrbp')
    expect(top('time to fill')[0]).toBe('view-recruiting')
    expect(top('compa-ratio')).toContain('view-comp')
    expect(top('reverification')[0]).toBe('view-compliance')
    expect(top('9-box')).toContain('view-talent')
    expect(top('snooze')[0]).toBe('view-actions')
  })

  it('matches the start of words, and one character only as a whole word', () => {
    expect(top('certif')).toContain('data-certify')
    expect(top('1:1')).toContain('view-hrbp')
    // "1" alone must not match every number in every article.
    expect(top('1').length).toBeLessThan(ARTICLES.length / 2)
  })

  it('every word must match somewhere', () => {
    expect(top('certify zebra')).toEqual([])
    expect(top('zzzz')).toEqual([])
    expect(search(index, '').articles).toEqual([])
    expect(search(index, '!!').terms).toEqual([])
  })

  it('searches the metric glossary by term and definition', () => {
    expect(terms('voluntary attrition')).toContain('hrbp.attrition.voluntary')
    expect(terms('compa')).toContain('comp.compa.median')
    expect(terms('anonymity')).toContain('privacy.anonymity')
    expect(search(index, 'time to fill').terms[0].entry.id).toBe('recruiting.reqs.timeToFill')
  })

  it('puts a title that is the query, or starts with it, before one that only contains it', () => {
    const regretted = search(index, 'regretted').terms.map((h) => h.entry.term)
    expect(regretted[0]).toBe('Regretted attrition')
    expect(search(index, 'attrition').terms[0].entry.term).toBe('Attrition')
  })

  it('shows 8 of each kind but counts every match, and shows all on request', () => {
    const capped = search(index, 'pay')
    expect(capped.terms).toHaveLength(8)
    expect(capped.totals.terms).toBeGreaterThan(8)
    const all = search(index, 'pay', { articles: Infinity, terms: Infinity })
    expect(all.terms).toHaveLength(capped.totals.terms)
    expect(all.articles).toHaveLength(capped.totals.articles)
    expect(all.terms.slice(0, 8)).toEqual(capped.terms)
    expect(search(index, '').totals).toEqual({ articles: 0, terms: 0 })
  })

  it('gives a snippet from the article that contains the query', () => {
    const hit = search(index, 'control totals').articles.find((h) => h.article.id === 'data-certify')
    expect(hit?.snippet.toLowerCase()).toContain('control totals')
  })
})

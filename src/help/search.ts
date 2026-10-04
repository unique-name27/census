/**
 * Search across help articles and the metric glossary. Every word of the query must match the
 * start of a word in the entry ("verif" finds "verification"); a one-character word must match a
 * whole word, so "1:1" finds the leader 1:1 article and not every number. Titles and terms count
 * most, then keywords and summaries, then body text. Pure.
 */
import type { GlossaryEntry } from './glossary'
import { articleText, blockTexts, plainText } from './markup'
import type { HelpArticle } from './types'

/** Lowercase words without accents: "Compa-ratio, I-9" → ["compa", "ratio", "i", "9"]. */
export function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

interface Field {
  words: readonly string[]
  weight: number
}

/** Points for one query word against one field: a whole word scores more than a prefix. */
function fieldScore(q: string, f: Field): number {
  let best = 0
  for (const w of f.words) {
    if (w === q) return f.weight * 1.5
    if (q.length > 1 && w.startsWith(q)) best = f.weight
  }
  return best
}

/** Total points for a query against fields, or 0 when any query word matches nowhere. */
function score(query: readonly string[], fields: readonly Field[], phrase: string, title: string): number {
  let total = 0
  for (const q of query) {
    let best = 0
    for (const f of fields) best = Math.max(best, fieldScore(q, f))
    if (!best) return 0
    total += best
  }
  // The whole query as written, inside the title, lifts the entry; more when the title is the
  // query or starts with it, so "regretted" puts "Regretted attrition" before "Exit driver gap,
  // regretted vs other leavers".
  if (phrase && title.includes(phrase)) {
    total += 10
    if (title === phrase) total += 20
    else if (title.startsWith(`${phrase} `)) total += 5
  }
  return total
}

const joinWords = (s: string) => words(s).join(' ')

export interface ArticleHit {
  article: HelpArticle
  score: number
  /** The first sentence of the body that mentions the query, or the summary. */
  snippet: string
}

export interface TermHit {
  entry: GlossaryEntry
  score: number
}

export interface SearchResults {
  articles: ArticleHit[]
  terms: TermHit[]
  /** How many matched in all, before the lists were cut to their limits. */
  totals: { articles: number; terms: number }
}

/** How many of each kind a search shows until the reader asks for all of them. */
export const RESULT_LIMIT = 8

interface ArticleDoc {
  article: HelpArticle
  title: string
  fields: Field[]
  sentences: string[]
}

interface TermDoc {
  entry: GlossaryEntry
  title: string
  fields: Field[]
}

export interface SearchIndex {
  articles: ArticleDoc[]
  terms: TermDoc[]
}

export function buildIndex(
  articles: readonly HelpArticle[],
  glossary: readonly GlossaryEntry[],
): SearchIndex {
  return {
    articles: articles.map((a) => {
      const body = a.body.flatMap((b) => blockTexts(b).map(plainText))
      return {
        article: a,
        title: joinWords(a.title),
        fields: [
          { words: words(a.title), weight: 10 },
          { words: words((a.keywords ?? []).join(' ')), weight: 6 },
          { words: words(a.summary), weight: 4 },
          { words: words(articleText(a)), weight: 1 },
        ],
        sentences: body.flatMap((t) => t.split(/(?<=[.?!])\s+/)),
      }
    }),
    terms: glossary.map((e) => ({
      entry: e,
      title: joinWords(e.term),
      fields: [
        { words: words(e.term), weight: 10 },
        { words: words(`${e.definition} ${e.formula ?? ''}`), weight: 2 },
        { words: words(e.where), weight: 1 },
      ],
    })),
  }
}

function snippetOf(doc: ArticleDoc, query: readonly string[]): string {
  const hit = doc.sentences.find((s) => {
    const ws = words(s)
    return query.every((q) => ws.some((w) => w === q || (q.length > 1 && w.startsWith(q))))
  })
  return hit ?? doc.article.summary
}

/**
 * Ranked results, at most `RESULT_LIMIT` of each kind unless the options say otherwise
 * (`Infinity` for all); `totals` says how many matched. An empty or punctuation-only query finds
 * nothing.
 */
export function search(
  index: SearchIndex,
  text: string,
  opts: { articles?: number; terms?: number } = {},
): SearchResults {
  const query = words(text)
  if (!query.length) return { articles: [], terms: [], totals: { articles: 0, terms: 0 } }
  const phrase = query.join(' ')
  const articleHits = index.articles
    .map((d) => ({ d, score: score(query, d.fields, phrase, d.title) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
  const termHits = index.terms
    .map((d) => ({ entry: d.entry, score: score(query, d.fields, phrase, d.title) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.term.localeCompare(b.entry.term))
  return {
    articles: articleHits
      .slice(0, opts.articles ?? RESULT_LIMIT)
      .map(({ d, score }) => ({ article: d.article, score, snippet: snippetOf(d, query) })),
    terms: termHits.slice(0, opts.terms ?? RESULT_LIMIT),
    totals: { articles: articleHits.length, terms: termHits.length },
  }
}

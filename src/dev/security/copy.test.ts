/**
 * The Security center's wording (docs/SECURITY-CENTER.md): the fixed banner word for word, and
 * the modes copy rule (docs/ROLES.md 1.6: modes are a view, not security) everywhere else. The
 * banned-words check exempts this page and its help article, and nothing more: every other help
 * article and tour, and every sentence the policy file puts on screen in other modes, stays free
 * of the words that would make a mode sound like security.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { accessMatrix } from '@/access/matrix'
import { MODES } from '@/access/modes'
import { DEFAULTS_IN_FORCE, GUARD_RAILS, overridesOf, resetPolicyState, setInForce } from '@/access/overrides'
import { decide } from '@/access/policy'
import { ARTICLES } from '@/help/articles'
import { blockTexts } from '@/help/markup'
import { TOURS } from '@/help/tours'
import {
  BACK_TO_SECURITY,
  BANNED_WORDS_EXEMPT,
  IGNORED_TITLE,
  PREVIEW_DETAIL,
  previewingText,
  SECURITY_BANNER,
} from './copy'
import { SECURITY_INVENTORY } from './inventory'

afterEach(() => resetPolicyState())

const banned = (text: string): string[] =>
  BANNED_MODE_WORDS.filter((w) => new RegExp(`\\b${w}`, 'i').test(text.replace(/access-policy\.json/g, '')))

describe('the Security center banner', () => {
  it('is the wording in docs/SECURITY-CENTER.md, word for word', () => {
    const doc = readFileSync(join(__dirname, '../../../docs/SECURITY-CENTER.md'), 'utf8')
    const quote = doc
      .split('\n')
      .filter((l) => l.startsWith('> '))
      .map((l) => l.slice(2).trim())
      .join(' ')
    expect(SECURITY_BANNER).toBe(quote)
    expect(SECURITY_BANNER.includes('—')).toBe(false)
  })
})

describe('the modes copy rule outside this page', () => {
  const exempt = new Set<string>([...BANNED_WORDS_EXEMPT.articles, 'developer-tools'])

  it('exempts only this page, its help article and the Developer page article it sits under', () => {
    expect([...exempt].sort()).toEqual(['developer-tools', 'security-center'])
    expect(BANNED_WORDS_EXEMPT.folders).toEqual(['dev/security/', 'access/overrides/'])
    // The page itself does use the words (it names access-policy.json and what each role can see).
    const page = readdirSync(join(__dirname, 'ui'))
      .map((f) => readFileSync(join(__dirname, 'ui', f), 'utf8'))
      .join('\n')
    expect(page).toMatch(/access-policy\.json|POLICY_FILE_NAME/)
  })

  it('keeps every other help article and tour free of the banned words where it speaks of modes or roles', () => {
    const problems: string[] = []
    for (const a of ARTICLES) {
      if (exempt.has(a.id)) continue
      const sentences = [a.title, a.summary, ...a.body.flatMap((b) => blockTexts(b))].flatMap((t) =>
        t.split(/(?<=[.?!])\s+/),
      )
      for (const s of sentences)
        if (/\b(mode|modes|role|roles)\b/i.test(s) && banned(s).length) problems.push(`${a.id}: ${s}`)
    }
    for (const t of TOURS)
      for (const s of [t.title, t.summary, ...t.steps.flatMap((x) => [x.title, x.body])])
        if (/\b(mode|modes|role|roles)\b/i.test(s) && banned(s).length) problems.push(`${t.id}: ${s}`)
    expect(problems).toEqual([])
  })

  it('keeps what the policy file puts on screen in other modes plain', () => {
    for (const s of [previewingText('Finance'), PREVIEW_DETAIL, BACK_TO_SECURITY, IGNORED_TITLE]) {
      expect(banned(s), s).toEqual([])
      expect(s.includes('—'), s).toBe(false)
    }
    // Every decision an override makes reads the same plain sentence in every mode.
    const lines = MODES.filter((m) => m !== 'developer').flatMap((role) =>
      ['view:ai', 'export:view', 'ask:make_chart', 'help:article:exporting'].map((surface) => ({
        role: role as Exclude<typeof role, 'developer'>,
        surface,
        decision: surface === 'export:view' ? 'limited' : 'hidden',
        reason: 'A reason with the word access in it',
        by: 'QA',
        at: '',
      })),
    )
    setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines })
    expect(overridesOf(lines).size).toBe(10)
    for (const r of accessMatrix(SECURITY_INVENTORY))
      for (const m of MODES) {
        const how = decide(m, r.surface).how ?? ''
        expect(banned(how), `${r.surface} ${m}: ${how}`).toEqual([])
        expect(how.includes('A reason'), how).toBe(false)
      }
  })

  it('says each guard rail as one plain sentence', () => {
    for (const s of Object.values(GUARD_RAILS)) {
      expect(s.includes('—'), s).toBe(false)
      expect(s).toMatch(/^[A-Z][^!]*\.$/)
    }
  })
})

describe('the Security center source', () => {
  it('writes no em dash into a sentence and no exclamation mark', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(n) && !n.endsWith('.test.ts')) files.push(p)
      }
    }
    walk(__dirname)
    walk(join(__dirname, '../../access/overrides'))
    for (const f of files) {
      const t = readFileSync(f, 'utf8')
      expect(t, f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(t, f).not.toMatch(/'[^'\n]*!'/)
    }
  })
})

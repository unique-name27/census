/**
 * The Security center's help article (`security-center`, docs/SECURITY-CENTER.md): Developer mode
 * only, like the page it explains, and no override can show it elsewhere (the "developer-only"
 * guard rail). It opens from the page's Help, names every section, and lists the guard rails in
 * the rails' own words.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import {
  GUARD_RAILS,
  guardEnv,
  guardRailFor,
  overridesOf,
  type PolicyLine,
  type PolicyRole,
  resetPolicyState,
} from '@/access/overrides'
import { DEVELOPER_ONLY, decide, isGuardedDeveloperSurface, setPolicyOverrides } from '@/access/policy'
import { articleById, articleForRoute } from '@/help/articles'
import { blockTexts } from '@/help/markup'
import { BANNED_WORDS_EXEMPT, SECURITY_CENTER } from './copy'

afterEach(() => resetPolicyState())

const SURFACE = 'help:article:security-center'

const line = (role: PolicyRole, decision: string): PolicyLine => ({
  role,
  surface: SURFACE,
  decision,
  reason: 'Let them read it',
  by: 'QA',
  at: '2026-10-08T09:00:00.000Z',
})

const text = (): string => {
  const a = articleById('security-center')!
  return [a.title, a.summary, ...a.body.flatMap((b) => blockTexts(b))].join('\n')
}

describe('the security-center help article', () => {
  it('exists, is the one the banned-words check exempts, and opens from the Security center', () => {
    const a = articleById('security-center')
    expect(a?.title).toBe(SECURITY_CENTER)
    expect(BANNED_WORDS_EXEMPT.articles).toContain('security-center')
    expect(a?.route).toEqual({ view: 'dev', tab: 'security' })
    expect(articleForRoute('dev', 'security')?.id).toBe('security-center')
    expect(articleForRoute('dev', 'security:role:finance')?.id).toBe('security-center')
    expect(articleForRoute('dev', '')?.id).toBe('developer-tools')
    expect(articleForRoute('dev', 'inventory:homes/finance')?.id).toBe('developer-tools')
  })

  it('shows in Developer mode only', () => {
    expect(DEVELOPER_ONLY).toContain(SURFACE)
    expect(isGuardedDeveloperSurface(SURFACE)).toBe(true)
    for (const m of MODES) expect(decide(m, SURFACE).access, m).toBe(m === 'developer' ? 'shown' : 'hidden')
  })

  it('cannot be shown in another mode by an override', () => {
    const lines = MODES.filter((m) => m !== 'developer').map((m) => line(m as PolicyRole, 'shown'))
    for (const l of lines) expect(guardRailFor(l, guardEnv(lines)), l.role).toBe('developer-only')
    // Even laid over the tables directly, the guarded surface stays hidden.
    setPolicyOverrides(overridesOf(lines))
    for (const m of MODES) expect(decide(m, SURFACE).access, m).toBe(m === 'developer' ? 'shown' : 'hidden')
    // So does the page it explains, and the Developer page itself.
    const page = MODES.filter((m) => m !== 'developer').flatMap((m) =>
      ['page:dev', 'tab:dev.security'].map((surface) => ({ ...line(m as PolicyRole, 'shown'), surface })),
    )
    setPolicyOverrides(overridesOf(page))
    for (const m of MODES)
      for (const s of ['page:dev', 'tab:dev.security'])
        expect(decide(m, s).access, `${m} ${s}`).toBe(m === 'developer' ? 'shown' : 'hidden')
  })

  it('names every section, preview, publishing and the guard rails in their own words', () => {
    const t = text()
    for (const s of ['Matrix', 'Role', 'Changes', 'In force', 'Publish and import', 'Preview'])
      expect(t, s).toContain(s)
    expect(t).toContain('public/access-policy.json')
    expect(t).toContain('npm run deploy')
    expect(t).toContain('#dev.security:role:finance')
    for (const id of [
      'protected',
      'er-names',
      'survey-person',
      'minimums',
      'switches',
      'developer-only',
    ] as const)
      expect(t, id).toContain(GUARD_RAILS[id])
    expect(t).toContain(GUARD_RAILS.scope.split('. ')[0])
    expect(t.includes('—')).toBe(false)
    expect(t).not.toMatch(/!/)
  })

  it('is linked from the Developer tools article, which covers eleven modes, Scan as role and Role homes', () => {
    const a = articleById('developer-tools')!
    const dev = [a.summary, ...a.body.flatMap((b) => blockTexts(b))].join('\n')
    expect(dev).toContain('(article:security-center)')
    expect(dev).toMatch(/eleven modes/)
    expect(dev).toContain('Scan as role')
    expect(dev).toContain('Role homes')
    expect(dev).toContain('(route:dev.inventory:homes)')
    expect(dev).not.toMatch(/Developer, HR and Manager mode/)
  })
})

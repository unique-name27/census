/**
 * Listening's Action center items on the sample: each goes to the team that can act, with a
 * stable id, plain wording (no nagging verbs), grouped drills and declared fields.
 */
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality'
import { resolveDrill } from '@/drill/Drill'
import { ACTION_OWNER_ROLES } from '@/views/types'
import { listeningActions } from './actions'
import { sampleContext } from './testkit'

describe('Listening actions on the sample', () => {
  const ctx = sampleContext()
  const items = listeningActions(ctx)
  const byId = new Map(items.map((a) => [a.id, a]))

  it('sends low upward feedback to the HR business partner, naming the manager only through the cut', () => {
    const a = byId.get('listening:manager:E10599')
    expect(a).toMatchObject({
      ownerRole: 'hrbp',
      ownerName: 'Michael Thomas',
      view: 'listening',
      tab: 'managers',
      subject: { kind: 'employees', id: 'E10599', label: 'Heather Hayes' },
    })
    expect(a?.what).toMatch(/^Upward feedback is 2\.1\d of 5 from 10 people over four quarters/)
    expect(a?.note).toMatch(/^Could you review/)
  })

  it('sends the stay risk to talent management, the pay-led exit reason to total rewards and the readiness gap to IT', () => {
    expect(byId.get('listening:stay:Design Verification L4-L5')).toMatchObject({ ownerRole: 'talent' })
    expect(byId.get('listening:exit:Bengaluru')).toMatchObject({ ownerRole: 'total-rewards' })
    expect(byId.get('listening:readiness:Asia Pacific')).toMatchObject({ ownerRole: 'it', ownerName: 'IT' })
  })

  it('keeps ids stable across recomputes', () => {
    expect(listeningActions(sampleContext()).map((a) => a.id)).toEqual(items.map((a) => a.id))
  })

  it('writes every item plainly, with valid owners, fields and grouped drills', () => {
    for (const a of items) {
      expect(ACTION_OWNER_ROLES, a.id).toContain(a.ownerRole)
      expect(`${a.what} ${a.note ?? ''}`, a.id).not.toMatch(/\b(chase|push|nag|ping|hound)/i)
      expect(a.what, a.id).not.toContain('—')
      expect(a.uses?.length, a.id).toBeGreaterThan(0)
      expect(invalidRefs(a.uses ?? []), a.id).toEqual([])
      const spec = resolveDrill(a.drill)
      expect(spec?.kind, a.id).toBe('surveyGroups')
      for (const row of spec?.rows ?? []) expect(row, a.id).not.toHaveProperty('respondentKey')
    }
  })
})

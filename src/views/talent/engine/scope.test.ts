/**
 * Talent in the HRBP scopes (docs/ROLES-V2.md 2.7): a successor outside the business unit or the
 * region shows by name with their business unit or site, as plain text; inside it, by name only.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DEFAULT_FILTERS } from '@/data/scope'
import { talentModel } from './index'
import { sourcesFor } from './test-fixtures'

describe('successors outside an HRBP scope', () => {
  const data = generateSample()
  const ctxIn = (access: Parameters<typeof buildContext>[0]['access']) =>
    buildContext({
      data,
      sources: sourcesFor(data, 'sample'),
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
      access,
    })

  it('names a successor in another business unit with that unit', () => {
    const ctx = ctxIn({ mode: 'hrbp-unit', picks: { unit: 'Silicon Engineering' } })
    const scope = ctx.access.scope
    if (scope?.kind !== 'unit') throw new Error('no unit scope')
    const byId = ctx.org.byId
    const outside = ctx.data.succession.find((p) => {
      const s = p.successorId ? byId.get(p.successorId) : undefined
      return s && !scope.memberIds.has(s.employeeId) && s.businessUnit && !s.terminationDate
    })
    // The sample plans one Silicon Engineering role with a successor in another unit.
    expect(outside?.successorId).toBeTruthy()
    const s = byId.get(outside!.successorId!)!
    const role = talentModel(ctx).succession.roles.find((r) => r.roleId === outside!.roleId)!
    expect(role.successorNames).toContain(`${s.name} (${s.businessUnit})`)
  })

  it('names a successor outside the region with their site, and one inside by name only', () => {
    const ctx = ctxIn({ mode: 'hrbp-region', picks: { region: 'APAC' } })
    const scope = ctx.access.scope
    if (scope?.kind !== 'region') throw new Error('no region scope')
    const roles = talentModel(ctx).succession.roles
    const plans = ctx.data.succession
    for (const r of roles) {
      for (const p of plans.filter((x) => x.roleId === r.roleId && x.successorId)) {
        const s = ctx.org.byId.get(p.successorId!)
        if (!s || (s.terminationDate && s.terminationDate <= ctx.asOf)) continue
        if (scope.memberIds.has(s.employeeId)) expect(r.successorNames).not.toContain(`${s.name} (`)
        else expect(r.successorNames).toContain(`${s.name} (${s.location})`)
      }
    }
  })

  it('names every successor plainly outside a scope', () => {
    const ctx = ctxIn({ mode: 'hr' })
    for (const r of talentModel(ctx).succession.roles) expect(r.successorNames).not.toMatch(/\(/)
  })
})

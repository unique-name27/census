/**
 * The Security center's addresses (docs/SECURITY-CENTER.md, "Addresses"): `#dev.security:role:finance`
 * and the other sections keep what they name through the address and a reload, for every role, and
 * a link that writes the role after a "/" or a "." opens the same page.
 */
import { describe, expect, it } from 'vitest'
import { POLICY_ROLES } from '@/access/overrides'
import { routeHash } from '@/components/navigation'
import { parseHash } from '@/data/store'
import { devTab, parseDevTab } from '../tabs'
import { parseSecuritySub, securitySub } from './index'

/** What a reload reads back from an address. */
function reload(hash: string) {
  const route = parseHash(hash)
  expect(route?.view).toBe('dev')
  const dev = parseDevTab(route?.tab)
  expect(dev.tab).toBe('security')
  return parseSecuritySub(dev.sub)
}

describe('Security center addresses', () => {
  it('keeps the role page and its role through a reload, for every role', () => {
    for (const role of POLICY_ROLES) {
      const hash = routeHash('dev', devTab('security', securitySub('role', role)))
      expect(hash).toBe(`#dev.security:role:${role}`)
      expect(reload(hash)).toEqual({ section: 'role', role })
    }
  })

  it('keeps every other section', () => {
    expect(routeHash('dev', devTab('security', securitySub('matrix')))).toBe('#dev.security')
    expect(reload('#dev.security').section).toBe('matrix')
    for (const section of ['changes', 'in-force', 'publish'] as const) {
      const hash = routeHash('dev', devTab('security', securitySub(section)))
      expect(hash).toBe(`#dev.security:${section}`)
      expect(reload(hash).section).toBe(section)
    }
  })

  it('reads a role written after a slash or a dot, with or without a scope after it', () => {
    for (const hash of [
      '#dev.security:role:hr-ops',
      '#dev.security:role/hr-ops',
      '#dev.security:role.hr-ops',
      '#dev.security:role.hr-ops?bu=Silicon%20Engineering',
    ])
      expect(reload(hash), hash).toEqual({ section: 'role', role: 'hr-ops' })
  })

  it('opens the matrix for an unknown section, and Finance for an unknown role', () => {
    expect(reload('#dev.security:nowhere').section).toBe('matrix')
    expect(reload('#dev.security:role:developer')).toEqual({ section: 'role', role: 'finance' })
  })
})

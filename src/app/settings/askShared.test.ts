/**
 * Settings > Ask Census on an address other sites share (docs/ASK-RELAY.md, Security notes): on
 * `<account>.github.io`, "Keep on this device" is not offered for the team passcode or a key, and a
 * note says why; on an address of Census's own, the switch is there as before. Rendered to markup
 * with the page's host name stubbed. No passcode or key is stored here.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_RELAY, setRelayInForce } from '@/ask/engine/relay'
import { AskSection } from './AskSection'

const RELAY = 'https://census-ask-relay.example.workers.dev'

function render(hostname: string, relay: boolean): string {
  vi.stubGlobal('location', { hostname })
  setRelayInForce(relay ? { relayUrl: RELAY, source: 'site', ignored: null } : NO_RELAY)
  return renderToStaticMarkup(createElement(AskSection))
}

afterEach(() => {
  vi.unstubAllGlobals()
  setRelayInForce(NO_RELAY)
})

describe('Settings, Ask Census, on a shared address', () => {
  it('offers "Keep on this device" for the passcode on github.io with a warning', () => {
    const html = render('unique-name27.github.io', true)
    expect(html).toContain('Team passcode')
    expect(html).toContain('Keep the passcode on this device')
    expect(html).toContain(
      'Every site published at unique-name27.github.io can read what Census keeps in this browser. Turn this on only if you trust every site there; otherwise the passcode is kept for this tab only.',
    )
  })

  it('offers it for a key of one’s own there too, with the same warning', () => {
    const html = render('unique-name27.github.io', false)
    expect(html).toContain('Claude API key')
    expect(html).toContain('Keep the key on this device')
    expect(html).toContain('otherwise the key is kept for this tab only.')
  })

  it('keeps the switch for a passcode kept before, so it can be turned off', () => {
    const kept = new Map([['census:ask-passcode', 'fake-team-passcode-0000']])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: () => {},
      removeItem: () => {},
    })
    const html = render('unique-name27.github.io', true)
    expect(html).toContain('Keep the passcode on this device')
    expect(html).toContain('Turn this off to keep the passcode for this tab only.')
    expect(html).not.toContain('fake-team-passcode-0000')
  })

  it('offers it as before on an address of Census’s own', () => {
    expect(render('census.example.com', true)).toContain('Keep the passcode on this device')
    expect(render('localhost', false)).toContain('Keep the key on this device')
    expect(render('census.example.com', true)).not.toContain('Every site published at')
  })
})

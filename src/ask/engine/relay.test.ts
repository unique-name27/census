/**
 * The team relay on the Census side (docs/ASK-RELAY.md): reading `ask-relay.json`, loading it from
 * the site or the one-file build, how Ask connects (the relay unless "Use my own key instead"), where
 * the team passcode is kept (and never), and the relay's rules kept in step with what Ask sends.
 * Every passcode and key here is fake.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, settingsBlob } from '@/data/settings'
import { canCopyValue, describeKey, safeValue, scannedValue, storageRows } from '@/dev/storageKeys'
import {
  DEFAULTS,
  MIN_PASSCODE_LENGTH,
  PASSCODE_HEADER as RELAY_HEADER,
} from '../../../ask-relay/src/handler'
import { RELAY_SOURCE, RELAY_TARGET, relayProblem } from '../../../scripts/pagesFiles.mjs'
import { FAKE_KEY } from './fakeApi'
import {
  forgetPasscode,
  type KeyStores,
  looksLikePasscode,
  PASSCODE_STORAGE_KEY,
  readOwnKeyChoice,
  readPasscode,
  SOURCE_STORAGE_KEY,
  saveKey,
  saveOwnKeyChoice,
  savePasscode,
  sharedHost,
} from './keys'
import { FALLBACK_BETA, MAX_TOKENS } from './loop'
import { MODELS } from './models'
import {
  askVia,
  loadRelay,
  NO_RELAY,
  PASSCODE_HEADER,
  RELAY_FILE_NAME,
  readCredential,
  readRelayFile,
  relayInForce,
  relayUrlOf,
  setRelayInForce,
} from './relay'

const PASSCODE = 'fake-team-passcode-0000'
const RELAY = 'https://census-ask-relay.example.workers.dev'
const root = join(__dirname, '../../..')

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  dump() {
    return JSON.stringify([...this.m])
  }
}

class BlockedStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error('blocked')
  }
  override setItem(): void {
    throw new Error('blocked')
  }
}

const stores = (): KeyStores & { session: MemoryStorage; local: MemoryStorage } => ({
  session: new MemoryStorage(),
  local: new MemoryStorage(),
})

describe('ask-relay.json', () => {
  it('reads the relay address, trimmed and without a trailing slash', () => {
    expect(readRelayFile(JSON.stringify({ relayUrl: ` ${RELAY}/ ` }))).toEqual({ ok: true, relayUrl: RELAY })
    expect(readRelayFile(JSON.stringify({ relayUrl: `${RELAY}/ask/` }))).toEqual({
      ok: true,
      relayUrl: `${RELAY}/ask`,
    })
    // http only on this computer, for testing.
    expect(readRelayFile('{"relayUrl":"http://localhost:8787"}')).toEqual({
      ok: true,
      relayUrl: 'http://localhost:8787',
    })
  })

  it('ignores a file that holds more than the address: a passcode, a key, or anything else', () => {
    const why = (text: string) => {
      const r = readRelayFile(text)
      return r.ok ? null : r.why
    }
    const only = 'The file must hold only relayUrl, never a passcode, a key or anything else.'
    expect(why(JSON.stringify({ relayUrl: RELAY, passcode: PASSCODE }))).toBe(only)
    expect(why(JSON.stringify({ relayUrl: RELAY, note: 'dev' }))).toBe(only)
    expect(why(JSON.stringify({ relayUrl: RELAY, apiKey: FAKE_KEY }))).toBe(
      'The file holds what looks like an API key.',
    )
    expect(why(JSON.stringify({ relayUrl: `${RELAY}/${FAKE_KEY}` }))).toBe(
      'The file holds what looks like an API key.',
    )
  })

  it('ignores a file that is not JSON, has no relayUrl, or one Census cannot use, saying why', () => {
    const why = (text: string) => {
      const r = readRelayFile(text)
      return r.ok ? null : r.why
    }
    expect(why('{')).toBe('The file is not valid JSON.')
    expect(why('[]')).toBe('The file is not a Census relay file.')
    expect(why('{}')).toBe('It has no relayUrl.')
    expect(why('{"relayUrl":"  "}')).toBe('It has no relayUrl.')
    expect(why('{"relayUrl":"census-ask-relay"}')).toBe('Its relayUrl is not a web address.')
    expect(why('{"relayUrl":"http://census.example.com"}')).toBe('Its relayUrl must start with https://.')
    expect(why('{"relayUrl":"ftp://census.example.com"}')).toBe('Its relayUrl must start with https://.')
    expect(why('{"relayUrl":"https://me:pw@census.example.com"}')).toMatch(/user name or password/)
    expect(why(`{"relayUrl":"${RELAY}?passcode=x"}`)).toMatch(/nothing after \? or #/)
    expect(why(`{"relayUrl":"${RELAY}#x"}`)).toMatch(/nothing after \? or #/)
    expect(why(`{"relayUrl":"${RELAY}/v1/messages"}`)).toMatch(/without \/v1\/messages/)
    expect(relayUrlOf(42)).toEqual({ ok: false, why: 'It has no relayUrl.' })
  })

  it('loads from the site, or from the copy the one-file build embeds, and is none without a file', async () => {
    const file = JSON.stringify({ relayUrl: RELAY })
    const site = (text: string) => async () => ({ status: 'ok' as const, text })
    expect(await loadRelay({ oneFile: false, embedded: null, fetchFile: site(file) })).toEqual({
      relayUrl: RELAY,
      source: 'site',
      ignored: null,
    })
    expect(
      await loadRelay({
        oneFile: true,
        embedded: file,
        fetchFile: () => Promise.reject(new Error('the one-file build never fetches')),
      }),
    ).toEqual({ relayUrl: RELAY, source: 'embedded', ignored: null })
    expect(await loadRelay({ oneFile: true, embedded: null, fetchFile: site(file) })).toEqual(NO_RELAY)
    const missing = async () => ({ status: 'missing' as const })
    expect(await loadRelay({ oneFile: false, embedded: file, fetchFile: missing })).toEqual(NO_RELAY)
    expect(await loadRelay({ oneFile: false, embedded: null, fetchFile: site('  ') })).toEqual(NO_RELAY)
    // Offline or blocked: the same as no file.
    const offline = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await loadRelay({ oneFile: false, embedded: null, fetchFile: offline })).toEqual(NO_RELAY)
    // A file Census cannot use: no relay, and why.
    expect(
      await loadRelay({ oneFile: false, embedded: null, fetchFile: site('{"relayUrl":"http://x.example"}') }),
    ).toEqual({ relayUrl: null, source: 'none', ignored: 'Its relayUrl must start with https://.' })
  })
})

describe('how Ask connects', () => {
  it('uses the team relay when one is configured, unless "Use my own key instead" is on', () => {
    expect(askVia(null, false)).toEqual({ kind: 'own' })
    expect(askVia(null, true)).toEqual({ kind: 'own' })
    expect(askVia(RELAY, false)).toEqual({ kind: 'team', relayUrl: RELAY })
    expect(askVia(RELAY, true)).toEqual({ kind: 'own' })
    // In force: none until the file loads.
    const before = relayInForce()
    try {
      setRelayInForce(NO_RELAY)
      expect(askVia(undefined, false)).toEqual({ kind: 'own' })
      setRelayInForce({ relayUrl: RELAY, source: 'site', ignored: null })
      expect(askVia(undefined, false)).toEqual({ kind: 'team', relayUrl: RELAY })
    } finally {
      setRelayInForce(before)
    }
  })

  it('sends with the key or the passcode for that way, and nothing when that one is missing', () => {
    const s = stores()
    const team = { kind: 'team' as const, relayUrl: RELAY }
    expect(readCredential(team, s)).toBeNull()
    expect(readCredential({ kind: 'own' }, s)).toBeNull()
    saveKey(FAKE_KEY, false, s)
    // A key of one's own does not stand in for the passcode.
    expect(readCredential(team, s)).toBeNull()
    expect(readCredential({ kind: 'own' }, s)).toEqual({ kind: 'own', key: FAKE_KEY, kept: false })
    savePasscode(PASSCODE, true, s)
    expect(readCredential(team, s)).toEqual({ kind: 'team', passcode: PASSCODE, kept: true, relayUrl: RELAY })
    expect(readCredential({ kind: 'own' }, s)).toEqual({ kind: 'own', key: FAKE_KEY, kept: false })
  })

  it('keeps "Use my own key instead" on this device, off when absent or blocked', () => {
    const local = new MemoryStorage()
    expect(readOwnKeyChoice(local)).toBe(false)
    expect(saveOwnKeyChoice(true, local)).toBe(true)
    expect(local.getItem(SOURCE_STORAGE_KEY)).toBe('own')
    expect(readOwnKeyChoice(local)).toBe(true)
    expect(saveOwnKeyChoice(false, local)).toBe(true)
    expect(local.getItem(SOURCE_STORAGE_KEY)).toBeNull()
    expect(readOwnKeyChoice(new BlockedStorage())).toBe(false)
    expect(saveOwnKeyChoice(true, new BlockedStorage())).toBe(false)
    expect(saveOwnKeyChoice(true, null)).toBe(false)
  })
})

describe('the team passcode', () => {
  it('is kept for this tab by default, on this device when kept, and forgotten everywhere', () => {
    const s = stores()
    expect(readPasscode(s)).toBeNull()
    expect(savePasscode(`  ${PASSCODE} `, false, s)).toBe(true)
    expect(s.session.getItem(PASSCODE_STORAGE_KEY)).toBe(PASSCODE)
    expect(s.local.getItem(PASSCODE_STORAGE_KEY)).toBeNull()
    expect(readPasscode(s)).toEqual({ passcode: PASSCODE, kept: false })
    // Keep on this device: moves it, and the tab's copy goes.
    expect(savePasscode(PASSCODE, true, s)).toBe(true)
    expect(s.session.getItem(PASSCODE_STORAGE_KEY)).toBeNull()
    expect(readPasscode(s)).toEqual({ passcode: PASSCODE, kept: true })
    // Turning it off again leaves no copy on the device.
    savePasscode(PASSCODE, false, s)
    expect(s.local.getItem(PASSCODE_STORAGE_KEY)).toBeNull()
    forgetPasscode(s)
    expect(readPasscode(s)).toBeNull()
    expect(s.session.length + s.local.length).toBe(0)
  })

  it('lives apart from the key: forgetting one leaves the other', () => {
    const s = stores()
    saveKey(FAKE_KEY, false, s)
    savePasscode(PASSCODE, false, s)
    forgetPasscode(s)
    expect(readCredential({ kind: 'own' }, s)).toEqual({ kind: 'own', key: FAKE_KEY, kept: false })
  })

  it('is only remembered where the browser allows it', () => {
    const s = { session: new BlockedStorage(), local: new MemoryStorage() }
    expect(savePasscode(PASSCODE, false, s)).toBe(false)
    expect(readPasscode(s)).toBeNull()
    expect(savePasscode(PASSCODE, false, { session: null, local: null })).toBe(false)
  })

  it('is not offered to keep on this device where other sites share the address', async () => {
    const { sharedKeepNote } = await import('@/ask/ui/model')
    for (const h of ['unique-name27.github.io', 'UNIQUE-NAME27.GITHUB.IO.', 'team.gitlab.io'])
      expect(sharedHost(h), h).toBe(true)
    for (const h of [
      'census.example.com',
      'localhost',
      'unique-name27.github.io.example.com',
      'github.io',
      '',
    ])
      expect(sharedHost(h), h).toBe(false)
    expect(sharedKeepNote('census.example.com', false, 'passcode', true)).toBeNull()
    const host = 'unique-name27.github.io'
    expect(sharedKeepNote(host, true, 'passcode', false)).toEqual({
      offer: true,
      note: 'Every site published at unique-name27.github.io can read what Census keeps in this browser. Turn this on only if you trust every site there; otherwise the passcode is kept for this tab only.',
    })
    // Already kept: the switch stays, so it can be turned off.
    expect(sharedKeepNote(host, true, 'key', true)).toEqual({
      offer: true,
      note: 'Every site published at unique-name27.github.io can read what Census keeps in this browser. Turn this off to keep the key for this tab only.',
    })
    for (const n of [sharedKeepNote(host, true, 'key', true), sharedKeepNote(host, true, 'passcode', false)])
      expect(n?.note.includes('—')).toBe(false)
  })

  it('is 4 to 256 visible characters, the relay’s own minimum', () => {
    expect(MIN_PASSCODE_LENGTH).toBe(4)
    for (const ok of [
      PASSCODE,
      'correct horse battery staple',
      '1234',
      'x'.repeat(12),
      `  ${'y'.repeat(256)}  `,
    ])
      expect(looksLikePasscode(ok), ok).toBe(true)
    for (const bad of ['', '123', 'x'.repeat(3), 'x'.repeat(257), 'passcode-with-é-0000', 'tab\there-000000'])
      expect(looksLikePasscode(bad), bad).toBe(false)
  })

  it('is never part of the settings file, and the Developer page never shows or copies it', async () => {
    const local = new MemoryStorage()
    const s = { session: new MemoryStorage(), local }
    savePasscode(PASSCODE, true, s)
    saveOwnKeyChoice(true, local)
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, local)
    const file = await settingsBlob(loadSettings(local)).text()
    expect(file).toContain('dark')
    expect(file).not.toContain(PASSCODE)
    expect(file).not.toContain(SOURCE_STORAGE_KEY)
    expect(local.dump()).toContain(PASSCODE)
    expect(safeValue(PASSCODE_STORAGE_KEY, PASSCODE)).toBe('set')
    expect(safeValue(PASSCODE_STORAGE_KEY, null)).toBe('not set')
    expect(canCopyValue(PASSCODE_STORAGE_KEY)).toBe(false)
    expect(describeKey(SOURCE_STORAGE_KEY)?.secret).toBeUndefined()
  })

  it('is scanned as "set", so the Developer page cannot tell its length (nor the key’s)', () => {
    const rowsOf = (passcode: string, key: string) =>
      storageRows({
        local: [{ key: PASSCODE_STORAGE_KEY, value: scannedValue(PASSCODE_STORAGE_KEY, passcode) }],
        session: [{ key: 'census:ask-key', value: scannedValue('census:ask-key', key) }],
        indexedDb: [],
      })
    expect(scannedValue(PASSCODE_STORAGE_KEY, PASSCODE)).toBe('set')
    expect(scannedValue('census:ask-key', FAKE_KEY)).toBe('set')
    expect(scannedValue(PASSCODE_STORAGE_KEY, null)).toBeNull()
    expect(scannedValue(SOURCE_STORAGE_KEY, 'own')).toBe('own')
    expect(rowsOf(PASSCODE, FAKE_KEY)).toEqual(rowsOf(`${PASSCODE}-and-much-longer`, `${FAKE_KEY}-longer`))
  })
})

describe('the relay and Census stay in step', () => {
  it('offers the models Ask offers, at the max_tokens Ask uses, with the betas Ask sends', () => {
    expect([...DEFAULTS.models]).toEqual(MODELS.map((m) => m.id))
    expect(DEFAULTS.maxTokens).toBe(MAX_TOKENS)
    expect([...DEFAULTS.betas]).toEqual([FALLBACK_BETA])
    expect(RELAY_HEADER).toBe(PASSCODE_HEADER)
    // The deployed relay allows the published site and never the dev server.
    expect([...DEFAULTS.origins]).toEqual(['https://unique-name27.github.io'])
  })

  it('sets the same rules in wrangler.toml', () => {
    const toml = readFileSync(join(root, 'ask-relay/wrangler.toml'), 'utf8').replace(/\r\n/g, '\n')
    // The vars of a section: from its header to the next one.
    const section = (header: string) => {
      const lines = toml.split('\n')
      const from = lines.indexOf(header)
      const rest = from < 0 ? [] : lines.slice(from + 1)
      const end = rest.findIndex((l) => l.startsWith('['))
      const body = (end < 0 ? rest : rest.slice(0, end)).join('\n')
      return Object.fromEntries([...body.matchAll(/^([A-Z_]+) = "([^"]*)"$/gm)].map((m) => [m[1], m[2]]))
    }
    const vars = section('[vars]')
    expect(vars.ALLOWED_ORIGINS?.split(',')).toEqual([...DEFAULTS.origins])
    // Only the relay run on this computer allows the dev server; only the deployed version answers.
    expect(section('[env.local.vars]')).toEqual({ ALLOWED_ORIGINS: 'http://localhost:8820' })
    expect(toml).toMatch(/^preview_urls = false$/m)
    expect(toml).toMatch(/^workers_dev = true$/m)
    expect(vars.ALLOWED_MODELS?.split(',')).toEqual([...DEFAULTS.models])
    expect(vars.ALLOWED_BETAS?.split(',')).toEqual([...DEFAULTS.betas])
    expect(Number(vars.MAX_TOKENS)).toBe(DEFAULTS.maxTokens)
    expect(Number(vars.MAX_BODY_BYTES)).toBe(DEFAULTS.maxBodyBytes)
    // No secret is ever written there.
    expect(toml).not.toMatch(/^\s*(ANTHROPIC_API_KEY|CENSUS_PASSCODE)\s*=/m)
    expect(toml).not.toMatch(/sk-ant-/)
  })

  it('publishes the file Census reads, and the one-file build embeds it', () => {
    expect(RELAY_TARGET).toBe(RELAY_FILE_NAME)
    const boot = readFileSync(join(root, 'src/ask/ui/relayBoot.ts'), 'utf8')
    expect(boot).toContain(`import.meta.glob<string>('/${RELAY_SOURCE}'`)
  })

  it('refuses to deploy a relay file Census would not use, or a census.html built without it', () => {
    const file = (relayUrl: string) => JSON.stringify({ relayUrl })
    const html = `<script>const r=${JSON.stringify(file(RELAY))}</script>`
    expect(relayProblem(file(RELAY), html)).toBeNull()
    expect(relayProblem(file(RELAY), '<script></script>')).toMatch(/^census\.html was built without/)
    for (const [text, problem] of [
      ['{', /not valid JSON/],
      ['{}', /no relayUrl/],
      [file('nope'), /not a web address/],
      [file('http://census.example.com'), /does not start with https/],
      [file('http://localhost:8787'), /does not start with https/],
      [file(`${RELAY}?x=1`), /more than the relay's address/],
      [file(`${RELAY}/v1/messages`), /with \/v1 in it/],
      [JSON.stringify({ relayUrl: RELAY, passcode: PASSCODE }), /holds more than relayUrl \(passcode\)/],
      [
        JSON.stringify({ relayUrl: RELAY, note: 'dev', team: 'hr' }),
        /holds more than relayUrl \(note, team\)/,
      ],
      [JSON.stringify({ relayUrl: RELAY, apiKey: 'sk-ant-fake' }), /looks like a Claude API key/],
      [JSON.stringify({ relayUrl: `${RELAY}/SK-ANT-fake` }), /looks like a Claude API key/],
    ] as const) {
      expect(relayProblem(text, html), text).toMatch(problem)
      // What the deploy refuses, Census would not use on the published site either.
      const r = readRelayFile(text)
      if (r.ok) expect(r.relayUrl.startsWith('http://')).toBe(true)
    }
  })
})

describe('the words with a team relay', () => {
  it('say where the questions go and what is kept, in the house style', async () => {
    const { passcodeLine } = await import('@/ask/ui/model')
    const { privacyLine, whatIsSent, PRIVACY_LINE } = await import('./copy')
    const { NO_KEY, NO_PASSCODE } = await import('./errors')
    expect(passcodeLine(null)).toBe('No passcode yet. Nothing is sent until you add one.')
    expect(passcodeLine({ kept: false })).toBe('Using the team passcode, kept for this tab only.')
    expect(passcodeLine({ kept: true })).toBe(
      'Using the team passcode, kept on this device until you forget it.',
    )
    expect(privacyLine('own')).toBe(PRIVACY_LINE)
    expect(privacyLine('team')).toContain('through your team’s relay')
    expect(whatIsSent('team').join(' ')).toContain('keeps no copy')
    expect(whatIsSent('team').join(' ')).toContain('The passcode is kept for this tab')
    expect(NO_PASSCODE).toMatchObject({ kind: 'no_passcode', title: 'Ask uses your team’s passcode.' })
    expect(NO_KEY.kind).toBe('no_key')
    for (const s of [privacyLine('team'), ...whatIsSent('team'), NO_PASSCODE.title, NO_PASSCODE.detail])
      expect(s.includes('—'), s).toBe(false)
  })
})

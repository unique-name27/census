/**
 * What the dev server (`npm run dev`) refuses to serve (scripts/devServer.mjs, vite.config.ts): the
 * Ask relay's local secrets in ask-relay/.dev.vars sit inside the folder it serves, and Vite's own
 * list of denied files does not name them. The list is matched here the way Vite matches it.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEV_SERVER_DENY } from '../../../scripts/devServer.mjs'

const root = join(__dirname, '../../..')

type Matcher = (path: string) => boolean
const picomatch = createRequire(import.meta.url)('picomatch') as (
  patterns: string[],
  options: { matchBase: boolean; nocase: boolean; dot: boolean },
) => Matcher

/** Vite 8's `fsDenyGlob`: a pattern with no slash matches in any folder. */
const denied = picomatch(
  DEV_SERVER_DENY.map((p) => (p.includes('/') ? p : `**/${p}`)),
  { matchBase: false, nocase: true, dot: true },
)

describe('the dev server', () => {
  it('never serves the relay’s local secrets, nor what Vite refuses on its own', () => {
    for (const path of [
      `${root}/ask-relay/.dev.vars`,
      `${root}/ask-relay/.dev.vars.local`,
      `${root}/ask-relay/.DEV.VARS`,
      `${root}/ask-relay/.wrangler/state/v3/d1.sqlite`,
      `${root}/.env`,
      `${root}/.env.production`,
      `${root}/ask-relay/.env`,
      `${root}/certs/dev.pem`,
      `${root}/.npmrc`,
      `${root}/.git/config`,
    ])
      expect(denied(path.replace(/\\/g, '/')), path).toBe(true)
  })

  it('still serves the app', () => {
    for (const path of [
      `${root}/index.html`,
      `${root}/src/main.tsx`,
      `${root}/public/ask-relay.json`,
      `${root}/ask-relay/src/handler.ts`,
    ])
      expect(denied(path.replace(/\\/g, '/')), path).toBe(false)
  })

  it('keeps Vite’s own list, and vite.config.ts uses this one', () => {
    for (const p of [
      '.env',
      '.env.*',
      '*.{crt,pem,key,p12,pfx,cer,der}',
      '.npmrc',
      '.yarnrc.yml',
      '**/.git/**',
    ])
      expect(DEV_SERVER_DENY).toContain(p)
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8')
    expect(config).toContain("import { DEV_SERVER_DENY } from './scripts/devServer.mjs'")
    expect(config).toContain('server: { fs: { deny: DEV_SERVER_DENY } }')
  })
})

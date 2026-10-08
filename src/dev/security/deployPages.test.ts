/**
 * Publishing the policy file with the site (docs/SECURITY-CENTER.md, "Publish and load"):
 * `npm run deploy` puts `public/access-policy.json` beside index.html on gh-pages when it exists,
 * and refuses a census.html that was built without it (the one-file build embeds the file) or a
 * file Census would ignore. The file list is pure (scripts/pagesFiles.mjs), so it is checked here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildPolicyFile,
  checksumOf,
  POLICY_FORMAT as FORMAT,
  POLICY_FILE_NAME,
  POLICY_FORMAT_VERSION,
  policyFileText,
} from '@/access/overrides'
import {
  POLICY_FORMAT,
  POLICY_SOURCE,
  POLICY_TARGET,
  POLICY_VERSION,
  pagesFiles,
  policyChecksum,
  policyProblem,
} from '../../../scripts/pagesFiles.mjs'

const root = join(__dirname, '../../..')

describe('the Pages deploy', () => {
  it('puts public/ask-relay.json beside index.html when it exists (the team relay for Ask)', () => {
    const files = pagesFiles((p) => p === 'public/ask-relay.json')
    expect(files.map((f) => f.to)).toEqual(['index.html', 'census.html', '.nojekyll', 'ask-relay.json'])
    expect(files.at(-1)).toEqual({ from: 'public/ask-relay.json', to: 'ask-relay.json' })
    const both = pagesFiles(() => true).map((f) => f.to)
    expect(both).toEqual(['index.html', 'census.html', '.nojekyll', 'access-policy.json', 'ask-relay.json'])
  })

  it('publishes the one-file build as index.html and census.html, with no policy file when there is none', () => {
    expect(pagesFiles(() => false)).toEqual([
      { from: 'census.html', to: 'index.html' },
      { from: 'census.html', to: 'census.html' },
      { from: null, to: '.nojekyll' },
    ])
  })

  it('puts public/access-policy.json beside index.html when it exists', () => {
    const asked: string[] = []
    const files = pagesFiles((p) => {
      asked.push(p)
      return p === 'public/access-policy.json'
    })
    expect(asked).toEqual(['public/access-policy.json', 'public/ask-relay.json'])
    expect(files.map((f) => f.to)).toEqual(['index.html', 'census.html', '.nojekyll', 'access-policy.json'])
    expect(files.at(-1)).toEqual({ from: 'public/access-policy.json', to: 'access-policy.json' })
    // The name Census fetches beside the page, and the file the one-file build embeds.
    expect(POLICY_TARGET).toBe(POLICY_FILE_NAME)
    const boot = readFileSync(join(__dirname, 'boot.ts'), 'utf8')
    expect(boot).toContain(`import.meta.glob<string>('/${POLICY_SOURCE}'`)
  })

  it('publishes a policy file only with a census.html that embeds it', () => {
    const file = buildPolicyFile({
      lines: [
        {
          role: 'finance',
          surface: 'view:ai',
          decision: 'hidden',
          reason: 'Not needed',
          by: 'QA',
          at: '2026-10-08T09:00:00.000Z',
        },
      ],
      publishedBy: 'QA',
      notes: '',
      now: new Date('2026-10-08T09:00:00.000Z'),
    })
    const text = policyFileText(file)
    // The one-file build inlines the file's text as a string, so its checksum is in the page.
    const embedded = `<script>const p=${JSON.stringify(text)}</script>`
    expect(policyProblem(text, embedded)).toBeNull()
    expect(policyProblem(text, '<script></script>')).toMatch(/^census\.html was built without/)
  })

  it('refuses a file whose checksum does not match, or whose format version Census does not read', () => {
    expect(POLICY_FORMAT).toBe(FORMAT)
    expect(POLICY_VERSION).toBe(POLICY_FORMAT_VERSION)
    const file = buildPolicyFile({
      lines: [
        {
          role: 'finance',
          surface: 'view:ai',
          decision: 'hidden',
          reason: 'Zürich team asked',
          by: 'QA',
          at: '2026-10-08T09:00:00.000Z',
          how: 'x',
        },
      ],
      publishedBy: 'QA',
      notes: 'Notes',
      now: new Date('2026-10-08T09:00:00.000Z'),
    })
    // The script's checksum is Census's.
    expect(policyChecksum(file as never)).toBe(checksumOf(file))
    expect(policyChecksum(file as never)).toBe(file.checksum)
    const page = (t: string) => `<script>const p=${JSON.stringify(t)}</script>`
    // Edited by hand after publishing: the checksum no longer matches.
    const edited = policyFileText({ ...file, overrides: [{ ...file.overrides[0], decision: 'shown' }] })
    expect(policyProblem(edited, page(edited))).toMatch(/checksum that does not match its contents/)
    // Another format version.
    const v2 = policyFileText({ ...file, version: 2 })
    expect(policyProblem(v2, page(v2))).toMatch(/format version 2, and this Census reads version 1/)
    const noList = JSON.stringify({ ...file, overrides: undefined })
    expect(policyProblem(noList, page(noList))).toMatch(/no list of overrides/)
    expect(policyProblem(policyFileText(file), page(policyFileText(file)))).toBeNull()
  })

  it('refuses a policy file Census would ignore', () => {
    expect(policyProblem('{ not json', '')).toMatch(/not valid JSON/)
    expect(policyProblem('{"format":"something-else"}', '')).toMatch(/not a Census access policy file/)
    expect(policyProblem('{"format":"census-access-policy","version":1,"overrides":[]}', '')).toMatch(
      /no checksum/,
    )
    for (const t of [policyProblem('{ not json', ''), policyProblem('{"format":"census-access-policy"}', '')])
      expect(t?.includes('—')).toBe(false)
  })

  it('is what the deploy script copies', () => {
    const script = readFileSync(join(root, 'scripts/deploy-pages.mjs'), 'utf8')
    expect(script).toContain("from './pagesFiles.mjs'")
    expect(script).toMatch(/for \(const f of files\)/)
    expect(script).toMatch(/policyProblem\(/)
  })
})

/**
 * The Ask tools console (docs/ROLES.md, 5.5 and 6.8 test 7): every tool runs with its example
 * input against a client that throws if called (and a network that throws), in HR, Developer and
 * Manager mode; what comes back is exactly what `runTool` would send; the module never imports the
 * client; input checks follow each tool's schema.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Calling Claude in any way fails the test: the client module and the network both throw.
vi.mock('@/ask/engine/client', () => ({
  createAnthropicClient: () => {
    throw new Error('The console must never create a client')
  },
}))

import { leaderOptions } from '@/app/filterOptions'
import { envOf, sampleCtx } from '@/ask/engine/testkit'
import { runTool, TOOL_DEFINITIONS, TOOL_NAMES } from '@/ask/engine/tools'
import {
  CONSOLE_NOTE,
  checkInput,
  exampleText,
  freshConversation,
  parseInput,
  prettyJson,
  refsIn,
  runInConsole,
  TOOL_EXAMPLES,
  toolDefinition,
  withNames,
} from './askConsole'

const fetchSpy = vi.fn(() => {
  throw new Error('The console must never call the network')
})

beforeAll(() => {
  vi.stubGlobal('fetch', fetchSpy)
})
afterAll(() => {
  vi.unstubAllGlobals()
})

const hr = sampleCtx()
const developer = sampleCtx({ access: { mode: 'developer' } })
const leaders = leaderOptions(hr.org, hr.asOf)
const mid = leaders.find((l) => l.size >= 25 && l.size <= 90)!
const manager = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })

describe('the Ask tools console', () => {
  it('has a working example for every tool, and each fits its schema', () => {
    expect(Object.keys(TOOL_EXAMPLES).sort()).toEqual([...TOOL_NAMES].sort())
    for (const name of TOOL_NAMES) expect(checkInput(name, exampleText(name)), name).toEqual([])
  })

  it('runs every tool with its example in every mode without calling Claude', () => {
    for (const [mode, ctx] of [
      ['hr', hr],
      ['developer', developer],
      ['manager', manager],
    ] as const)
      for (const name of TOOL_NAMES) {
        const out = runInConsole(name, exampleText(name), envOf(ctx))
        expect(() => JSON.parse(out.content), `${mode} ${name}`).not.toThrow()
        expect(out.pretty, `${mode} ${name}`).toBe(JSON.stringify(JSON.parse(out.content), null, 2))
        expect(out.label.length, `${mode} ${name}`).toBeGreaterThan(0)
        // Developer and HR run every tool; Manager mode refuses explain_quality, as Ask does.
        if (mode === 'manager' && name === 'explain_quality') expect(out.isError).toBe(true)
        else expect(out.isError, `${mode} ${name}: ${out.content.slice(0, 200)}`).toBe(false)
      }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends exactly what Ask would: the same text as runTool in a fresh conversation', () => {
    for (const name of TOOL_NAMES) {
      const input = JSON.parse(exampleText(name))
      const direct = runTool(name, input, envOf(hr), freshConversation())
      const viaConsole = runInConsole(name, exampleText(name), envOf(hr))
      expect(viaConsole.content, name).toBe(direct.content)
    }
  })

  it('keeps people as tokens in what is sent, and shows names only on request', () => {
    const out = runInConsole('get_context', '{}', envOf(hr))
    expect(out.content).toMatch(/\{\{P\d+\}\}/)
    const named = withNames(out.pretty, out.conversation.tokens)
    expect(named).not.toMatch(/\{\{P\d+\}\}/)
    // A name the tokens stand for is in the named text, never in what is sent.
    const someone = out.conversation.tokens.resolve('P1')
    if (someone) {
      expect(named).toContain(someone.name)
      expect(out.content.includes(someone.name)).toBe(false)
    }
  })

  it('lists the record refs a result hands out, and they open records', () => {
    const out = runInConsole('view_summary', exampleText('view_summary'), envOf(hr))
    expect(out.refs.length).toBeGreaterThan(0)
    for (const ref of out.refs) expect(out.conversation.refs.has(ref), ref).toBe(true)
    expect(refsIn('{"ref":"r2","a":["r10","r2"],"b":"r0"}')).toEqual(['r2', 'r10'])
  })

  it('checks inputs against the schema', () => {
    expect(checkInput('view_summary', '{}')).toEqual(['view is required.'])
    expect(checkInput('view_summary', '{"view":"nope"}')[0]).toMatch(/^view should be one of/)
    expect(checkInput('query_records', '{"dataset":"employees","limit":500}')).toEqual([
      'limit should be at most 50.',
    ])
    expect(checkInput('open_items', '{"extra":1}')).toEqual(['extra is not an input of this tool.'])
    expect(checkInput('find_metrics', '{"query": 3}')).toEqual(['query should be a string.'])
    expect(checkInput('get_context', '{oops')[0]).toMatch(/^The input is not valid JSON/)
    expect(checkInput('nope', '{}')).toEqual(['There is no tool "nope".'])
    expect(parseInput('  ')).toEqual({ ok: true, value: {} })
  })

  it('returns bad JSON as an error result, never throwing', () => {
    const out = runInConsole('get_context', '{oops', envOf(hr))
    expect(out.isError).toBe(true)
    expect(JSON.parse(out.content).error).toMatch(/not valid JSON/)
    expect(prettyJson('not json')).toBe('not json')
  })

  it('shows the definition as the mode sends it', () => {
    expect(toolDefinition('explain_quality', { ctx: hr })?.name).toBe('explain_quality')
    expect(toolDefinition('explain_quality', { ctx: manager })).toBeNull()
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([...TOOL_NAMES])
    expect(CONSOLE_NOTE).toBe('Runs the tool in this browser. Nothing is sent to Anthropic.')
  })

  it('never imports the client module or the request loop', () => {
    for (const file of ['askConsole.ts', 'ui/AskConsoleTab.tsx']) {
      const text = readFileSync(join(__dirname, file), 'utf8')
      const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1])
      for (const i of imports) {
        expect(i, file).not.toMatch(/ask\/engine\/(client|loop)$/)
        expect(i, file).not.toBe('@/ask/engine')
        expect(i, file).not.toMatch(/^@anthropic-ai\/sdk$/)
      }
    }
  })
})

/**
 * Developer > Ask tools (docs/ROLES.md, 5.5): run one Ask tool in this browser and see exactly the
 * JSON Claude would get, without calling Claude. Pick a tool, edit its input (prefilled with a
 * working example), check it against the schema, run it with the live context and the current mode
 * in a fresh conversation. "Show names" rehydrates person tokens here; each record ref opens the
 * records panel through the same guard as Ask's answers. Nothing here imports the client module.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import type { ToolEnv } from '@/ask/engine/types'
import { Figure } from '@/charts'
import { IconCopy } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Grid } from '@/components/Section'
import { Button, Switch } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { plural } from '@/lib/format'
import { useActionMarks } from '@/views/actions/ui/store'
import { VIEWS } from '@/views/registry'
import {
  CONSOLE_NOTE,
  CONSOLE_TOOLS,
  type ConsoleRun,
  checkInput,
  exampleText,
  runInConsole,
  toolDefinition,
  withNames,
} from '../askConsole'
import { useDev } from '../store'
import { devTab } from '../tabs'
import { ABOUT_APP, copyText, ListPicker, PRE, StatusLine } from './shared'

type Problems = { tool: string; list: string[] } | null

export function AskConsoleTab({ sub }: { sub: string }) {
  const ctx = useAnalytics()
  const seed = useDev((s) => s.consoleSeed)
  const tool = CONSOLE_TOOLS.includes(sub) ? sub : CONSOLE_TOOLS[0]
  const [input, setInput] = useState(() => exampleText(tool))
  const [problems, setProblems] = useState<Problems>(null)
  const [result, setResult] = useState<ConsoleRun | null>(null)
  const [names, setNames] = useState(false)
  const [runs, setRuns] = useState<{ tool: string; ms: number; error: string; bytes: number; at: string }[]>(
    [],
  )
  const inputId = useId()

  // A new tool starts from its example; "Open in console" brings its own input.
  useEffect(() => {
    setInput(exampleText(tool))
    setProblems(null)
    setResult(null)
  }, [tool])
  // "Open in console" (What was sent): take the request once, open its tool, then its input.
  const [pending, setPending] = useState<{ tool: string; input: string } | null>(null)
  useEffect(() => {
    if (!seed) return
    useDev.setState({ consoleSeed: null })
    setPending({ tool: seed.tool, input: seed.input })
    if (seed.tool !== tool) goTo('dev', devTab('ask', seed.tool))
  }, [seed, tool])
  // After the tool's own example (the effect above it), so the seeded input wins.
  useEffect(() => {
    if (!pending || pending.tool !== tool) return
    setInput(pending.input)
    setPending(null)
  }, [pending, tool])

  const def = toolDefinition(tool, { ctx })
  const schema = useMemo(() => (def ? JSON.stringify(def.input_schema, null, 2) : ''), [def])
  const env = (): ToolEnv => ({ ctx, views: VIEWS, marks: useActionMarks.getState().marks, now: Date.now() })

  const run = () => {
    const out = runInConsole(tool, input, env())
    setResult(out)
    setRuns((r) =>
      [
        {
          tool,
          ms: Math.round(out.ms * 10) / 10,
          error: out.isError ? 'Yes' : 'No',
          bytes: out.content.length,
          at: new Date().toLocaleTimeString('en-GB'),
        },
        ...r,
      ].slice(0, 50),
    )
  }
  const shownText = result
    ? names
      ? withNames(result.pretty, result.conversation.tokens)
      : result.pretty
    : ''

  return (
    <>
      <div className="flex flex-col gap-3">
        <ListPicker
          label="Ask tool"
          value={tool}
          options={CONSOLE_TOOLS.map((t) => ({ value: t, label: t }))}
          onChange={(t) => goTo('dev', devTab('ask', t))}
        />
      </div>
      <Grid className="mt-4">
        <section
          aria-labelledby="dev-ask-schema-title"
          className="col-span-full flex min-w-0 flex-col self-start rounded-sheet bg-sheet lg:col-span-5"
        >
          <header className="border-b border-rule px-4 pt-4 pb-3 lg:px-5">
            <h2 id="dev-ask-schema-title" className="cut-head text-title font-semibold">
              <code className="font-mono">{tool}</code>
            </h2>
            <p className="mt-1 text-small text-ink-2">
              {def
                ? def.description
                : 'This mode leaves the tool out of what is sent to Claude, and refuses it if called. Run it to see the refusal.'}
            </p>
          </header>
          <div className="px-4 pt-3 pb-5 lg:px-5">
            <p className="text-meta font-medium text-ink-2">Input schema, as sent in this mode</p>
            <pre className={`${PRE} mt-1 max-h-96`}>{schema || 'Not sent in this mode.'}</pre>
          </div>
        </section>
        <section
          aria-labelledby="dev-ask-input-title"
          data-tour="dev-ask-console"
          className="col-span-full flex min-w-0 flex-col self-start rounded-sheet bg-sheet lg:col-span-7"
        >
          <header className="border-b border-rule px-4 pt-4 pb-3 lg:px-5">
            <h2 id="dev-ask-input-title" className="cut-head text-title font-semibold">
              Input
            </h2>
          </header>
          <div className="flex flex-col gap-3 px-4 pt-3 pb-5 lg:px-5">
            <label htmlFor={inputId} className="text-meta font-medium text-ink-2">
              JSON input for {tool}
            </label>
            <textarea
              id={inputId}
              value={input}
              spellCheck={false}
              onChange={(e) => {
                setInput(e.target.value)
                setProblems(null)
              }}
              rows={10}
              className="min-h-40 w-full rounded-control bg-sheet-2 p-3 font-mono text-meta text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]"
            />
            {problems &&
              (problems.list.length ? (
                <ul className="flex flex-col gap-1 text-small text-bad-text">
                  {problems.list.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-good-text">The input fits the schema.</p>
              ))}
            <p className="text-meta text-muted">{CONSOLE_NOTE}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={run}>
                Run here
              </Button>
              <Button onClick={() => setProblems({ tool, list: checkInput(tool, input) })}>
                Check input
              </Button>
              <Button variant="ghost" onClick={() => setInput(exampleText(tool))}>
                Reset to the example
              </Button>
            </div>
          </div>
        </section>
      </Grid>
      {result && (
        <Grid className="mt-4">
          <section
            aria-labelledby="dev-ask-result-title"
            className="col-span-full min-w-0 rounded-sheet bg-sheet"
          >
            <header className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-rule px-4 pt-4 pb-3 lg:px-5">
              <div className="min-w-0 flex-1">
                <h2 id="dev-ask-result-title" className="cut-head text-title font-semibold">
                  What Claude would get
                </h2>
                <p className="mt-1 text-small text-ink-2">
                  {result.label}. {result.ms < 1 ? 'Under 1 ms' : `${Math.round(result.ms)} ms`},{' '}
                  {result.isError ? 'returned an error' : 'returned a result'},{' '}
                  {plural(result.content.length, 'character')}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Switch checked={names} onChange={setNames} label="Show names" />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconCopy />}
                  onClick={() => void copyText(result.content, 'the exact text sent')}
                >
                  Copy as sent
                </Button>
              </div>
            </header>
            <div className="flex flex-col gap-3 px-4 pt-3 pb-5 lg:px-5">
              {names && (
                <StatusLine>
                  Names are shown here only. What is sent keeps the tokens, such as {'{{P12}}'}.
                </StatusLine>
              )}
              <pre className={PRE}>{shownText}</pre>
              {result.refs.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-meta font-medium text-ink-2">Record refs in the result</p>
                  <ul className="flex flex-wrap gap-2">
                    {result.refs.map((ref) => (
                      <li key={ref}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => drill(result.conversation.refs.resolve(ref) ?? null)}
                        >
                          Open records {ref}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </Grid>
      )}
      <Grid className="mt-4">
        <Figure
          id="dev-ask-runs"
          title="Runs in this console"
          subtitle="Each run this visit, newest first"
          data={runs}
          columns={[
            { key: 'at', label: 'Time' },
            { key: 'tool', label: 'Tool' },
            { key: 'ms', label: 'ms', format: 'num1' },
            { key: 'error', label: 'Error' },
            { key: 'bytes', label: 'Characters sent', format: 'int' },
          ]}
          definitions={[ABOUT_APP]}
          gate={false}
          span={12}
          tableOnly
          empty={runs.length ? null : 'No tool has run here yet.'}
          emptyHeight={120}
        />
      </Grid>
    </>
  )
}

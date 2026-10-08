/**
 * In force (docs/SECURITY-CENTER.md): which policy file is loaded (version, published by, date,
 * notes, checksum) or "Built-in defaults"; a file that was ignored and why; the lines left out one
 * by one; and, in the one-file build, whether a policy was embedded when it was built.
 */
import { MODE_LABEL } from '@/access/modes'
import { isPolicyRole, POLICY_FILE_NAME } from '@/access/overrides'
import { Figure } from '@/charts'
import { Grid } from '@/components/Section'
import { SeverityIcon } from '@/components/ui'
import { plural } from '@/lib/format'
import { ABOUT_APP } from '../../ui/shared'
import { usePolicy } from '../store'
import { when } from './Changes'

const SKIP_WORD = {
  'unknown-role': 'Unknown role',
  'unknown-surface': 'Unknown surface',
  invalid: 'Not valid',
  guard: 'Guard rail',
  replaced: 'Replaced',
} as const

export function sourceText(source: string, oneFile: boolean): string {
  if (source === 'site') return `${POLICY_FILE_NAME} from this site`
  if (source === 'embedded') return `${POLICY_FILE_NAME}, embedded in this one-file build when it was built`
  return oneFile ? 'Built-in defaults: this one-file build has no policy embedded' : 'Built-in defaults'
}

export function InForce() {
  const f = usePolicy((s) => s.inForce)
  const preview = usePolicy((s) => s.preview)
  const facts: [string, string][] = f.file
    ? [
        ['Published by', f.file.publishedBy || '—'],
        ['Published', when(f.file.publishedAt)],
        ['Format version', String(f.file.version)],
        ['Lines in force', `${f.lines.length}`],
        ['Checksum', f.file.checksum],
      ]
    : [['Lines in force', '0']]
  const skipped = f.skipped.map((s) => ({
    line: s.index + 1,
    role: isPolicyRole(s.role) ? MODE_LABEL[s.role] : s.role || '—',
    surface: s.surface || '—',
    decision: s.decision || '—',
    kind: SKIP_WORD[s.kind],
    why: s.why,
  }))
  return (
    <Grid>
      <section
        aria-labelledby="sec-force-title"
        className="col-span-full rounded-sheet bg-sheet px-4 pt-4 pb-5 lg:px-5"
      >
        <h2 id="sec-force-title" className="cut-head text-title font-semibold">
          In force
        </h2>
        <p className="mt-1 text-body font-semibold text-ink">{sourceText(f.source, f.oneFile)}</p>
        {f.ignored && (
          <p role="alert" className="mt-2 flex items-start gap-2 text-small text-ink">
            <SeverityIcon severity="critical" className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">Census ignored the {POLICY_FILE_NAME} it found.</span>{' '}
              {f.ignored} The built-in defaults are in force.
            </span>
          </p>
        )}
        {preview && (
          <p className="mt-2 text-small text-ink-2">
            This tab is previewing the draft as {MODE_LABEL[preview.role]}; everyone else, and this tab after
            the preview, has what is described here.
          </p>
        )}
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-rule pt-3 sm:grid-cols-[max-content_1fr]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-small text-ink-2">{k}</dt>
              <dd
                className={
                  k === 'Checksum' ? 'm-0 font-mono text-meta break-all text-ink' : 'm-0 text-small text-ink'
                }
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {f.file?.notes && (
          <div className="mt-3 border-t border-rule pt-3">
            <p className="text-small font-semibold text-ink">Notes</p>
            <p className="mt-0.5 max-w-[80ch] text-small whitespace-pre-line text-ink-2">{f.file.notes}</p>
          </div>
        )}
        <p className="mt-3 border-t border-rule pt-3 text-meta text-muted">
          {f.oneFile
            ? 'The one-file build cannot fetch a file: it reads the policy embedded from public/access-policy.json when it was built.'
            : `Census fetches ${POLICY_FILE_NAME} from its own site each time it starts. With no file there, the built-in defaults apply.`}
        </p>
      </section>
      <Figure
        id="dev-security-skipped"
        title="Lines left out"
        subtitle="Lines of the file in force that did not apply, one by one, and why"
        data={skipped}
        columns={[
          { key: 'line', label: 'Line', format: 'int', width: 6 },
          { key: 'role', label: 'Role', width: 16 },
          { key: 'surface', label: 'Surface', width: 30 },
          { key: 'decision', label: 'Decision', width: 10 },
          { key: 'kind', label: 'Kind', width: 14 },
          { key: 'why', label: 'Why', width: 60 },
        ]}
        definitions={[ABOUT_APP]}
        note={plural(skipped.length, 'line')}
        gate={false}
        span={12}
        tableOnly
        table={{ maxRows: 20 }}
        empty={
          skipped.length
            ? null
            : f.file
              ? 'Every line of the file in force applies.'
              : 'No policy file is in force.'
        }
      />
    </Grid>
  )
}

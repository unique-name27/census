/**
 * Certify: the checklist a certification rests on, optional control totals that must reconcile,
 * the certifier's name and note, Certify or Revoke, and the last versions with their status. A
 * certification is a local attestation in this browser, not a sign-in; it ends when the data
 * is replaced.
 */
import { useId, useState } from 'react'
import { IconClose, IconCritical, IconGood, IconWarning } from '@/components/icons'
import { TABLE_HEAD } from '@/components/styles'
import { TierBadge } from '@/components/tier/TierBadge'
import { toast } from '@/components/toast'
import { Button, cx, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import {
  CONTROL_METRICS,
  type ControlMetricId,
  type ControlTotal,
  computeControlTotal,
  type DatasetVersion,
  isCertified,
  type QualityIndex,
} from '@/data/quality'
import type { DatasetKey, Datasets } from '@/data/schema'
import { useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import {
  CONTROL_LABEL,
  type ControlDraft,
  certificationText,
  certifyChecklist,
  certifyOutcomeText,
  checkControl,
  controlChoices,
  controlValueText,
  draftsOff,
  draftsUnusable,
  expectedError,
  historyRows,
  newControlDraft,
  parseAmount,
  parseTolerance,
  type Readiness,
  readiness,
  revokeText,
  validateControls,
} from '../../engine/certify'
import type { ManifestRow } from '../../engine/manifest'
import { loadReviewerName, saveReviewerName } from '../../state/room'
import { Select } from '../Select'
import { INPUT } from './MappingPanel'
import { RuleList } from './RuleList'

const pctText = (share: number | null) => (share == null ? '—' : fmt(share, share < 0.1 ? 'pct2' : 'pct'))

/** Expected, in the data and the result for one control total. */
function ControlResult({
  metric,
  expected,
  actual,
  tolerance,
  showPay,
}: {
  metric: ControlMetricId
  expected: number | null
  actual: number | null
  tolerance: number
  showPay: boolean
}) {
  const hidden = !!CONTROL_METRICS[metric]?.pay && !showPay
  const c = checkControl(expected, actual, tolerance)
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-2">
      <span>
        In the data:{' '}
        <span className="tnum text-ink">
          {hidden ? 'hidden while pay amounts are off' : controlValueText(metric, actual)}
        </span>
      </span>
      {c.reconciles === true && <StatusPill severity="good" label="Reconciles" />}
      {c.reconciles === false && <StatusPill severity="critical" label={`Off by ${pctText(c.diffShare)}`} />}
    </span>
  )
}

function DraftRow({
  draft,
  choices,
  dataKey,
  data,
  asOf,
  error,
  onChange,
  onRemove,
}: {
  draft: ControlDraft
  choices: readonly ControlMetricId[]
  dataKey: DatasetKey
  data: Datasets
  asOf: string
  error?: string
  onChange: (d: ControlDraft) => void
  onRemove: () => void
}) {
  const showPay = useCensus((s) => s.showPay)
  const id = useId()
  const actual = computeControlTotal(draft.metric, data, dataKey, asOf)
  const tolerance = parseTolerance(draft.tolerance)
  // Text that is not a number says so as it is typed; the submit check adds a blank one.
  const message = expectedError(draft.expected) ?? error
  return (
    <li className="rounded-control bg-sheet-2 px-3 py-2.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_120px_80px_auto]">
        <span className="block min-w-0">
          <span className="block text-meta font-medium text-ink-2" aria-hidden="true">
            Number
          </span>
          <Select
            label="Number to reconcile"
            value={draft.metric}
            onChange={(v) => onChange({ ...draft, metric: v as ControlMetricId })}
            className="mt-1 w-full"
          >
            {choices.map((m) => (
              <option key={m} value={m}>
                {CONTROL_METRICS[m].label}
              </option>
            ))}
          </Select>
        </span>
        <label className="block min-w-0">
          <span className="block text-meta font-medium text-ink-2">Label</span>
          <input
            value={draft.label}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
            placeholder={CONTROL_LABEL[draft.metric]}
            className={cx(INPUT, 'mt-1 w-full')}
          />
        </label>
        <label className="block min-w-0">
          <span className="block text-meta font-medium text-ink-2">Expected</span>
          <input
            value={draft.expected}
            inputMode="decimal"
            onChange={(e) => onChange({ ...draft, expected: e.target.value })}
            placeholder="From your report"
            aria-invalid={!!message || undefined}
            aria-describedby={message ? `${id}-e` : undefined}
            className={cx(INPUT, 'tnum mt-1 w-full')}
          />
        </label>
        <label className="block min-w-0">
          <span className="block text-meta font-medium text-ink-2">Allowed, %</span>
          <input
            value={draft.tolerance}
            inputMode="decimal"
            onChange={(e) => onChange({ ...draft, tolerance: e.target.value })}
            className={cx(INPUT, 'tnum mt-1 w-full')}
          />
        </label>
        <span className="flex items-end">
          <Button
            variant="ghost"
            size="sm"
            icon={<IconClose />}
            onClick={onRemove}
            aria-label="Remove this control total"
          >
            <span className="md:sr-only">Remove</span>
          </Button>
        </span>
      </div>
      <div className="mt-2">
        <ControlResult
          metric={draft.metric}
          expected={parseAmount(draft.expected)}
          actual={actual}
          tolerance={tolerance ?? 0}
          showPay={showPay}
        />
      </div>
      {message && (
        <p id={`${id}-e`} className="mt-1 text-meta text-bad-text">
          {message}
        </p>
      )}
    </li>
  )
}

function CertifyForm({
  row,
  data,
  asOf,
  ready,
}: {
  row: ManifestRow
  data: Datasets
  asOf: string
  ready: Readiness
}) {
  const canCertify = ready.canCertify
  const certify = useCensus((s) => s.certify)
  const showPay = useCensus((s) => s.showPay)
  const [name, setName] = useState(loadReviewerName)
  const [note, setNote] = useState('')
  const [drafts, setDrafts] = useState<ControlDraft[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [seq, setSeq] = useState(0)
  const nameId = useId()
  const noteId = useId()
  const choices = controlChoices(row.key, showPay)
  // What certifying would do with the totals typed so far: a total off by more than allowed keeps it silver.
  const off = draftsOff(drafts, (metric) => computeControlTotal(metric, data, row.key, asOf))
  const outcome = certifyOutcomeText(row.label, ready, off, draftsUnusable(drafts))
  const add = () => {
    const used = new Set(drafts.map((d) => d.metric))
    const metric =
      choices.find((m) => !used.has(m) && m !== 'rows') ?? choices.find((m) => !used.has(m)) ?? choices[0]
    setDrafts([...drafts, newControlDraft(metric, `ct${seq}`)])
    setSeq(seq + 1)
  }
  const submit = () => {
    const v = validateControls(drafts)
    setErrors(v.errors)
    if (Object.keys(v.errors).length) return
    saveReviewerName(name)
    const cert = certify(row.key, { by: name, note, controlTotals: v.totals })
    if (!cert) {
      toast(`${row.label} could not be certified.`, { tone: 'critical' })
      return
    }
    const off = (cert.controlTotals ?? []).filter(
      (t) => !checkControl(t.expected, t.actual ?? null, t.tolerance).reconciles,
    )
    toast(`${row.label} certified`, {
      tone: off.length ? 'neutral' : 'good',
      description: off.length
        ? `${off.map((t) => t.label).join(', ')} ${off.length === 1 ? 'does' : 'do'} not reconcile, so it stays below gold until the data or the total is fixed.`
        : 'Recorded in this browser for this version. Replacing the data ends it.',
    })
  }
  return (
    <form
      className="mt-5 border-t border-rule pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canCertify) submit()
      }}
    >
      <h4 className="eyebrow">Certify this version</h4>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label htmlFor={nameId} className="block min-w-0">
          <span className="block text-meta font-medium text-ink-2">Certified by</span>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name or team"
            autoComplete="name"
            className={cx(INPUT, 'mt-1 w-full')}
          />
        </label>
        <label htmlFor={noteId} className="block min-w-0 sm:col-span-2">
          <span className="block text-meta font-medium text-ink-2">Note (optional)</span>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What you checked, such as “Matches the HRIS headcount report of 30 Sep”"
            className={cx(INPUT, 'mt-1 h-auto w-full py-1.5')}
          />
        </label>
      </div>
      <div className="mt-4">
        <p className="text-small font-medium">Control totals (optional)</p>
        <p className="mt-0.5 text-meta text-muted">
          Numbers from the system of record that the data must match within the allowed difference, 0.5% by
          default. A total that does not reconcile keeps the dataset below gold.
        </p>
        {drafts.length > 0 && (
          <ul className="mt-2 space-y-2">
            {drafts.map((d, i) => (
              <DraftRow
                key={d.id}
                draft={d}
                choices={choices}
                dataKey={row.key}
                data={data}
                asOf={asOf}
                error={errors[d.id]}
                onChange={(next) => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setDrafts(drafts.filter((_, j) => j !== i))}
              />
            ))}
          </ul>
        )}
        <Button size="sm" variant="ghost" className="mt-1.5 -ml-2.5" onClick={add} disabled={!choices.length}>
          Add a control total
        </Button>
      </div>
      {outcome && (
        <p className="mt-4 flex gap-2 text-small text-ink-2">
          {off > 0 || ready.goldAlsoNeeds.length > 0 ? (
            <IconWarning className="mt-0.5 size-3.5 shrink-0 text-warning" />
          ) : (
            <IconGood className="mt-0.5 size-3.5 shrink-0 text-good" />
          )}
          {outcome}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={!canCertify}>
          Certify
        </Button>
        <span className="text-meta text-muted">
          A local record in this browser, not a sign-in. It ends when the data is replaced.
        </span>
      </div>
    </form>
  )
}

function Certified({ row, version, data }: { row: ManifestRow; version: DatasetVersion; data: Datasets }) {
  const ctx = useAnalytics()
  const revoke = useCensus((s) => s.revokeCertification)
  const showPay = useCensus((s) => s.showPay)
  const [asking, setAsking] = useState(false)
  const cert = version.certification
  if (!cert) return null
  const tier = ctx.quality.datasetTier(row.key)
  const totals: ControlTotal[] = cert.controlTotals ?? []
  const asOf = cert.asOf ?? ctx.asOf
  return (
    <div className="mt-5 border-t border-rule pt-4">
      <h4 className="eyebrow">Certification</h4>
      <p className="mt-1.5 text-small">
        {certificationText(version, ctx.asOf.slice(0, 4))}
        {cert.asOf && <span className="text-ink-2"> for data as of {formatDate(cert.asOf)}</span>}.
      </p>
      {cert.note && <p className="mt-1 max-w-[70ch] text-small text-ink-2">“{cert.note}”</p>}
      {totals.length > 0 && (
        <div className="scroll-x mt-3">
          <table className="w-full border-collapse text-small sm:min-w-[520px]">
            <caption className="sr-only">Control totals of the certification</caption>
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className={`${TABLE_HEAD} py-1.5 pr-3`}>
                  Control total
                </th>
                <th scope="col" className={`${TABLE_HEAD} py-1.5 pr-3 text-right`}>
                  Expected
                </th>
                <th scope="col" className={`${TABLE_HEAD} py-1.5 pr-3 text-right`}>
                  In the data
                </th>
                <th scope="col" className={`${TABLE_HEAD} py-1.5`}>
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => {
                const hidden = !!CONTROL_METRICS[t.metric]?.pay && !showPay
                const actual = computeControlTotal(t.metric, data, row.key, asOf)
                const c = checkControl(t.expected, actual, t.tolerance)
                return (
                  <tr key={`${t.metric}|${t.label}`} className="border-b border-rule last:border-b-0">
                    <td className="py-1.5 pr-3 align-top">
                      {t.label}
                      <span className="block text-label text-muted">
                        {CONTROL_METRICS[t.metric]?.label} · within {fmt(t.tolerance, 'pct')}
                      </span>
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right align-top">
                      {hidden ? 'Hidden' : controlValueText(t.metric, t.expected)}
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right align-top">
                      {hidden ? 'Hidden' : controlValueText(t.metric, actual)}
                    </td>
                    <td className="py-1.5 align-top">
                      {c.reconciles ? (
                        <StatusPill severity="good" label="Reconciles" />
                      ) : (
                        <StatusPill severity="critical" label={`Off by ${pctText(c.diffShare)}`} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {totals.some((t) => CONTROL_METRICS[t.metric]?.pay) && !showPay && (
            <p className="mt-1 text-meta text-muted">
              Pay amounts are off, so pay totals show only whether they reconcile.
            </p>
          )}
        </div>
      )}
      {asking ? (
        <fieldset className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-sheet-2 px-3 py-2.5">
          <legend className="sr-only">Confirm revoking</legend>
          <IconWarning className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 basis-[240px] text-small">{revokeText(row.label, tier)}</p>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                revoke(row.key)
                setAsking(false)
                toast(`${row.label} certification revoked`)
              }}
            >
              Revoke
            </Button>
          </span>
        </fieldset>
      ) : (
        <Button className="mt-4" onClick={() => setAsking(true)}>
          Revoke certification
        </Button>
      )}
    </div>
  )
}

function History({ row, version }: { row: ManifestRow; version: DatasetVersion }) {
  const ctx = useAnalytics()
  const history = useCensus((s) => s.history[row.key])
  const rows = historyRows(version, history ?? [], ctx.asOf.slice(0, 4))
  return (
    <div>
      <h4 className="eyebrow">Versions</h4>
      <p className="mt-1 text-meta text-muted">
        The current version and up to three before it. Each load is a new version.
      </p>
      <ol className="mt-2 space-y-2.5">
        {rows.map((h) => (
          <li key={h.versionId} className="border-l-2 border-rule pl-3 text-small">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{h.current ? 'Current' : 'Earlier'}</span>
              <span className="min-w-0 break-words text-ink-2">{h.source}</span>
            </p>
            <p className="tnum text-meta text-ink-2">
              {h.loaded !== '—' ? `Loaded ${h.loaded} · ` : ''}
              {fmt(h.rows, 'int')} {h.rows === 1 ? 'row' : 'rows'}
            </p>
            <p className="text-meta text-ink-2">
              {h.mapping} · {h.certification}
            </p>
            {h.note && !h.current && <p className="text-meta text-muted">“{h.note}”</p>}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function CertifyPanel({
  row,
  version,
  data,
  index,
}: {
  row: ManifestRow
  version: DatasetVersion
  data: Datasets
  index: QualityIndex
}) {
  const ctx = useAnalytics()
  const dq = ctx.quality.dataset(row.key)
  const rules = index.checks(row.key)
  const ready = readiness(rules)
  const certified = isCertified(version)
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-8">
        <div className="flex flex-wrap items-center gap-3">
          <TierBadge tier={dq.tier} explain={ctx.quality.explain(row.key)} />
          <p className="text-small text-ink-2">
            {certified
              ? 'Certified for this version. Replacing the data ends the certification.'
              : dq.tier === 'none'
                ? 'Nothing is loaded to certify.'
                : `Not certified. Gold needs silver, a certification for this version, control totals that reconcile and fresh data.`}
          </p>
        </div>
        <h4 className="eyebrow mt-5">Checklist</h4>
        <RuleList rules={certifyChecklist(rules)} ds={row} data={data} className="mt-2" />
        {!certified && !ready.canCertify && dq.tier !== 'none' && (
          <p className="mt-3 flex gap-2 text-small">
            <IconCritical className="mt-0.5 size-3.5 shrink-0 text-critical" />
            Certifying needs every silver check to pass first:{' '}
            {ready.blocking.map((r) => r.label.toLowerCase()).join(', ')}.
          </p>
        )}
        {certified ? (
          <Certified row={row} version={version} data={data} />
        ) : (
          dq.tier !== 'none' && <CertifyForm row={row} data={data} asOf={ctx.asOf} ready={ready} />
        )}
      </div>
      <div className="min-w-0 lg:col-span-4">
        <History row={row} version={version} />
      </div>
    </div>
  )
}

/**
 * What limits a number's tier, in a few words for the quality lens: the field when the field
 * itself falls short ("Termination type 72% filled"), otherwise its dataset and what the dataset's
 * next tier still needs ("Requisitions: not certified"). Pure.
 */
import type { QualityRules } from '@/data/quality/rules'
import { midSentence } from '@/data/quality/text'
import type { DatasetQuality, FieldStats, Limiting, RuleId } from '@/data/quality/types'
import { datasetDef } from '@/data/schema'
import { shareText } from './share'

/** How a phrase sits in its line. */
export interface PhraseOptions {
  /** After other words ("Limited by termination reason …"): field labels go mid-sentence. */
  mid?: boolean
  /**
   * Said after a share that covers more rows than the number does, e.g. "company-wide" while an
   * org filter is on: tiers and fill rates are judged over the whole dataset.
   */
  scope?: string
}

const labelOf = (label: string, o: PhraseOptions) => (o.mid ? midSentence(label) : label)
const scoped = (text: string, o: PhraseOptions) => (o.scope ? `${text} ${o.scope}` : text)

/** A failing gate in a few words. */
const RULE_SHORT: Partial<Record<RuleId, string>> = {
  'has-rows': 'no rows loaded',
  'mapping-confirmed': 'mapping not confirmed',
  'no-blocking': 'blocking issues remain',
  'issue-rate': 'too many import errors',
  references: 'references do not resolve',
  certified: 'not certified',
  'control-totals': 'control totals do not reconcile',
  fresh: 'not fresh',
}

/** "Requisitions: not certified", "Candidates: mapping not confirmed"; the label alone at gold. */
export function datasetHold(ds: Pick<DatasetQuality, 'label' | 'tier' | 'rules'>): string {
  const gate = ds.tier === 'silver' ? 'gold' : ds.tier === 'gold' ? null : 'silver'
  if (!gate) return ds.label
  const failing = ds.rules.filter((r) => !r.pass && r.gate === gate).flatMap((r) => RULE_SHORT[r.id] ?? [])
  return failing.length ? `${ds.label}: ${failing.join(', ')}` : ds.label
}

/**
 * A field's fill rate, never rounded across the silver bar: "Termination type 94.6% filled". A
 * field whose blanks are normal says so, so its fill never reads as missing data.
 */
export function fillPhrase(
  stats: Pick<FieldStats, 'label' | 'coverage' | 'blankOk'>,
  rules: Pick<QualityRules, 'minCoverage'>,
  o: PhraseOptions = {},
): string {
  const label = labelOf(stats.label, o)
  if (stats.coverage == null) return label
  const share = shareText(
    stats.coverage,
    stats.blankOk ? null : { threshold: rules.minCoverage, side: 'min' },
  )
  return `${scoped(`${label} ${share} filled`, o)}${stats.blankOk ? '; blanks are normal' : ''}`
}

/**
 * What holds the number at its tier: the limiting field when it is capped on its own (thin, values
 * not recognized, remapped after certification, or blank everywhere), otherwise its dataset with
 * the gates it still fails. At gold nothing holds it back, so it names the weakest field's fill.
 */
export function limitPhrase(
  stats: FieldStats | null,
  limiting: Pick<Limiting, 'dataset' | 'tier'>,
  rules: Pick<QualityRules, 'minCoverage' | 'maxProblemShare'>,
  dataset: Pick<DatasetQuality, 'label' | 'tier' | 'rules'> | null,
  o: PhraseOptions = {},
): string {
  if (stats) {
    const label = labelOf(stats.label, o)
    if (stats.tier === 'none') return `${label}: no data`
    if (stats.capKind === 'remapped') return `${label} remapped after certification`
    if (stats.capKind === 'values' && stats.problemRate != null)
      return scoped(
        `${label}: ${shareText(stats.problemRate, { threshold: rules.maxProblemShare, side: 'max' })} not recognized`,
        o,
      )
    if (stats.capKind === 'coverage' || limiting.tier === 'gold' || !dataset)
      return fillPhrase(stats, rules, o)
    return datasetHold(dataset)
  }
  if (dataset) return datasetHold(dataset)
  return limiting.dataset ? datasetDef(limiting.dataset).label : 'No data named'
}

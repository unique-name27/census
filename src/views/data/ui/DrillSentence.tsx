/**
 * A sentence whose number opens the rows behind it. When the sentence prints that number, it is
 * underlined in place; otherwise a short link with the count follows the sentence.
 */
import type { Datasets } from '@/data/schema'
import { Drill, type DrillSource } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import type { DatasetCheck } from '../engine/checks'
import type { ManifestRow } from '../engine/manifest'
import { splitFigure } from '../engine/records'
import { checkDrillLabel, checkSpec } from './drillSpecs'

export function DrillSentence({
  text,
  figure,
  spec,
  label,
  link,
}: {
  text: string
  /** The number in `text` that stands for the rows, or null when the text has none. */
  figure: string | null
  /** Null renders the plain sentence. */
  spec: DrillSource
  /** Accessible name: "Show the 45 rows that refer to people who are not in Employees". */
  label: string
  /** Shown after the sentence when `figure` is not in it: "45 blank". */
  link: string
}) {
  if (!spec) return <>{text}</>
  const parts = figure ? splitFigure(text, figure) : null
  if (parts)
    return (
      <>
        {parts[0]}
        <Drill spec={spec} label={label}>
          {parts[1]}
        </Drill>
        {parts[2]}
      </>
    )
  return (
    <>
      {text}{' '}
      <Drill spec={spec} label={label} className="whitespace-nowrap">
        {link}
      </Drill>
    </>
  )
}

/** A check's sentence, with its count opening the rows it is about. */
export function CheckSentence({
  check,
  row,
  data,
}: {
  check: DatasetCheck
  row: ManifestRow
  data: Datasets
}) {
  const r = check.records
  if (!r || r.count === 0) return <>{check.text}</>
  const n = fmt(r.count, 'int')
  return (
    <DrillSentence
      text={check.text}
      figure={r.figure}
      spec={() => checkSpec(row, r, data)}
      label={checkDrillLabel(row, r)}
      link={r.select.by === 'blank' ? `${n} blank` : `${n} ${r.count === 1 ? 'row' : 'rows'}`}
    />
  )
}

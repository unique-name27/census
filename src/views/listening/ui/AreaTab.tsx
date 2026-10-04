/**
 * The frame of an area tab: one line on what the tab answers, the readout of its findings, then
 * each survey's section (or an empty state when a program has no answers in scope).
 */
import type { ReactNode } from 'react'
import { Grid, Readout } from '@/components'
import type { SurveyType } from '@/data/schema'
import type { ListeningModel } from '../engine'
import type { AreaTab } from '../engine/catalog'
import type { SurveyModel } from '../engine/measures'
import { NoAnswers } from './shared'

export function AreaFrame({
  m,
  tab,
  dek,
  children,
}: {
  m: ListeningModel
  tab: AreaTab
  dek: string
  children: ReactNode
}) {
  const findings = m.findings.filter((f) => f.tab === tab)
  return (
    <>
      <p className="max-w-[78ch] text-[13px] text-ink-2">{dek}</p>
      {findings.length > 0 && (
        <Grid className="mt-4">
          <Readout id={`readout-${tab}`} findings={findings} span={12} />
        </Grid>
      )}
      <div className="mt-8">{children}</div>
    </>
  )
}

/** Render a survey's block when it has answers, else the empty state. */
export function WithSurvey({
  m,
  survey,
  children,
}: {
  m: ListeningModel
  survey: SurveyType
  children: (sm: SurveyModel) => ReactNode
}) {
  const sm = m.surveys.get(survey)
  if (!sm)
    return (
      <section className="mt-10 first:mt-0" aria-label={survey}>
        <h2 className="cut-head mb-3 text-[20px] leading-tight font-semibold">{survey}</h2>
        <Grid>
          <NoAnswers survey={survey} />
        </Grid>
      </section>
    )
  return <>{children(sm)}</>
}

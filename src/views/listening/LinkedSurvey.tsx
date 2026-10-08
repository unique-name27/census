/**
 * One survey number in the view it belongs to, linked to Listening (docs/ROADMAP.md Part 3):
 * candidate NPS on Recruiting > Sources & offers, exit survey on People stats > Attrition, and so
 * on (`linkedSpots()` in ./linked). It is one number, not a second copy of Listening's charts: the
 * latest wave's headline with its target, the change since the wave before and the respondents,
 * opening grouped results only. "Open in Listening" goes to the survey's own tab.
 *
 * ```tsx
 * <LinkedSurvey
 *   survey="Candidate experience"
 *   id="recruiting-candidate-survey"
 *   title="What candidates say"
 *   dek="One number from the candidate experience survey. Scores by stage, source and recruiter are in Listening."
 * />
 * ```
 *
 * Renders nothing while no survey answers are loaded at all, so a team without survey data sees
 * no empty sections; with answers loaded but none for this survey in scope, the figure says so.
 * Renders nothing, section and all, where the mode hides the survey's Listening tab
 * (`surveyShown`, docs/ROLES-V2.md 4.2), not only where it hides Listening.
 */
import { type ReactNode, useMemo } from 'react'
import { type Column, Figure } from '@/charts'
import { Button, goTo, IconChevronRight, IconLock, Section, StatusPill } from '@/components'
import { useAnalytics } from '@/data/context'
import type { SurveyType } from '@/data/schema'
import { Drill } from '@/drill/Drill'
import { DASH, fmt } from '@/lib/format'
import { surveyShown } from './api'
import { programOf, TAB_LABEL } from './engine/catalog'
import {
  changeText,
  headlineSentence,
  type LinkedSurveyRow,
  linkedHeadline,
  linkedMinimum,
  linkedSurveyRow,
  scaleText,
  sentWhen,
  targetWords,
} from './linked'
import { scoreMetric } from './metrics'
import { count, defs, noteOf, STATUS_SEVERITY } from './ui/shared'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-rule pl-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body text-ink">{children}</dd>
    </div>
  )
}

export function LinkedSurvey({
  survey,
  id,
  title,
  dek,
}: {
  survey: SurveyType
  /** Figure id, prefixed with the host view's key: 'recruiting-candidate-survey'. */
  id: string
  /** The section title, in the host view's words: "What candidates say". */
  title: string
  /** One or two sentences: which survey, and what Listening adds. */
  dek: string
}) {
  const ctx = useAnalytics()
  const h = useMemo(() => linkedHeadline(ctx, survey), [ctx, survey])
  const program = programOf.get(survey)
  // A mode that hides the survey's Listening tab shows no survey here either, section and all.
  if (!program || !ctx.all.surveyResponses.length || !surveyShown(ctx, survey)) return null

  const tab = h?.tab ?? program.tab
  const metricId = h?.metricId ?? scoreMetric(program)
  const def = ctx.metrics.def(metricId)
  const min = linkedMinimum(ctx, survey)
  const rows: LinkedSurveyRow[] = h ? [linkedSurveyRow(h)] : []
  const valueFormat = h?.format ?? (program.headline === 'nps' ? 'int' : 'num2')
  const shown = !!h && !h.suppressed && h.value != null
  const target = targetWords(def, ctx.metrics.target(metricId))
  const change = h ? changeText(h) : null
  const columns: Column<LinkedSurveyRow>[] = [
    { key: 'survey', label: 'Survey' },
    { key: 'measure', label: 'Measure' },
    { key: 'wave', label: 'Wave' },
    { key: 'value', label: 'Result', format: valueFormat, drill: () => (shown ? h.drill : null) },
    { key: 'target', label: 'Target', format: valueFormat },
    { key: 'status', label: 'Status' },
    { key: 'priorWave', label: 'Wave before' },
    { key: 'change', label: 'Change', format: valueFormat },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: () => (shown ? h.drill : null) },
  ]

  return (
    <Section
      title={title}
      dek={dek}
      actions={
        <Button size="sm" variant="ghost" onClick={() => goTo('listening', tab)}>
          Open in Listening
          <IconChevronRight className="size-3.5" />
        </Button>
      }
    >
      <Figure
        id={id}
        uses={h?.uses ?? def?.uses}
        metric={metricId}
        title={h?.wave ? `${program.name}, ${h.wave}` : program.name}
        subtitle={`${sentWhen(survey)}. The latest wave on or before the as-of date, from Listening, ${TAB_LABEL[tab]}.`}
        data={rows}
        columns={columns}
        definitions={defs(ctx, metricId, min)}
        note={noteOf(ctx, 'Grouped results only')}
        image={false}
        tableToggle={false}
        empty={
          h
            ? null
            : `No ${survey.toLowerCase()} answers in this scope. Widen the filters, or load them in the Data room.`
        }
      >
        {h && (
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div className="min-w-0">
              <div className="cut-head text-display leading-none font-semibold text-ink">
                {shown ? (
                  <Drill spec={h.drill} label={`${headlineSentence(h)}: show the grouped results`}>
                    {fmt(h.value, h.format)}
                  </Drill>
                ) : (
                  <span className="text-muted">{DASH}</span>
                )}
              </div>
              <div className="mt-1.5 text-meta text-muted">
                {shown ? (
                  scaleText(h)
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <IconLock className="size-3 shrink-0" />
                    Hidden to protect anonymity: fewer than {min} respondents in the latest wave
                  </span>
                )}
              </div>
            </div>
            {shown && (
              <dl className="flex flex-wrap gap-x-6 gap-y-3">
                <Fact label="Target">
                  {target ? (
                    <>
                      <span>{target.toLowerCase()}</span>
                      {h.status !== 'none' && (
                        <StatusPill
                          quiet
                          severity={STATUS_SEVERITY[h.status]}
                          label={linkedSurveyRow(h).status}
                        />
                      )}
                    </>
                  ) : (
                    <span className="text-muted">No target</span>
                  )}
                </Fact>
                <Fact label={h.priorWave ? `Since ${h.priorWave}` : 'Since the wave before'}>
                  {change ?? <span className="text-muted">{DASH}</span>}
                </Fact>
                <Fact label="Respondents">
                  <Drill
                    spec={h.drill}
                    label={`${count(h.respondents, 'respondent')}: show the grouped results`}
                  >
                    {fmt(h.respondents, 'int')}
                  </Drill>
                </Fact>
              </dl>
            )}
          </div>
        )}
      </Figure>
    </Section>
  )
}

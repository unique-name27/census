/**
 * Education and quality of hire (docs/ANALYSES.md, 2.6), inside the shared frame: the lead
 * figure by university, then which part drives a school's score, then degree level, field of
 * study and source of hire. The sort and cut controls are session state at their defaults off
 * screen; every cut is in the parts figure's data either way.
 */
import { Section } from '@/components'
import { AnalysisFrame } from '../../shell/AnalysisFrame'
import type { AnalysisPanelProps } from '../../types'
import type { QualityModel } from '../engine'
import {
  DegreeFieldFigure,
  DegreeFigure,
  FieldFigure,
  PartsFigure,
  SourceFigure,
  UniversityFigure,
  UniversityPartsFigure,
} from './figures'

export function Panel({ def, model, ctx }: AnalysisPanelProps<QualityModel>) {
  const missing = def.missing(ctx)
  const p = { m: model, ctx, missing }
  return (
    <AnalysisFrame def={def} model={model} ctx={ctx} lead={<UniversityFigure {...p} />}>
      <Section
        title="Which part drives the score"
        dek="Quality of hire adds the first full review to whether hires stayed a year. Strong reviews with weak retention is a different conversation from average reviews where everyone stays."
      >
        <UniversityPartsFigure {...p} />
        <PartsFigure {...p} />
      </Section>
      <Section
        title="Degree, field of study and source of hire"
        dek="The same comparison by highest degree, field of study and the source of the application each hire came from, each beside the score its site and level mix predicts."
      >
        <DegreeFigure {...p} />
        <FieldFigure {...p} />
        <DegreeFieldFigure {...p} />
        <SourceFigure {...p} />
      </Section>
    </AnalysisFrame>
  )
}

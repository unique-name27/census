import type { ViewDef } from '../types'
import { talentHeadline } from './engine'
import { TalentView } from './ui/TalentView'

export const view: ViewDef = {
  key: 'talent',
  label: 'Talent',
  tabs: [
    { key: 'overview', label: 'Overview' },
    { key: 'performance', label: 'Performance' },
    { key: 'succession', label: 'Potential & succession' },
    { key: 'retention', label: 'Retention risk' },
    { key: 'learning', label: 'Learning' },
  ],
  View: TalentView,
  headline: talentHeadline,
  datasets: ['reviews', 'succession', 'learning', 'employees', 'jobChanges', 'comp'],
}

/**
 * A stub table for an allowlist mode whose table is not filled yet (docs/ROLES-V2.md 8.9: the
 * Policies agent fills HRBP, Compensation, Talent management, HR ops, Recruiter and Finance from
 * part 4). It hides everything except the mode's Home and the frame a reader needs to change mode
 * again (the wordmark, the Mode button, Settings > Mode and Display, Help's modes article), and
 * takes its pay surfaces from the mode's pay view. Pure data.
 */
import { VIEW_KEYS } from '@/data/schema'
import { MODE_NAME, type Mode } from '../modes'
import { payDecisions } from '../pay'
import { type Decision, hidden, limited, type PolicyPlace, type RolePolicy, SHOWN } from './types'

const PLACES: readonly PolicyPlace[] = [...VIEW_KEYS, 'home', 'actions', 'data', 'dev']

export function stubPolicy(mode: Mode): RolePolicy {
  const name = `${MODE_NAME[mode]} mode`
  const notYet = hidden(`Not decided for ${name} yet.`)
  const views = Object.fromEntries(
    PLACES.map((k): [PolicyPlace, Decision] => [k, k === 'home' ? SHOWN : notYet]),
  ) as Record<PolicyPlace, Decision>
  return {
    mode,
    views,
    tabs: { home: [{ key: 'overview', label: 'Overview', decision: SHOWN }] },
    hiddenParts: {},
    metrics: { allow: [], hidePrefixes: [], hide: [] },
    hiddenFigures: [],
    hiddenFigurePrefixes: [],
    drillKinds: [],
    drillListed: SHOWN,
    datasets: [],
    hiddenItemPrefixes: [],
    articles: { modes: SHOWN, 'what-census-is': SHOWN },
    tours: {},
    surfaces: {
      'masthead:wordmark': limited('Goes to Home.'),
      'masthead:company': SHOWN,
      'masthead:mode': SHOWN,
      'masthead:settings': limited('Lists only the sections shown in this mode.'),
      'masthead:help': limited('Lists only the articles and tours shown in this mode.'),
      'masthead:skip': SHOWN,
      'settings:mode': SHOWN,
      'settings:display': SHOWN,
      'settings:device': limited('Clear everything only; settings files are hidden.'),
      'ui:route-link': limited('A link to a page this mode hides reads as plain text.'),
      'help:links': limited('Links to hidden targets read as plain text.'),
      ...payDecisions(mode),
    },
  }
}

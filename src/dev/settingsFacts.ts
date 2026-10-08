/**
 * Every setting Census has, with its current value, its default and where it is kept (docs/ROLES.md,
 * 5.3 "Settings"): the saved settings (`DEFAULT_SETTINGS`, `pickSettings`), the session switches,
 * the mode, the debug overlays, the quality lens and Ask's choices. The Ask key and the workspace ID
 * show as set or not set, never their values. Pure: the page passes a snapshot of the stores.
 */
import { MODE_LABEL, MODE_OF_PICK, type Mode, type ModePicks, PICK_KINDS } from '@/access/modes'
import { STANDARD_LABEL } from '@/data/quality/tier'
import { DEFAULT_SETTINGS, MOTION_LABEL, type Settings, TEXT_SIZE_LABEL, THEME_LABEL } from '@/data/settings'
import { fmt } from '@/lib/format'
import type { SettingFact } from './inventory'
import { PICK_NOUN, pickLabel } from './roles'
import { OVERLAY_KEYS, OVERLAY_LABEL, type Overlays } from './store'

export interface SettingsSnapshot {
  settings: Settings
  showPay: boolean
  showImmigration: boolean
  mode: Mode
  /** Every pick `census:mode` remembers (each is kept when the mode changes). */
  picks: ModePicks
  /** A manager's name from their ID, for the manager pick. */
  managerName: (id: string) => string | null
  overlays: Overlays
  lens: boolean
  askModel: string
  defaultAskModel: string
  askKey: 'not set' | 'set for this tab' | 'kept on this device'
  workspaceSet: boolean
}

const onOff = (b: boolean) => (b ? 'On' : 'Off')

/** The keys of `Settings` the inventory names, in the order Settings shows them. */
type SavedKey =
  | 'theme'
  | 'textSize'
  | 'motion'
  | 'dataStandard'
  | 'asOfOverride'
  | 'tools'
  | 'engagementSurveys'

export const SETTING_KEYS: readonly SavedKey[] = [
  'theme',
  'textSize',
  'motion',
  'dataStandard',
  'asOfOverride',
  'tools',
  'engagementSurveys',
]

function savedValue(key: SavedKey, s: Settings): string {
  switch (key) {
    case 'theme':
      return THEME_LABEL[s.theme]
    case 'textSize':
      return TEXT_SIZE_LABEL[s.textSize]
    case 'motion':
      return MOTION_LABEL[s.motion]
    case 'dataStandard':
      return STANDARD_LABEL[s.dataStandard]
    case 'asOfOverride':
      return s.asOfOverride ? fmt(s.asOfOverride, 'date') : 'Latest date in the data'
    case 'tools': {
      const n = Object.keys(s.tools ?? {}).length
      return n ? `${n} changed ${n === 1 ? 'link' : 'links'}` : 'Default links'
    }
    case 'engagementSurveys':
      return onOff(s.engagementSurveys)
    default:
      return ''
  }
}

const SAVED: Record<SavedKey, { label: string; section: SettingFact['section'] }> = {
  theme: { label: 'Theme', section: 'display' },
  textSize: { label: 'Text size', section: 'display' },
  motion: { label: 'Motion', section: 'display' },
  dataStandard: { label: 'Data standard', section: 'data' },
  asOfOverride: { label: 'Reporting date', section: 'data' },
  tools: { label: 'Related tool links', section: 'tools' },
  engagementSurveys: { label: 'Engagement surveys in Listening', section: 'privacy' },
}

export function settingFacts(snap: SettingsSnapshot): SettingFact[] {
  const kept = 'localStorage census:settings'
  const saved: SettingFact[] = SETTING_KEYS.map((key) => ({
    setting: SAVED[key].label,
    section: SAVED[key].section,
    value: savedValue(key, snap.settings),
    defaultValue: savedValue(key, DEFAULT_SETTINGS),
    where: kept,
    inFile: true,
  }))
  const session: SettingFact[] = [
    {
      setting: 'Pay amounts shown',
      section: 'session',
      value: onOff(snap.showPay),
      defaultValue: 'Off',
      where: 'This page only, off on every load',
      inFile: false,
    },
    {
      setting: 'Immigration details shown',
      section: 'session',
      value: onOff(snap.showImmigration),
      defaultValue: 'Off',
      where: 'This page only, off on every load',
      inFile: false,
    },
  ]
  const pickOf = (m: Mode) => pickLabel(m, snap.picks, snap.managerName)
  const current = pickOf(snap.mode)
  const mode: SettingFact[] = [
    {
      setting: 'Mode',
      section: 'mode',
      value: current ? `${MODE_LABEL[snap.mode]}: ${current}` : MODE_LABEL[snap.mode],
      defaultValue: 'HR',
      where: 'localStorage census:mode',
      inFile: false,
    },
    // The pick each scoped mode remembers, kept when the mode changes (docs/ROLES-V2.md 1.4).
    ...PICK_KINDS.map((kind) => ({
      setting: `Mode pick: ${PICK_NOUN[kind].toLowerCase()}`,
      section: 'mode' as const,
      value: pickOf(MODE_OF_PICK[kind]) ?? 'None',
      defaultValue: 'None',
      where: 'localStorage census:mode',
      inFile: false,
    })),
    ...OVERLAY_KEYS.map((k) => ({
      setting: `Debug overlay: ${OVERLAY_LABEL[k].toLowerCase()}`,
      section: 'mode' as const,
      value: onOff(snap.overlays[k]),
      defaultValue: 'Off',
      where: 'localStorage census:dev',
      inFile: false,
      surface: `overlay:${k}`,
    })),
  ]
  const other: SettingFact[] = [
    {
      setting: 'Quality lens',
      section: 'data',
      value: onOff(snap.lens),
      defaultValue: 'Off',
      where: 'localStorage census:quality-lens, and the address',
      inFile: false,
      surface: 'filter:lens',
    },
    {
      setting: 'Ask model',
      section: 'ask',
      value: snap.askModel,
      defaultValue: snap.defaultAskModel,
      where: 'localStorage census:ask-model',
      inFile: false,
    },
    {
      setting: 'Ask key',
      section: 'ask',
      value: snap.askKey,
      defaultValue: 'not set',
      where: 'sessionStorage census:ask-key, or localStorage when kept',
      inFile: false,
    },
    {
      setting: 'Ask workspace ID',
      section: 'ask',
      value: snap.workspaceSet ? 'set' : 'not set',
      defaultValue: 'not set',
      where: 'localStorage census:ask-workspace',
      inFile: false,
    },
  ]
  return [...mode, ...saved, ...session, ...other]
}

/** Settings → Display: theme, text size and motion. */
import { IconMonitor, IconMoon, IconSun } from '@/components/icons'
import { Segmented } from '@/components/ui'
import {
  MOTION_LABEL,
  type MotionPref,
  TEXT_SIZE_LABEL,
  TEXT_SIZES,
  type TextSize,
  THEME_LABEL,
  type ThemePref,
} from '@/data/settings'
import { useCensus } from '@/data/store'
import { Field, SettingsBlock } from './ui'

const THEME_ICON: Record<ThemePref, typeof IconSun> = { system: IconMonitor, light: IconSun, dark: IconMoon }
const THEMES: ThemePref[] = ['system', 'light', 'dark']
const MOTIONS: MotionPref[] = ['system', 'reduce']

export function DisplaySection() {
  const theme = useCensus((s) => s.theme)
  const setTheme = useCensus((s) => s.setTheme)
  const textSize = useCensus((s) => s.textSize)
  const setTextSize = useCensus((s) => s.setTextSize)
  const motion = useCensus((s) => s.motion)
  const setMotion = useCensus((s) => s.setMotion)
  return (
    <SettingsBlock section="display">
      <Field label="Theme" hint="System follows your computer's light or dark setting.">
        <Segmented<ThemePref>
          label="Theme"
          size="md"
          value={theme}
          onChange={setTheme}
          options={THEMES.map((t) => {
            const Icon = THEME_ICON[t]
            return { value: t, label: THEME_LABEL[t], icon: <Icon className="size-3.5" /> }
          })}
        />
      </Field>
      <Field label="Text size" hint="Scales the whole app, charts and tables included.">
        <Segmented<TextSize>
          label="Text size"
          size="md"
          value={textSize}
          onChange={setTextSize}
          options={TEXT_SIZES.map((t) => ({ value: t, label: TEXT_SIZE_LABEL[t] }))}
        />
      </Field>
      <Field label="Motion" hint="Reduce motion turns off sliding and fading in this app.">
        <Segmented<MotionPref>
          label="Motion"
          size="md"
          value={motion}
          onChange={setMotion}
          options={MOTIONS.map((m) => ({ value: m, label: MOTION_LABEL[m] }))}
        />
      </Field>
    </SettingsBlock>
  )
}

/**
 * Top line of the band: wordmark, whose data this is (and whether pay amounts are on for this
 * session), the as-of date, related tools, the Data room and theme.
 */

import { IconDatabase, IconEye, IconMonitor, IconMoon, IconSun } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button, cx, IconButton, Menu, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { type ThemePref, useCensus } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { companyLine, uploadedCount } from './exportMeta'
import { Mark } from './Mark'
import { ToolsMenu } from './ToolsMenu'

const THEMES: { value: ThemePref; label: string; Icon: typeof IconSun }[] = [
  { value: 'system', label: 'System', Icon: IconMonitor },
  { value: 'light', label: 'Light', Icon: IconSun },
  { value: 'dark', label: 'Dark', Icon: IconMoon },
]

function ThemeMenu() {
  const theme = useCensus((s) => s.theme)
  const setTheme = useCensus((s) => s.setTheme)
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[0]
  return (
    <Menu
      width={180}
      trigger={
        <IconButton label={`Theme: ${current.label}`}>
          <current.Icon />
        </IconButton>
      }
      items={[
        { heading: 'Theme' },
        ...THEMES.map((t) => ({
          label: t.label,
          icon: <t.Icon />,
          hint: t.value === theme ? 'Current' : undefined,
          onSelect: () => setTheme(t.value),
        })),
      ]}
    />
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="cut-head text-[18px] leading-none font-bold tracking-[-0.02em] text-ink">Census</span>
    </span>
  )
}

/**
 * Pay amounts are a per-session decision: while they are on, the band says so on every page and
 * offers a one-click way back.
 */
export function PayShownTag() {
  const setShowPay = useCensus((s) => s.setShowPay)
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[3px] bg-sheet-3 text-[11px] font-medium whitespace-nowrap text-ink">
      <span className="flex items-center gap-1 pr-1.5 pl-1">
        <IconEye className="size-3.5 shrink-0" />
        Pay amounts shown
      </span>
      <button
        type="button"
        onClick={() => setShowPay(false)}
        aria-label="Hide pay amounts"
        className="h-full rounded-r-[3px] px-1.5 font-semibold shadow-[inset_1px_0_0_var(--rule-strong)] hover:bg-hover active:bg-press"
      >
        Hide
      </button>
    </span>
  )
}

export function Masthead() {
  const ctx = useAnalytics()
  const onDataRoom = useCensus((s) => s.route.view === 'data')
  const { uploaded, total } = uploadedCount(ctx.sources)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 pb-2">
      <button
        type="button"
        onClick={() => goTo('recruiting')}
        aria-label="Census, go to Recruiting"
        className="-ml-1 rounded-control px-1 py-0.5 hover:bg-hover"
      >
        <Wordmark />
      </button>
      <div className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
        <span aria-hidden="true" className="hidden h-4 w-px bg-rule-strong sm:block" />
        <span className="truncate text-[13px] text-ink-2">{companyLine(ctx.isSample, SAMPLE_COMPANY)}</span>
        {ctx.isSample && <Tag>Sample data</Tag>}
        {ctx.showPay && <PayShownTag />}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className="mr-2 hidden text-[12px] text-muted md:inline">As of {formatDate(ctx.asOf)}</span>
        <ToolsMenu />
        <Button
          variant={onDataRoom ? 'secondary' : 'ghost'}
          icon={<IconDatabase />}
          aria-current={onDataRoom ? 'page' : undefined}
          onClick={() => goTo('data')}
        >
          Data room
          <span className={cx('hidden font-normal sm:inline', onDataRoom ? 'text-ink-2' : 'text-muted')}>
            {uploaded} of {total} uploaded
          </span>
        </Button>
        <ThemeMenu />
      </div>
    </div>
  )
}

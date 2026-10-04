/**
 * Top line of the band: wordmark, whose data this is (and whether pay amounts or immigration
 * details are on for this session), the as-of date, related tools, the Action center with its
 * open-item count, the Data room, Settings (theme and every other preference live in the
 * Settings sheet) and Help (articles, tours, shortcuts and "Report a problem").
 */
import type { SVGProps } from 'react'

import { IconDatabase, IconEye, IconGear } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button, cx, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { HOME_VIEW, openSettings, useCensus } from '@/data/store'
import { HelpButton } from '@/help/ui/HelpButton'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { useOpenActionCount } from '@/views/actions'
import { companyLine, uploadedCount } from './exportMeta'
import { Mark } from './Mark'
import { settingsTrigger } from './settings/SettingsSheet'
import { ToolsMenu } from './ToolsMenu'

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

/** A tray with a check: open items waiting on someone. 16px, 1.5px stroke like the icon set. */
function IconActions(p: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      <path d="M2.5 9.5h3l1 1.5h3l1-1.5h3" />
      <path d="M2.5 9.5 4 3.5h8l1.5 6v3h-11z" />
      <path d="m6.2 6.4 1.3 1.2 2.4-2.4" />
    </svg>
  )
}

/** Immigration details, like pay amounts, are a per-session decision the band always shows. */
export function ImmigrationShownTag() {
  const setShowImmigration = useCensus((s) => s.setShowImmigration)
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[3px] bg-sheet-3 text-[11px] font-medium whitespace-nowrap text-ink">
      <span className="flex items-center gap-1 pr-1.5 pl-1">
        <IconEye className="size-3.5 shrink-0" />
        Immigration details shown
      </span>
      <button
        type="button"
        onClick={() => setShowImmigration(false)}
        aria-label="Hide immigration details"
        className="h-full rounded-r-[3px] px-1.5 font-semibold shadow-[inset_1px_0_0_var(--rule-strong)] hover:bg-hover active:bg-press"
      >
        Hide
      </button>
    </span>
  )
}

/** The Action center button, with the number of open items when it is known. */
function ActionsButton() {
  const onActions = useCensus((s) => s.route.view === 'actions')
  const count = useOpenActionCount()
  return (
    <Button
      data-tour="masthead-actions"
      variant={onActions ? 'secondary' : 'ghost'}
      icon={<IconActions />}
      aria-current={onActions ? 'page' : undefined}
      aria-label={count == null ? 'Actions' : `Actions, ${fmt(count, 'int')} open`}
      onClick={() => goTo('actions')}
    >
      <span className="hidden sm:inline">Actions</span>
      {count != null && (
        <span
          className={cx(
            'tnum min-w-5 rounded-[3px] px-1 text-center text-[12px] leading-5 font-semibold',
            count > 0 ? 'bg-ink text-on-ink' : 'bg-sheet-3 text-ink-2',
          )}
        >
          {fmt(count, 'int')}
        </span>
      )}
    </Button>
  )
}

export function Masthead() {
  const ctx = useAnalytics()
  const onDataRoom = useCensus((s) => s.route.view === 'data')
  const showImmigration = useCensus((s) => s.showImmigration)
  const settingsOpen = useCensus((s) => s.settingsOpen.open)
  const { uploaded, total } = uploadedCount(ctx.sources)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 pb-2">
      <button
        type="button"
        onClick={() => goTo(HOME_VIEW)}
        aria-label="Census, go to the scorecard"
        className="-ml-1 rounded-control px-1 py-0.5 hover:bg-hover"
      >
        <Wordmark />
      </button>
      <div className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
        <span aria-hidden="true" className="hidden h-4 w-px bg-rule-strong sm:block" />
        <span className="truncate text-[13px] text-ink-2">{companyLine(ctx.isSample, SAMPLE_COMPANY)}</span>
        {ctx.isSample && <Tag>Sample data</Tag>}
        {ctx.showPay && <PayShownTag />}
        {showImmigration && <ImmigrationShownTag />}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className="mr-2 hidden text-[12px] text-muted md:inline">As of {formatDate(ctx.asOf)}</span>
        <ToolsMenu />
        <ActionsButton />
        <Button
          data-tour="masthead-data"
          variant={onDataRoom ? 'secondary' : 'ghost'}
          icon={<IconDatabase />}
          aria-current={onDataRoom ? 'page' : undefined}
          aria-label={`Data room, ${uploaded} of ${total} uploaded`}
          onClick={() => goTo('data')}
        >
          <span className="hidden sm:inline">Data room</span>
          <span className={cx('hidden font-normal sm:inline', onDataRoom ? 'text-ink-2' : 'text-muted')}>
            {uploaded} of {total} uploaded
          </span>
        </Button>
        <Button
          ref={settingsTrigger}
          data-tour="masthead-settings"
          variant={settingsOpen ? 'secondary' : 'ghost'}
          icon={<IconGear />}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-label="Settings"
          onClick={() => openSettings()}
        >
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <HelpButton />
      </div>
    </div>
  )
}

/**
 * Top line of the band: wordmark, whose data this is (and whether pay amounts or immigration
 * details are on for this session), the as-of date, related tools, the Action center with its
 * open-item count, the Data room, Settings (theme and every other preference live in the
 * Settings sheet) and Help (articles, tours, shortcuts and "Report a problem").
 *
 * Phones (under 768px) keep one row beside the wordmark: Mode, Actions, Settings and a "More"
 * menu holding Ask, Help, the Data room, the Developer page and the related tools.
 */
import type { SVGProps } from 'react'

import { HOME_LABEL } from '@/access/modes'
import { ModeButton } from '@/access/ui/ModeButton'
import { AskButton } from '@/ask/ui/AskButton'
import { IconAsk } from '@/ask/ui/icons'
import { openAsk } from '@/ask/ui/store'
import {
  IconCode,
  IconDatabase,
  IconExternal,
  IconEye,
  IconGear,
  IconMore,
  IconPencil,
} from '@/components/icons'
import { goTo } from '@/components/navigation'
import { Button, cx, Menu, type MenuItem, Tag, Tip } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { homeView, openSettings, useCensus } from '@/data/store'
import { openHelp } from '@/help/store'
import { HelpButton } from '@/help/ui/HelpButton'
import { IconHelp } from '@/help/ui/IconHelp'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { useOpenActionCount } from '@/views/actions'
import { companyLine, uploadedCount } from './exportMeta'
import { Mark } from './Mark'
import { settingsTrigger } from './settings/SettingsSheet'
import { ToolsMenu, useTools } from './ToolsMenu'

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
    <span className="inline-flex h-5 shrink-0 items-center rounded-chip bg-sheet-3 text-label font-medium whitespace-nowrap text-ink">
      <span className="flex items-center gap-1 pr-1.5 pl-1">
        <IconEye className="size-3.5 shrink-0" />
        Pay amounts shown
      </span>
      <button
        type="button"
        onClick={() => setShowPay(false)}
        aria-label="Hide pay amounts"
        className="h-full rounded-r-chip px-1.5 font-semibold shadow-[inset_1px_0_0_var(--rule-strong)] hover:bg-hover active:bg-press"
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
    <span className="inline-flex h-5 shrink-0 items-center rounded-chip bg-sheet-3 text-label font-medium whitespace-nowrap text-ink">
      <span className="flex items-center gap-1 pr-1.5 pl-1">
        <IconEye className="size-3.5 shrink-0" />
        Immigration details shown
      </span>
      <button
        type="button"
        onClick={() => setShowImmigration(false)}
        aria-label="Hide immigration details"
        className="h-full rounded-r-chip px-1.5 font-semibold shadow-[inset_1px_0_0_var(--rule-strong)] hover:bg-hover active:bg-press"
      >
        Hide
      </button>
    </span>
  )
}

/**
 * The Action center button, with the number of open items when it is known. The count sits in a
 * quiet chip (it never nears zero, so solid ink would read as an alarm); the critical count is in
 * the tooltip.
 */
function ActionsButton() {
  const onActions = useCensus((s) => s.route.view === 'actions')
  const count = useOpenActionCount()
  const critical = useOpenActionCount('critical')
  const tip =
    count == null
      ? 'Open items from every view'
      : `${fmt(count, 'int')} open ${count === 1 ? 'item' : 'items'}${critical ? `, ${fmt(critical, 'int')} critical` : ''}`
  return (
    <Tip content={tip} side="bottom">
      <Button
        data-tour="masthead-actions"
        variant={onActions ? 'secondary' : 'ghost'}
        icon={<IconActions />}
        aria-current={onActions ? 'page' : undefined}
        aria-label={
          count == null
            ? 'Actions'
            : `Actions, ${fmt(count, 'int')} open${critical ? `, ${fmt(critical, 'int')} critical` : ''}`
        }
        onClick={() => goTo('actions')}
      >
        <span className="hidden sm:inline">Actions</span>
        {count != null && (
          <span className="tnum min-w-5 rounded-chip bg-sheet-3 px-1 text-center text-meta leading-5 font-semibold text-ink">
            {fmt(count, 'int')}
          </span>
        )}
      </Button>
    </Tip>
  )
}

/**
 * Phones only: the masthead buttons that do not fit beside the wordmark, in one menu. Each item
 * does what its button does on wider screens; tool links open in a new tab.
 */
function MoreMenu({ uploaded, total }: { uploaded: number; total: number }) {
  const { access } = useAnalytics()
  const canEditTools = access.can('tools:edit')
  const tools = useTools().filter((t) => access.can(`tools:${t.id}`) && !!t.url)
  const items: MenuItem[] = [
    { label: 'Ask Census', icon: <IconAsk />, hint: 'Alt+A', onSelect: () => openAsk() },
    { label: 'Help', icon: <IconHelp />, hint: '?', onSelect: () => openHelp() },
  ]
  if (access.can('masthead:data'))
    items.push({
      label: 'Data room',
      icon: <IconDatabase />,
      hint: `${uploaded} of ${total} uploaded`,
      onSelect: () => goTo('data'),
    })
  if (access.can('masthead:dev'))
    items.push({ label: 'Developer', icon: <IconCode />, onSelect: () => goTo('dev') })
  if (tools.length || canEditTools) {
    items.push({ separator: true }, { heading: 'Related tools' })
    for (const t of tools) {
      const url = t.url
      if (!url) continue
      items.push({
        label: t.label,
        icon: <IconExternal />,
        onSelect: () => {
          window.open(url, '_blank', 'noopener,noreferrer')
        },
      })
    }
    if (canEditTools)
      items.push({ label: 'Edit links', icon: <IconPencil />, onSelect: () => openSettings('tools') })
  }
  return (
    <Menu
      width={248}
      items={items}
      trigger={
        <Button
          data-tour="masthead-more"
          variant="ghost"
          icon={<IconMore />}
          aria-label="More"
          className="md:hidden"
        />
      }
    />
  )
}

/** Shown from 768px; on phones the item is in the More menu. A wrapper keeps any sheet it mounts. */
const WIDE_ONLY = 'contents max-md:[&>button]:hidden'

export function Masthead() {
  const ctx = useAnalytics()
  const onDataRoom = useCensus((s) => s.route.view === 'data')
  const onDev = useCensus((s) => s.route.view === 'dev')
  // The mode shapes the band (docs/ROLES.md, 3.1): no Data room or session tags in Manager mode,
  // the Developer button in Developer mode only.
  const { access } = ctx
  const showImmigration = useCensus((s) => s.showImmigration) && access.can('masthead:pay-tags')
  const settingsOpen = useCensus((s) => s.settingsOpen.open)
  const { uploaded, total } = uploadedCount(ctx.sources)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 pb-2 md:gap-x-4">
      <button
        type="button"
        onClick={() => goTo(homeView())}
        aria-label={`Census, go to ${HOME_LABEL[access.mode]}`}
        className="-ml-1 rounded-control px-1 py-0.5 hover:bg-hover"
      >
        <Wordmark />
      </button>
      <div className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
        <span aria-hidden="true" className="hidden h-4 w-px bg-rule-strong sm:block" />
        <span className="truncate text-small text-ink-2">{companyLine(ctx.isSample, SAMPLE_COMPANY)}</span>
        {ctx.isSample && <Tag>Sample data</Tag>}
        {ctx.showPay && access.can('masthead:pay-tags') && <PayShownTag />}
        {showImmigration && <ImmigrationShownTag />}
      </div>
      {/* Phones keep these on the wordmark's row (the rest are in More). Wraps onto a second row
          only when even those do not fit (very large text), so the page never scrolls sideways. */}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 max-md:-mr-1">
        <span className="mr-2 hidden text-meta text-muted md:inline">As of {formatDate(ctx.asOf)}</span>
        <ModeButton />
        <span className={WIDE_ONLY}>
          <ToolsMenu />
        </span>
        <ActionsButton />
        {access.can('masthead:data') && (
          <Button
            className="max-md:hidden"
            data-tour="masthead-data"
            variant={onDataRoom ? 'secondary' : 'ghost'}
            icon={<IconDatabase />}
            aria-current={onDataRoom ? 'page' : undefined}
            aria-label={`Data room, ${uploaded} of ${total} uploaded`}
            onClick={() => goTo('data')}
          >
            <span className="hidden sm:inline">Data room</span>
            {/* With the Developer button too, the count waits for 1536px so the company name
                keeps its room (the label and the Data room still say it). */}
            <span
              className={cx(
                'hidden font-normal',
                access.can('masthead:dev') ? '2xl:inline' : 'sm:inline',
                onDataRoom ? 'text-ink-2' : 'text-muted',
              )}
            >
              {uploaded} of {total} uploaded
            </span>
          </Button>
        )}
        {access.can('masthead:dev') && (
          <Button
            className="max-md:hidden"
            data-tour="masthead-dev"
            variant={onDev ? 'secondary' : 'ghost'}
            icon={<IconCode />}
            aria-current={onDev ? 'page' : undefined}
            aria-label="Developer"
            onClick={() => goTo('dev')}
          >
            <span className="hidden sm:inline">Developer</span>
          </Button>
        )}
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
        <span className={WIDE_ONLY}>
          <AskButton />
          <HelpButton />
        </span>
        <MoreMenu uploaded={uploaded} total={total} />
      </div>
    </div>
  )
}

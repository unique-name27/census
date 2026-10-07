/**
 * An answer as a document, rendered from the engine's typed blocks (no HTML from Claude ever
 * reaches the page): paragraphs, headings, lists, tables (the app's DataTable, with CSV, Excel
 * and copy), code and rules. Inline: a number linked to its records opens the drill panel on top
 * of the sheet; a view link goes to that view and tab; a metric link shows its definition; a
 * person token shows the name, and an employee's name opens their card.
 */
import { type MouseEvent, type ReactNode, use } from 'react'
import { routeShown } from '@/access/policy'
import {
  type Block,
  type Conversation,
  codeText,
  type Inline,
  inlineText,
  parseAnswer,
  SOMEONE,
} from '@/ask/engine'
import { goTo, routeHash } from '@/components/navigation'
import { cx, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import type { RouteView } from '@/data/store'
import { Drill } from '@/drill/Drill'
import { openPerson } from '@/drill/store'
import { DATA_TABS, parseDataTab } from '@/views/data/links'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import { VIEWS } from '@/views/registry'
import { AnswerTable } from './AnswerTable'
import { AnswerCtx, LeadCtx, useAnswerCtx } from './answerContext'
import { type ExportScope, leadOf, refLabel, routeExists } from './model'
import { leaveAsk } from './store'

export const LINK_CLASS =
  'rounded-mark font-medium text-link underline decoration-1 underline-offset-2 hover:decoration-2'

/** A name that opens the person card: reads as text, with a quiet underline like a drillable number. */
const PERSON_CLASS =
  'cursor-pointer rounded-mark text-inherit underline decoration-rule-strong decoration-1 underline-offset-[3px] hover:decoration-ink'

const VIEW_TABS: ReadonlyMap<string, readonly string[]> = new Map(
  VIEWS.map((v) => [v.key, v.tabs.map((t) => t.key)]),
)

const isDataTab = (tab: string): boolean => {
  if (DATA_TABS.some((t) => t.route === tab)) return true
  const r = parseDataTab(tab)
  return !!r.dataset || r.tab !== 'datasets'
}

export const isView = (view: RouteView, tab: string | null): boolean =>
  routeExists(view, tab, VIEW_TABS, isDataTab)

/** A modified click (new tab, new window) is left to the browser. */
const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

function MetricLink({ metric, children }: { metric: string; children: ReactNode }) {
  const { metrics } = useAnalytics()
  const def = metrics.def(metric)
  if (!def) return <>{children}</>
  return (
    <Popover
      title={def.name}
      width={320}
      trigger={
        <button type="button" className={cx(LINK_CLASS, 'text-left')}>
          {children}
        </button>
      }
    >
      <p className="text-ink-2">{def.definition}</p>
      {def.formula && <p className="mt-1.5 text-meta text-muted">{def.formula}</p>}
      <div className="mt-2 border-t border-rule pt-2">
        <a
          href={metricHref(metric)}
          onClick={(e) => {
            if (!plainClick(e)) return
            e.preventDefault()
            leaveAsk()
            openMetricDefinition(metric)
          }}
          className="inline-flex items-center gap-1 rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline"
        >
          Open in Metric definitions
        </a>
      </div>
    </Popover>
  )
}

function Person({ token }: { token: string | null }) {
  const { conversation } = useAnswerCtx()
  const p = token ? conversation.person(token) : null
  if (!p) return <span>{SOMEONE}</span>
  if (!p.employeeId) return <span>{p.name}</span>
  const id = p.employeeId
  return (
    <button
      type="button"
      className={PERSON_CLASS}
      title="Open the person card"
      onClick={(e) => {
        e.stopPropagation()
        openPerson(id)
      }}
    >
      {p.name}
    </button>
  )
}

export function Inlines({ nodes }: { nodes: readonly Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <InlineNode key={i} node={n} />
      ))}
    </>
  )
}

function InlineNode({ node: n }: { node: Inline }) {
  const { conversation } = useAnswerCtx()
  const lead = use(LeadCtx)
  switch (n.type) {
    case 'text':
      return <>{n.text}</>
    case 'strong':
      return (
        <strong className="font-semibold text-ink">
          <Inlines nodes={n.children} />
        </strong>
      )
    case 'em':
      return (
        <em>
          <Inlines nodes={n.children} />
        </em>
      )
    case 'code':
      return (
        <code className="rounded-chip bg-sheet-2 px-1 py-px font-mono text-meta">
          {codeText(n.text, (t) => conversation.person(t))}
        </code>
      )
    case 'break':
      return <br />
    case 'person':
      return <Person token={n.token} />
    case 'ref': {
      const label = refLabel(
        inlineText(n.children, (t) => conversation.person(t)),
        lead,
      )
      return (
        <Drill spec={conversation.records(n.ref)} label={label}>
          <Inlines nodes={n.children} />
        </Drill>
      )
    }
    case 'view': {
      const tab = n.tab ?? ''
      return (
        <a
          href={routeHash(n.view, tab)}
          className={LINK_CLASS}
          onClick={(e) => {
            if (!plainClick(e)) return
            e.preventDefault()
            leaveAsk()
            goTo(n.view, tab)
          }}
        >
          <Inlines nodes={n.children} />
        </a>
      )
    }
    case 'metric':
      return (
        <MetricLink metric={n.metric}>
          <Inlines nodes={n.children} />
        </MetricLink>
      )
  }
}

const HEADING_SIZE = { 1: 'text-title', 2: 'text-title', 3: 'text-title' } as const

/** Inline nodes under the bold label they open with, so their record links can name it. */
function Led({ nodes }: { nodes: readonly Inline[] }) {
  const { conversation } = useAnswerCtx()
  return (
    <LeadCtx value={leadOf(nodes, (t) => conversation.person(t))}>
      <Inlines nodes={nodes} />
    </LeadCtx>
  )
}

function BlockView({ block: b, index }: { block: Block; index: number }) {
  const { conversation } = useAnswerCtx()
  switch (b.type) {
    case 'paragraph':
      return (
        <p className="text-body leading-[1.6] text-ink">
          <Led nodes={b.children} />
        </p>
      )
    case 'heading':
      return (
        <h4 className={cx('cut-head pt-1 leading-snug font-semibold text-ink', HEADING_SIZE[b.level])}>
          <Inlines nodes={b.children} />
        </h4>
      )
    case 'list': {
      const List = b.ordered ? 'ol' : 'ul'
      return (
        <List
          start={b.ordered && b.start !== 1 ? b.start : undefined}
          className={cx(
            'flex flex-col gap-1 pl-5 text-body leading-[1.55] text-ink marker:text-muted',
            b.ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {b.items.map((it, i) => (
            <li key={i} className={cx(it.depth === 1 && 'ml-5', it.depth >= 2 && 'ml-10')}>
              <Led nodes={it.children} />
            </li>
          ))}
        </List>
      )
    }
    case 'table':
      return <AnswerTable block={b} index={index} />
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-control bg-sheet-2 p-3 font-mono text-meta leading-relaxed text-ink">
          {codeText(b.text, (t) => conversation.person(t))}
        </pre>
      )
    case 'rule':
      return <hr className="border-rule" />
  }
}

/** The answer text (as streamed so far, or complete) as a document. */
export function Answer({
  text,
  conversation,
  question,
  turnNo,
  exportScope,
  tablesBefore = 0,
}: {
  text: string
  conversation: Conversation
  question: string
  /** The answer's place in the chat (1-based), for export file names. */
  turnNo?: number
  /** The scope its exported tables are stamped with. */
  exportScope?: () => ExportScope | null
  /** Tables in the parts of the answer above this one (a chart splits an answer), so numbering runs on. */
  tablesBefore?: number
}) {
  const { metrics, access } = useAnalytics()
  // A link to a page the mode hides reads as plain text; so does every metric link where the
  // dictionary (in the Data room) is not shown (docs/ROLES.md, 3.9).
  const blocks = parseAnswer(text, {
    isRef: (r) => conversation.hasRef(r),
    isView: (v, t) => isView(v, t) && routeShown(access.mode, v, t ?? ''),
    isMetric: (m) => !!metrics.def(m) && access.can('page:data') && access.can(`metric:${m}`),
  })
  // Tables are numbered in the answer for their export titles.
  const tableNo: number[] = []
  let n = tablesBefore
  for (const b of blocks) tableNo.push(b.type === 'table' ? ++n : 0)
  return (
    <AnswerCtx value={{ conversation, question, turnNo, exportScope }}>
      <div className="flex flex-col gap-3">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} index={tableNo[i] ?? 0} />
        ))}
      </div>
    </AnswerCtx>
  )
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useCan } from '@/access/hooks'
import { Button, SeverityIcon } from '@/components/ui'
import { useCensus } from '@/data/store'
import { logDevError } from './devlog'

const BLANK_LINE = '\n\n'

/**
 * Developer mode only (docs/ROLES.md, 5.9): a "Details" disclosure with the message and the
 * component stack under the boundary's message.
 */
function ErrorDetails({ error, stack }: { error: Error; stack: string | null }) {
  const can = useCan('ui:error-details')
  if (!can) return null
  return (
    <details className="mt-3 max-w-full">
      <summary className="cursor-pointer rounded-mark text-meta font-medium text-link">Details</summary>
      <pre className="mt-2 max-h-72 overflow-auto rounded-control bg-sheet-2 p-2.5 font-mono text-label leading-relaxed whitespace-pre-wrap break-words text-ink">
        {[`${error.name}: ${error.message}`, error.stack ?? '', stack ? `Component stack:${stack}` : '']
          .filter(Boolean)
          .join(BLANK_LINE)}
      </pre>
    </details>
  )
}

interface Props {
  /** Changing this (e.g. the route) clears a caught error. */
  resetKey: string
  /** Offered as a way out when the error depends on the current filters. */
  onResetFilters?: () => void
  children: ReactNode
}

interface State {
  error: Error | null
  key: string
  /** React's component stack of the caught error (Developer mode shows it under "Details"). */
  stack?: string | null
}

/** Keeps one broken view from taking down the shell; says what happened and offers a way back. */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey, stack: null } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View failed to render', error, info.componentStack)
    this.setState({ stack: info.componentStack ?? null })
    const { route } = useCensus.getState()
    logDevError({ where: 'view render', view: route.view, tab: route.tab || null, message: error.message })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="mt-6 flex gap-3 rounded-sheet bg-sheet px-5 py-5">
        <SeverityIcon severity="critical" className="mt-1 size-4 shrink-0" />
        <div className="min-w-0">
          <h2 className="cut-head text-title font-semibold">This tab could not be drawn</h2>
          <p className="mt-1 max-w-[70ch] text-small text-ink-2">
            Something in the data or the current filters stopped it. The other tabs still work. Your data has
            not changed.
          </p>
          <p className="mt-2 font-mono text-meta break-words text-muted">{error.message}</p>
          <ErrorDetails error={error} stack={this.state.stack ?? null} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            {this.props.onResetFilters && (
              <Button size="sm" variant="ghost" onClick={this.props.onResetFilters}>
                Reset filters
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }
}

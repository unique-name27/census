import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, SeverityIcon } from '@/components/ui'

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
}

/** Keeps one broken view from taking down the shell; says what happened and offers a way back. */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View failed to render', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="mt-6 flex gap-3 rounded-sheet bg-sheet px-5 py-5">
        <SeverityIcon severity="critical" className="mt-1 size-4 shrink-0" />
        <div className="min-w-0">
          <h2 className="cut-head text-[16px] font-semibold">This tab could not be drawn</h2>
          <p className="mt-1 max-w-[70ch] text-[13px] text-ink-2">
            Something in the data or the current filters stopped it. The other tabs still work. Your data has
            not changed.
          </p>
          <p className="mt-2 font-mono text-[12px] break-words text-muted">{error.message}</p>
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

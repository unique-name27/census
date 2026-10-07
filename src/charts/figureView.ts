/**
 * Ask a figure on screen to show its chart or its table (Ask Census's `show_figure`, docs/ASK-ACTIONS.md
 * part 3): dispatch this event on the figure's element with `detail: { table: boolean }`. A figure
 * without a table toggle ignores it.
 */
export const FIGURE_VIEW_EVENT = 'figure:view'

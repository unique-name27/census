/** Class strings shared by the shell's own floating pickers (not part of the public barrel). */

/** Floating surface for pickers built directly on Base UI (matches ui.tsx menus and popovers). */
export const POPUP_SURFACE =
  'rounded-control bg-sheet text-ink shadow-(--shadow-pop) outline-none origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0'

/** Borderless search field at the top of a picker, with room for a leading search icon. */
export const SEARCH_INPUT =
  'h-9 w-full border-0 border-b border-rule bg-transparent pr-3 pl-8 text-small text-ink outline-none placeholder:text-muted'

/**
 * A table header cell's type, the same in every table (docs/DESIGN-REFRESH.md 2.8): sentence case,
 * 12px, medium, ink-2. Not the uppercase eyebrow, which is for section eyebrows only.
 */
export const TABLE_HEAD = 'text-meta font-medium text-ink-2'

/** A list row inside a picker. */
export const PICKER_ITEM =
  'mx-1 flex cursor-default items-center gap-2.5 rounded-chip px-2 py-1.5 text-small outline-none select-none data-[highlighted]:bg-hover'

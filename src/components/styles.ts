/** Class strings shared by the shell's own floating pickers (not part of the public barrel). */

/** Floating surface for pickers built directly on Base UI (matches ui.tsx menus and popovers). */
export const POPUP_SURFACE =
  'rounded-control bg-sheet text-ink shadow-(--shadow-pop) outline-none origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0'

/** Borderless search field at the top of a picker, with room for a leading search icon. */
export const SEARCH_INPUT =
  'h-9 w-full border-0 border-b border-rule bg-transparent pr-3 pl-8 text-[13px] text-ink outline-none placeholder:text-muted'

/** A list row inside a picker. */
export const PICKER_ITEM =
  'mx-1 flex cursor-default items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-[13px] outline-none select-none data-[highlighted]:bg-hover'

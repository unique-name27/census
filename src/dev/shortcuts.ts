/**
 * Every keyboard shortcut in Census (docs/ROLES.md, 3.14 and 5.3), the list the Developer
 * inventory shows and the help tests check the `shortcuts` article against. Each names its access
 * surface (`shortcut:<key>`), so the inventory shows the mode decision beside it. Pure.
 */
import type { ShortcutKey } from '@/access/surfaces'

export interface Shortcut {
  keys: string
  where: string
  what: string
  surface: ShortcutKey
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: '?', where: 'Everywhere outside a text field', what: 'Opens Help', surface: 'help' },
  {
    keys: 'Alt+A (Option+A)',
    where: 'Everywhere outside a text field',
    what: 'Opens Ask Census',
    surface: 'ask',
  },
  {
    keys: 'Tab, Shift+Tab',
    where: 'Everywhere',
    what: 'Moves between controls; the first Tab offers Skip to content',
    surface: 'keys',
  },
  {
    keys: 'Enter, Space',
    where: 'An underlined number',
    what: 'Opens the records behind it',
    surface: 'keys',
  },
  { keys: 'Esc', where: 'A panel, menu or popover', what: 'Closes it', surface: 'keys' },
  {
    keys: 'Left, Right, Home, End',
    where: 'Folder tabs and sub-tabs',
    what: 'Moves between tabs',
    surface: 'tabs',
  },
  {
    keys: 'Arrows, Enter, Space, Esc',
    where: 'A chart',
    what: 'Moves through the data, opens the records at a point, clears',
    surface: 'keys',
  },
  {
    keys: 'Right, Left, Esc',
    where: 'A guided tour',
    what: 'Next step, previous step, end',
    surface: 'tour',
  },
  {
    keys: 'Enter, Shift+Enter',
    where: 'The Ask composer',
    what: 'Asks the question; starts a new line',
    surface: 'ask',
  },
  { keys: '/', where: 'Org chart', what: 'Jumps to Find a person', surface: 'org' },
  {
    keys: 'Arrows, Home, End, Enter, Space, Esc',
    where: 'Org chart',
    what: 'Moves between people, opens or closes a card, clears the selection',
    surface: 'org',
  },
  { keys: '+, -', where: 'Org chart', what: 'Zooms in and out', surface: 'org' },
  {
    keys: 'Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y',
    where: 'Reorg sandbox',
    what: 'Undoes and redoes a move',
    surface: 'org',
  },
  {
    keys: 'Enter, Ctrl+Enter, Esc',
    where: 'Metric definitions',
    what: 'Saves a field, saves a longer text, cancels',
    surface: 'keys',
  },
  {
    keys: 'Alt+Shift+D (Option+Shift+D)',
    where: 'Everywhere, Developer mode only',
    what: 'Switches every debug overlay on or off',
    surface: 'dev-overlays',
  },
]

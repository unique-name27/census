/**
 * Changes to the official lists: add, rename, retire and restore, move under another parent,
 * change attributes, delete a value you added, make a proposed list official, or replace a list.
 * Every change is a short list of steps with exact inverses, logged with who and when, so any
 * change can be undone while no later change touched the same lists. Pure.
 */
import { canAdd, childLists, listDef, listKey } from './defs'
import { byValue } from './seed'
import type {
  AttrValue,
  EffectiveList,
  EffectiveLists,
  ListChange,
  ListDef,
  ListEdit,
  ListId,
  ListOp,
  ListsState,
  ListValue,
  SavedList,
  ValuePatch,
} from './types'

/** Change-list entries kept. Older ones can no longer be undone. */
export const MAX_LOG = 300
/** Longest name or attribute text accepted. */
export const MAX_TEXT = 120

export const EMPTY_LISTS: ListsState = { lists: {}, log: [] }

export interface EditOptions {
  by?: string | null
  now?: number
  /** Rows in the data that use a value (a value in use can't be deleted). */
  usage?: (list: ListId, value: string) => number
}

export type EditResult = { ok: true; state: ListsState; change: ListChange } | { ok: false; error: string }

type Lists = ListsState['lists']

let seq = 0
const makeId = (now: number) => {
  seq = (seq + 1) % 1_000_000
  return `lst-${now.toString(36)}-${seq.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`
}

const who = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

/** Trimmed, inner spaces collapsed. */
export const cleanName = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '')

/** Lower case for a sentence, keeping acronyms: "HR business partner", "business units". */
const lower = (s: string) =>
  s
    .split(' ')
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ')

/** A copy that shares nothing with the original. */
export function cloneValue(v: ListValue): ListValue {
  const out: ListValue = { value: v.value }
  if (v.parent !== undefined) out.parent = v.parent
  if (v.attrs) out.attrs = { ...v.attrs }
  if (v.retired) out.retired = true
  if (v.replacedBy) out.replacedBy = v.replacedBy
  if (v.builtIn) out.builtIn = true
  if (v.added) out.added = true
  return out
}

export const cloneSaved = (s: SavedList): SavedList => ({ ...s, values: s.values.map(cloneValue) })

/* ───────────── steps ───────────── */

function patchValue(v: ListValue, p: ValuePatch): ListValue {
  const out = cloneValue(v)
  if ('parent' in p) out.parent = p.parent ?? null
  if ('retired' in p) {
    if (p.retired) out.retired = true
    else delete out.retired
  }
  if ('replacedBy' in p) {
    if (p.replacedBy) out.replacedBy = p.replacedBy
    else delete out.replacedBy
  }
  if ('attrs' in p) {
    if (p.attrs && Object.keys(p.attrs).length) out.attrs = { ...p.attrs }
    else delete out.attrs
  }
  return out
}

/** Apply steps to saved lists. Lenient: a step that no longer fits (the value is gone) is skipped. */
export function applyOps(lists: Lists, ops: readonly ListOp[]): Lists {
  const out: Lists = { ...lists }
  const edit = (id: ListId, f: (values: ListValue[]) => ListValue[]) => {
    const s = out[id]
    if (!s) return
    out[id] = { ...s, values: f(s.values) }
  }
  for (const op of ops) {
    switch (op.op) {
      case 'save':
        if (op.after) out[op.list] = cloneSaved(op.after)
        else delete out[op.list]
        break
      case 'add':
        edit(op.list, (vs) => {
          if (vs.some((v) => v.value === op.value.value)) return vs
          const next = vs.slice()
          next.splice(Math.max(0, Math.min(op.index, next.length)), 0, cloneValue(op.value))
          return next
        })
        break
      case 'remove':
        edit(op.list, (vs) => vs.filter((v) => v.value !== op.value.value))
        break
      case 'rename':
        edit(op.list, (vs) =>
          vs.map((v) =>
            v.value === op.from || v.replacedBy === op.from
              ? {
                  ...cloneValue(v),
                  ...(v.value === op.from ? { value: op.to } : {}),
                  ...(v.replacedBy === op.from ? { replacedBy: op.to } : {}),
                }
              : v,
          ),
        )
        for (const child of childLists(op.list))
          edit(child.id, (vs) =>
            vs.map((v) => (v.parent === op.from ? { ...cloneValue(v), parent: op.to } : v)),
          )
        break
      case 'set':
        edit(op.list, (vs) => vs.map((v) => (v.value === op.value ? patchValue(v, op.after) : v)))
        break
    }
  }
  return out
}

/** The step that undoes `op`. */
export function invertOp(op: ListOp): ListOp {
  switch (op.op) {
    case 'save':
      return { ...op, before: op.after, after: op.before }
    case 'add':
      return { ...op, op: 'remove' }
    case 'remove':
      return { ...op, op: 'add' }
    case 'rename':
      return { ...op, from: op.to, to: op.from }
    case 'set':
      return { ...op, before: op.after, after: op.before }
  }
}

/** The lists a change's steps touch: renames also re-point the saved lists one level down. */
function touched(lists: Lists, ops: readonly ListOp[]): ListId[] {
  const out = new Set<ListId>()
  for (const op of ops) {
    out.add(op.list)
    if (op.op === 'rename') for (const c of childLists(op.list)) if (lists[c.id]) out.add(c.id)
  }
  return [...out]
}

/* ───────────── edits ───────────── */

/** The values of a list as the change sees them: saved, or as Census shows them now. */
const valuesOf = (state: ListsState, eff: EffectiveLists, id: ListId): readonly ListValue[] =>
  state.lists[id]?.values ?? eff[id].values

const basisOf = (list: EffectiveList): SavedList['basis'] =>
  list.source === 'sample'
    ? 'sample'
    : list.source === 'census'
      ? 'census'
      : list.source === 'data'
        ? 'data'
        : (list.basis ?? 'data')

const findValue = (values: readonly ListValue[], value: string) => values.find((v) => v.value === value)
const findLoose = (values: readonly ListValue[], value: string) =>
  values.find((v) => listKey(v.value) === listKey(value))

/** Attribute values from untrusted input, checked against the list's attributes. */
export function cleanAttrs(
  def: ListDef,
  raw: Record<string, unknown> | undefined,
): { ok: true; attrs: Record<string, AttrValue> } | { ok: false; error: string } {
  const attrs: Record<string, AttrValue> = {}
  if (!raw) return { ok: true, attrs }
  for (const a of def.attrs) {
    if (a.derived || !(a.key in raw)) continue
    const v = raw[a.key]
    if (v == null || (typeof v === 'string' && !v.trim())) {
      attrs[a.key] = null
      continue
    }
    if (a.type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).trim())
      if (!Number.isFinite(n) || n < 0)
        return { ok: false, error: `${a.label} must be a number of 0 or more.` }
      attrs[a.key] = n
      continue
    }
    const s = cleanName(String(v))
    if (s.length > MAX_TEXT)
      return { ok: false, error: `Keep the ${lower(a.label)} under ${MAX_TEXT} characters.` }
    if (a.options) {
      const hit = a.options.find((o) => lower(o) === lower(s))
      if (!hit) return { ok: false, error: `${a.label} must be one of ${a.options.join(', ')}.` }
      attrs[a.key] = hit
      continue
    }
    attrs[a.key] = s
  }
  return { ok: true, attrs }
}

function checkName(def: ListDef, raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = cleanName(raw)
  if (!name) return { ok: false, error: `Enter a ${lower(def.singular)}.` }
  if (name.length > MAX_TEXT) return { ok: false, error: `Keep the name under ${MAX_TEXT} characters.` }
  return { ok: true, name }
}

/** Where a new value goes: in name order on your own lists, at the end of Census's. */
function insertAt(def: ListDef, values: readonly ListValue[], v: ListValue): number {
  if (def.kind !== 'org') return values.length
  const i = values.findIndex((x) => byValue(x, v) > 0)
  return i < 0 ? values.length : i
}

type Built = { ok: true; ops: ListOp[]; what: string } | { ok: false; error: string }

function opsFor(
  state: ListsState,
  eff: EffectiveLists,
  edit: ListEdit,
  opts: EditOptions,
  at: string,
): Built {
  const def = listDef(edit.list)
  const id = def.id
  const one = lower(def.singular)
  const many = lower(def.label)
  const values = valuesOf(state, eff, id)
  // The first change to a list Census shows saves it whole. A proposed list stays proposed (a
  // draft) until you make it official, so a change never starts checking the data on its own.
  const proposed = !state.lists[id] && eff[id].status === 'proposed'
  const materialize: ListOp[] = state.lists[id]
    ? []
    : [
        {
          op: 'save',
          list: id,
          before: null,
          after: {
            values: eff[id].values.map(cloneValue),
            basis: basisOf(eff[id]),
            at,
            ...(proposed ? { draft: true } : {}),
          },
        },
      ]
  const fail = (error: string): Built => ({ ok: false, error })
  const done = (ops: ListOp[], what: string): Built => ({ ok: true, ops: [...materialize, ...ops], what })
  const parentValues = def.parent ? valuesOf(state, eff, def.parent) : []
  const parentDef = def.parent ? listDef(def.parent) : null
  const checkParent = (p: string | null | undefined): string | null => {
    if (!p || !parentDef) return null
    return findValue(parentValues, p) ? null : `"${p}" is not on the ${lower(parentDef.label)} list.`
  }
  const target = 'value' in edit ? findValue(values, edit.value as string) : undefined
  const missing = () => fail('That value is no longer on the list.')

  switch (edit.kind) {
    case 'add': {
      if (!canAdd(def))
        return fail(`${def.label} are fixed by Census. You can retire values but not add them.`)
      const n = checkName(def, edit.value)
      if (!n.ok) return n
      const dup = findLoose(values, n.name)
      if (dup)
        return fail(
          dup.retired
            ? `${def.label} already has "${dup.value}", retired. Restore it instead.`
            : `${def.label} already has "${dup.value}".`,
        )
      const perr = checkParent(edit.parent)
      if (perr) return fail(perr)
      const a = cleanAttrs(def, edit.attrs)
      if (!a.ok) return a
      const v: ListValue = { value: n.name, added: true }
      if (def.parent) v.parent = edit.parent ?? null
      const set = Object.fromEntries(Object.entries(a.attrs).filter(([, x]) => x != null))
      if (Object.keys(set).length) v.attrs = set
      return done(
        [{ op: 'add', list: id, value: v, index: insertAt(def, values, v) }],
        `Added "${n.name}" to ${many}.`,
      )
    }
    case 'add-many': {
      if (!canAdd(def))
        return fail(`${def.label} are fixed by Census. You can retire values but not add them.`)
      const ops: ListOp[] = []
      const working = values.slice()
      for (const raw of edit.values) {
        const name = cleanName(raw.value)
        if (!name || name.length > MAX_TEXT || findLoose(working, name)) continue
        const v: ListValue = { value: name, added: true }
        if (def.parent) v.parent = raw.parent && !checkParent(raw.parent) ? raw.parent : null
        const a = cleanAttrs(def, raw.attrs as Record<string, unknown> | undefined)
        if (a.ok) {
          const set = Object.fromEntries(Object.entries(a.attrs).filter(([, x]) => x != null))
          if (Object.keys(set).length) v.attrs = set
        }
        const index = insertAt(def, working, v)
        working.splice(index, 0, v)
        ops.push({ op: 'add', list: id, value: v, index })
      }
      if (!ops.length) return fail('Every value is already on the list.')
      const n = ops.length
      return done(ops, `Added ${n} ${n === 1 ? one : many} from the data.`)
    }
    case 'rename': {
      const v = findValue(values, edit.from)
      if (!v) return missing()
      if (def.kind === 'fixed') return fail(`${def.label} keep the names Census reads.`)
      if (def.kind === 'vocab' && v.builtIn)
        return fail(`"${v.value}" is one of Census's ${many}, so its name stays. Add your own value instead.`)
      const n = checkName(def, edit.to)
      if (!n.ok) return n
      if (n.name === v.value) return fail('Nothing would change.')
      const dup = values.find((x) => x !== v && listKey(x.value) === listKey(n.name))
      if (dup) return fail(`${def.label} already has "${dup.value}". Map the rows to it instead of renaming.`)
      // An official list one level down that names it as a parent follows the rename: saved first
      // if it was the sample's, so the change (and its undo) covers it. A proposed list follows the data.
      const children: ListOp[] = childLists(id)
        .filter((c) => !state.lists[c.id] && eff[c.id].status === 'official')
        .filter((c) => eff[c.id].values.some((x) => x.parent === v.value))
        .map((c) => ({
          op: 'save',
          list: c.id,
          before: null,
          after: { values: eff[c.id].values.map(cloneValue), basis: basisOf(eff[c.id]), at },
        }))
      return done(
        [...children, { op: 'rename', list: id, from: v.value, to: n.name }],
        `Renamed ${one} "${v.value}" to "${n.name}".`,
      )
    }
    case 'retire': {
      if (!target) return missing()
      if (target.retired) return fail('It is already retired.')
      const rb = cleanName(edit.replacedBy ?? '') || null
      if (rb) {
        const r = findValue(values, rb)
        if (!r || r.retired || r.value === target.value)
          return fail(`Choose an active ${one} other than "${target.value}" to replace it.`)
      }
      return done(
        [
          {
            op: 'set',
            list: id,
            value: target.value,
            before: { retired: !!target.retired, replacedBy: target.replacedBy ?? null },
            after: { retired: true, replacedBy: rb },
          },
        ],
        `Retired ${one} "${target.value}"${rb ? `, replaced by "${rb}"` : ''}.`,
      )
    }
    case 'restore': {
      if (!target) return missing()
      if (!target.retired) return fail('It is not retired.')
      return done(
        [
          {
            op: 'set',
            list: id,
            value: target.value,
            before: { retired: true, replacedBy: target.replacedBy ?? null },
            after: { retired: false, replacedBy: null },
          },
        ],
        `Restored ${one} "${target.value}".`,
      )
    }
    case 'move': {
      if (!parentDef) return fail(`${def.label} have no parent.`)
      if (!target) return missing()
      const to = cleanName(edit.parent ?? '') || null
      const perr = checkParent(to)
      if (perr) return fail(perr)
      if ((target.parent ?? null) === to) return fail('It is already there.')
      return done(
        [
          {
            op: 'set',
            list: id,
            value: target.value,
            before: { parent: target.parent ?? null },
            after: { parent: to },
          },
        ],
        to
          ? `Moved ${one} "${target.value}" to ${to}.`
          : `Cleared the ${lower(parentDef.singular)} of ${one} "${target.value}".`,
      )
    }
    case 'attrs': {
      if (!target) return missing()
      const a = cleanAttrs(def, edit.attrs)
      if (!a.ok) return a
      const before = { ...(target.attrs ?? {}) }
      const after = { ...before }
      const changed: string[] = []
      for (const [k, v] of Object.entries(a.attrs)) {
        if ((before[k] ?? null) === v) continue
        const ad = def.attrs.find((x) => x.key === k)
        if (target.builtIn && ad?.builtInFixed)
          return fail(`Census sets the ${lower(ad.label)} of its own ${many}.`)
        if (v == null) delete after[k]
        else after[k] = v
        changed.push(lower(ad?.label ?? k))
      }
      if (!changed.length) return fail('Nothing would change.')
      const list =
        changed.length < 2 ? changed[0] : `${changed.slice(0, -1).join(', ')} and ${changed.at(-1)}`
      return done(
        [{ op: 'set', list: id, value: target.value, before: { attrs: before }, after: { attrs: after } }],
        `Changed the ${list} of ${one} "${target.value}".`,
      )
    }
    case 'delete': {
      if (!target) return missing()
      if (!target.added) return fail('Only values you added can be deleted. Retire it instead.')
      const used = opts.usage?.(id, target.value) ?? 0
      if (used > 0)
        return fail(
          `${used.toLocaleString('en-US')} ${used === 1 ? 'row uses' : 'rows use'} it. Retire it instead, or map its rows to another value first.`,
        )
      for (const c of childLists(id)) {
        const kids = valuesOf(state, eff, c.id).filter((v) => v.parent === target.value).length
        if (kids)
          return fail(
            `It is the ${one} of ${kids} ${kids === 1 ? lower(c.singular) : lower(c.label)}. Move them first.`,
          )
      }
      return done(
        [{ op: 'remove', list: id, value: cloneValue(target), index: values.indexOf(target) }],
        `Deleted ${one} "${target.value}".`,
      )
    }
    case 'make-official': {
      if (eff[id].status === 'official') return fail('It is already official.')
      const saved = state.lists[id]
      // A draft becomes official; a list built for the other kind of data keeps checking whatever
      // is loaded; a list proposed from your data is saved as it is.
      const after: SavedList = saved
        ? saved.draft
          ? { ...cloneSaved(saved), draft: undefined }
          : { ...cloneSaved(saved), always: true }
        : { values: eff[id].values.map(cloneValue), basis: 'data', at }
      if (after.draft === undefined) delete after.draft
      return {
        ok: true,
        ops: [{ op: 'save', list: id, before: saved ? cloneSaved(saved) : null, after }],
        what: after.always
          ? def.refs.length
            ? `Kept checking the data against ${many}.`
            : `Kept using ${many}.`
          : `Made ${many} official.`,
      }
    }
    case 'replace': {
      // A whole list you chose, saved as it is. Starting a draft over keeps it a draft; a saved
      // list built for the other kind of data becomes one built on this basis, and checks it.
      const saved = state.lists[id]
      const after: SavedList = {
        values: edit.values.map(cloneValue),
        basis: edit.basis,
        at,
        ...(saved?.draft ? { draft: true } : {}),
      }
      return {
        ok: true,
        ops: [{ op: 'save', list: id, before: state.lists[id] ? cloneSaved(state.lists[id]) : null, after }],
        what:
          edit.basis === 'data'
            ? `Replaced ${many} with a list built from your data.`
            : `Replaced ${many} with ${edit.values.length.toLocaleString('en-US')} values.`,
      }
    }
  }
}

function logged(
  state: ListsState,
  lists: Lists,
  ops: ListOp[],
  what: string,
  by: string | null,
  now: number,
  undoes?: string,
): { state: ListsState; change: ListChange } {
  const change: ListChange = {
    id: makeId(now),
    at: new Date(now).toISOString(),
    by,
    what,
    lists: touched(state.lists, ops),
    ops,
    ...(undoes ? { undoes } : {}),
  }
  return { state: { lists, log: [change, ...state.log].slice(0, MAX_LOG) }, change }
}

/** Make one change, logged. */
export function applyEdit(
  state: ListsState,
  eff: EffectiveLists,
  edit: ListEdit,
  opts: EditOptions = {},
): EditResult {
  const now = opts.now ?? Date.now()
  const built = opsFor(state, eff, edit, opts, new Date(now).toISOString())
  if (!built.ok) return built
  const lists = applyOps(state.lists, built.ops)
  return { ok: true, ...logged(state, lists, built.ops, built.what, who(opts.by), now) }
}

export interface BatchResult {
  /** Unchanged when nothing applied. */
  state: ListsState
  change: ListChange | null
  applied: ListEdit[]
  rejected: { edit: ListEdit; error: string }[]
}

/** Several changes as one logged change (an import); each is checked against the state the earlier ones left. */
export function applyEdits(
  state: ListsState,
  eff: EffectiveLists,
  edits: readonly ListEdit[],
  what: string,
  opts: EditOptions = {},
): BatchResult {
  const now = opts.now ?? Date.now()
  const at = new Date(now).toISOString()
  let working = state
  const ops: ListOp[] = []
  const applied: ListEdit[] = []
  const rejected: BatchResult['rejected'] = []
  for (const e of edits) {
    const built = opsFor(working, eff, e, opts, at)
    if (!built.ok) {
      rejected.push({ edit: e, error: built.error })
      continue
    }
    ops.push(...built.ops)
    working = { ...working, lists: applyOps(working.lists, built.ops) }
    applied.push(e)
  }
  if (!ops.length) return { state, change: null, applied, rejected }
  const r = logged(state, working.lists, ops, what, who(opts.by), now)
  return { state: r.state, change: r.change, applied, rejected }
}

/** Replace whole lists (a settings file's) as one logged change; lists not given stay as they are. */
export function replaceLists(
  state: ListsState,
  lists: Partial<Record<ListId, SavedList>>,
  what: string,
  opts: Pick<EditOptions, 'by' | 'now'> = {},
): { state: ListsState; change: ListChange | null } {
  const now = opts.now ?? Date.now()
  const ops: ListOp[] = (Object.entries(lists) as [ListId, SavedList][]).map(([id, after]) => ({
    op: 'save',
    list: id,
    before: state.lists[id] ? cloneSaved(state.lists[id]) : null,
    after: cloneSaved(after),
  }))
  if (!ops.length) return { state, change: null }
  return logged(state, applyOps(state.lists, ops), ops, what, who(opts.by), now)
}

/* ───────────── undo ───────────── */

/**
 * A change can be undone while no later change touched any of its lists. An entry with no steps
 * (the move to job families containing job functions) has nothing to undo.
 */
export function canUndo(state: ListsState, changeId: string): boolean {
  const i = state.log.findIndex((c) => c.id === changeId)
  if (i < 0 || !state.log[i].ops.length) return false
  const lists = new Set(state.log[i].lists)
  // The log is newest first.
  return !state.log.slice(0, i).some((c) => c.lists.some((l) => lists.has(l)))
}

const baseWhat = (what: string) => what.replace(/^(Undid|Restored): /, '')

/**
 * Undo one change (or the latest that can be); logged as a change of its own, which can be undone
 * too. `reference` is the reference mapping change the undo made alongside it (undoing the
 * mapping the change made), so undoing the undo brings both back.
 */
export function undoChange(
  state: ListsState,
  changeId?: string,
  by?: string | null,
  now = Date.now(),
  reference?: string,
): ListsState {
  const entry = changeId
    ? state.log.find((c) => c.id === changeId)
    : state.log.find((c) => canUndo(state, c.id))
  if (!entry || !canUndo(state, entry.id)) return state
  const ops = entry.ops.slice().reverse().map(invertOp)
  const lists = applyOps(state.lists, ops)
  const what = `${entry.undoes ? 'Restored' : 'Undid'}: ${baseWhat(entry.what)}`
  const r = logged(state, lists, ops, what, who(by), now, entry.id)
  return reference ? withReference(r.state, r.change.id, reference) : r.state
}

/** Record the reference mapping change made with a list change, so undo covers both. */
export function withReference(state: ListsState, changeId: string, reference: string): ListsState {
  const i = state.log.findIndex((c) => c.id === changeId)
  if (i < 0 || state.log[i].reference === reference) return state
  const log = state.log.slice()
  log[i] = { ...log[i], reference }
  return { ...state, log }
}

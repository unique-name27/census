/** One attribute of a list value in a form: a choice from its options, or text. */
import { cx } from '@/components/ui'
import type { ListAttrDef } from '@/data/lists/types'
import { Select } from '@/views/data/ui/Select'
import { INPUT } from '../ui'

export function AttrField({
  attr,
  value,
  onChange,
}: {
  attr: ListAttrDef
  value: string
  onChange: (v: string) => void
}) {
  if (attr.options)
    return (
      <div className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-2">
        <span aria-hidden="true">{attr.label}</span>
        <Select label={attr.label} value={value} onChange={onChange}>
          <option value="">Not set</option>
          {attr.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </div>
    )
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-2">
      {attr.label}
      <input
        value={value}
        inputMode={attr.type === 'number' ? 'numeric' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cx(INPUT, 'w-full')}
      />
    </label>
  )
}

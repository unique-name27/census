/**
 * Catalog controls at the right of the view header: add an agent, and a menu to import or
 * download the "AI agents" sheet or reset to the sample.
 */
import { useRef } from 'react'
import { IconDownload, IconPencil, IconReset, IconUpload } from '@/components/icons'
import { Button, Menu } from '@/components/ui'
import { useAiAgents } from '../state'
import { exportSheet, importFile } from './actions'
import { useAiUi } from './uiState'

export function HeaderActions() {
  const input = useRef<HTMLInputElement>(null)
  const isDefault = useAiAgents((s) => s.isDefault)
  const count = useAiAgents((s) => s.agents.length)
  const openAdd = useAiUi((s) => s.openAdd)
  const confirmReset = useAiUi((s) => s.setConfirmReset)
  return (
    <>
      <Button icon={<IconPencil />} onClick={() => openAdd()}>
        Add agent
      </Button>
      <Menu
        width={260}
        trigger={<Button caret>Catalog</Button>}
        items={[
          { heading: 'AI agents sheet' },
          {
            label: 'Import from Excel',
            icon: <IconUpload />,
            hint: '.xlsx, .csv',
            onSelect: () => input.current?.click(),
          },
          {
            label: 'Download as Excel',
            icon: <IconDownload />,
            hint: '.xlsx',
            disabled: !count,
            onSelect: () => void exportSheet(),
          },
          { separator: true },
          {
            label: 'Reset to sample',
            icon: <IconReset />,
            disabled: isDefault,
            onSelect: () => confirmReset(true),
          },
        ]}
      />
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />
    </>
  )
}

/**
 * "Monthly people report" in the Scorecard header: one click builds the PowerPoint deck or the
 * Excel workbook for the current scope, with progress in a toast.
 */
import { useState } from 'react'
import { IconSlides, IconTable } from '@/components/icons'
import { toast, updateToast } from '@/components/toast'
import { Button, Menu } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { OTHER_VIEWS } from '../views'
import { downloadMonthlyReport, type ReportKind } from './monthlyReport'
import { useScorecard } from './useScorecard'

export function ReportMenu() {
  const ctx = useAnalytics()
  const engagementSurveys = useCensus((s) => s.engagementSurveys)
  const { model, updating } = useScorecard()
  const [busy, setBusy] = useState<ReportKind | null>(null)
  const ready = !!model && !updating

  const run = async (kind: ReportKind) => {
    if (!model) return
    setBusy(kind)
    const id = toast('Building the monthly people report', {
      description: 'Laying out each practice.',
      timeout: 0,
    })
    try {
      const result = await downloadMonthlyReport(kind, {
        ctx,
        model,
        views: OTHER_VIEWS,
        features: { engagementSurveys },
        onProgress: (p) => updateToast(id, p.title, { description: p.description }),
      })
      const left = result.failed.length
        ? ` ${result.failed.join(', ')} could not be laid out and ${result.failed.length === 1 ? 'was' : 'were'} left out.`
        : ''
      updateToast(id, kind === 'deck' ? 'Report slides downloaded' : 'Report workbook downloaded', {
        tone: 'good',
        description: `The scorecard, the findings and ${result.charts} practice charts.${left}${
          result.payDropped ? ' Pay amounts were left out.' : ''
        }`,
        timeout: 6000,
      })
    } catch (err) {
      console.error('Monthly people report failed', err)
      updateToast(id, 'The report did not finish', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Try again, or export each view on its own.',
        timeout: 8000,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Menu
      width={276}
      trigger={
        <Button data-tour="scorecard-report" icon={<IconSlides />} caret disabled={!ready || !!busy}>
          {busy ? 'Building report…' : 'Monthly people report'}
        </Button>
      }
      items={[
        { heading: 'Scorecard, findings and each practice' },
        {
          label: 'PowerPoint slides',
          icon: <IconSlides />,
          hint: '.pptx',
          onSelect: () => void run('deck'),
        },
        {
          label: 'Excel workbook',
          icon: <IconTable />,
          hint: '.xlsx',
          onSelect: () => void run('workbook'),
        },
      ]}
    />
  )
}

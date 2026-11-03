import { DownloadIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PageHeader } from '@/components/page-header'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Button } from '@/components/ui/button'
import { Card, CardPanel } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type PortfolioKey } from '@/lib/api'
import { portfolioLabel } from '@/lib/portfolios'
import { cn } from '@/lib/utils'

function download(markdown: string, filename: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Give the browser a moment to start the download before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ReportPage() {
  const { universe } = useUniverse()
  const [portfolio, setPortfolio] = useState<PortfolioKey>('max_sharpe')
  // Memoised so the debounced params keep their identity between renders.
  const params = useMemo(() => ({ portfolio }), [portfolio])
  const query = useLab('report', api.report, params)
  const markdown = query.data?.markdown

  return (
    <>
      <PageHeader title="Research report">
        One written summary of the chosen portfolio, built from a fixed set of analyses run on the
        current universe: construction, risk contributions, bootstrap stability, a walk-forward
        test, stress and crisis replays, and a comparison with SPY. The same inputs always give the
        same report, so it can be saved and compared later.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <CardPanel className="flex flex-col gap-4 py-5">
              <PortfolioSelect value={portfolio} onChange={setPortfolio} />
              <Button
                variant="outline"
                disabled={!markdown || query.stale}
                onClick={() =>
                  markdown &&
                  download(
                    markdown,
                    `portlab-report-${portfolio}-${new Date().toISOString().slice(0, 10)}.md`,
                  )
                }
              >
                <DownloadIcon aria-hidden="true" />
                Download .md
              </Button>
              <p className="text-muted-foreground text-xs">
                Markdown opens in any text editor and renders on GitHub, Notion or Obsidian.
                Universe: {universe.tickers.join(', ')}.
              </p>
            </CardPanel>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} title="Could not build the report" />
          {query.isPending && !query.error && (
            <Card>
              <CardPanel className="flex items-center gap-3 py-10 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                Running bootstrap, walk-forward, stress, crisis and benchmark analyses for{' '}
                {portfolioLabel(portfolio)}…
              </CardPanel>
            </Card>
          )}
          {markdown && (
            <Card className="relative">
              {query.stale && (
                <span className="absolute top-4 right-5 inline-flex items-center gap-2 text-muted-foreground text-xs">
                  <Spinner className="size-3.5" />
                  Updating…
                </span>
              )}
              <CardPanel className={cn('py-6 transition-opacity', query.stale && 'opacity-60')}>
                <article className="prose prose-sm dark:prose-invert max-w-none prose-table:text-sm prose-headings:tracking-tight">
                  <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
                </article>
              </CardPanel>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

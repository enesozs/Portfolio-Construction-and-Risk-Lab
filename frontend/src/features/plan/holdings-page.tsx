import { AlertTriangleIcon, DownloadIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { WeightBars } from '@/components/charts/allocation-charts'
import { NumberInput } from '@/components/number-input'
import { PageHeader } from '@/components/page-header'
import { PanelSection } from '@/components/panel-section'
import { PortfolioSelect } from '@/components/portfolio-select'
import { QueryError } from '@/components/query-error'
import { Stat, StatGrid } from '@/components/stat-grid'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useLab, useUniverse } from '@/features/universe/universe-context'
import { api, type HoldingsResponse, type PortfolioKey } from '@/lib/api'
import { fixed, integer, longDate, pct } from '@/lib/format'
import { portfolioLabel } from '@/lib/portfolios'

const EXAMPLE = 'AAPL 20\nMSFT 10\nNVDA 15\nJNJ 12\nXOM 25\nTLT 40'

function dollars(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : ''
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`
}

function shares(value: number, fractional: boolean): string {
  return fractional ? fixed(value, 3) : integer(value)
}

function downloadOrders(data: HoldingsResponse, fractional: boolean) {
  const rows = data.orders
    .filter((o) => Math.abs(o.trade_shares) > 1e-9)
    .map((o) =>
      [
        o.ticker,
        o.trade_shares > 0 ? 'BUY' : 'SELL',
        shares(Math.abs(o.trade_shares), fractional).replaceAll(',', ''),
        o.price.toFixed(2),
        Math.abs(o.trade_value).toFixed(2),
      ].join(','),
    )
  const csv = ['ticker,side,shares,price,value', ...rows].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `orders-${data.price_date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function OrdersTable({ data, fractional }: { data: HoldingsResponse; fractional: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base" render={<h2 />}>
            Orders
          </CardTitle>
          <CardDescription>
            Priced at the {longDate(data.price_date)} close. Sells come first in practice, so their
            proceeds pay for the buys; cash never goes below zero after costs.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadOrders(data, fractional)}>
          <DownloadIcon aria-hidden="true" />
          Download CSV
        </Button>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Held</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Weight now → after</TableHead>
              <TableHead className="text-right">Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.map((o) => {
              const side = o.trade_shares > 1e-9 ? 'buy' : o.trade_shares < -1e-9 ? 'sell' : null
              return (
                <TableRow key={o.ticker}>
                  <TableCell className="font-medium font-mono">{o.ticker}</TableCell>
                  <TableCell className="text-right tabular-nums">{dollars(o.price, 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {shares(o.current_shares, fractional)}
                  </TableCell>
                  <TableCell>
                    {side ? (
                      <Badge variant={side === 'buy' ? 'success' : 'warning'} size="sm">
                        {side === 'buy' ? 'Buy' : 'Sell'}{' '}
                        {shares(Math.abs(o.trade_shares), fractional)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">hold</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {side ? dollars(Math.abs(o.trade_value)) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {side ? dollars(o.cost, 2) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(o.current_weight, 1)} → {pct(o.weight_after, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(o.target_weight, 1)}
                  </TableCell>
                </TableRow>
              )
            })}
            <TableRow>
              <TableCell className="font-medium">Cash</TableCell>
              <TableCell colSpan={5} />
              <TableCell className="text-right tabular-nums">
                {dollars(data.cash_before)} → {dollars(data.cash_after)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

function RiskTable({ data, targetName }: { data: HoldingsResponse; targetName: string }) {
  const rows = [
    { name: 'Now', r: data.current },
    { name: `Target (${targetName})`, r: data.target },
    { name: 'After these orders', r: data.after },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" render={<h2 />}>
          What changes
        </CardTitle>
        <CardDescription>
          Ex-ante figures from the shared estimates, cash included at the cash rate. "After" differs
          from the target only by share rounding, skipped small trades and costs.
        </CardDescription>
      </CardHeader>
      <CardPanel className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Portfolio</TableHead>
              <TableHead className="text-right">Expected return</TableHead>
              <TableHead className="text-right">Volatility</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ name, r }) => (
              <TableRow key={name}>
                <TableCell className="font-medium">{name}</TableCell>
                {r ? (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {pct(r.expected_return, 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(r.volatility, 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fixed(r.sharpe, 2)}</TableCell>
                  </>
                ) : (
                  <TableCell colSpan={3} className="text-muted-foreground text-xs">
                    Holds assets outside the universe; add them to compare.
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardPanel>
    </Card>
  )
}

export default function HoldingsPage() {
  const { universe, setUniverse } = useUniverse()
  const textId = useId()
  const [text, setText] = useState(EXAMPLE)
  const [cash, setCash] = useState(2000)
  const [target, setTarget] = useState<PortfolioKey>('risk_parity')
  const [fractional, setFractional] = useState(false)
  const [minTrade, setMinTrade] = useState(100)
  const [costBps, setCostBps] = useState(5)
  const [bufferPct, setBufferPct] = useState(0)
  const query = useLab(
    'holdings',
    api.holdings,
    {
      holdings: text,
      cash,
      target,
      fractional,
      min_trade: minTrade,
      cost_bps: costBps,
      cash_buffer: bufferPct / 100,
    },
    { delay: 600 },
  )
  const data = query.data
  const held = data?.orders.filter((o) => o.current_shares > 0).map((o) => o.ticker) ?? []
  const assets = data ? [...data.orders.map((o) => o.ticker), 'CASH'] : []
  const toWeights = (key: 'current_weight' | 'target_weight' | 'weight_after') =>
    data
      ? {
          ...Object.fromEntries(data.orders.map((o) => [o.ticker, o[key]])),
          CASH:
            key === 'weight_after'
              ? data.cash_after / data.total
              : key === 'current_weight'
                ? data.cash_before / data.total
                : 1 - data.orders.reduce((s, o) => s + o.target_weight, 0),
        }
      : {}

  return (
    <>
      <PageHeader title="My portfolio">
        From what you hold to what to trade. Paste your holdings, pick a target from the
        construction methods, and get whole-share orders that respect your cash, trading costs and a
        minimum trade size, plus what the trades change in expected risk and return.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside>
          <Card className="overflow-hidden">
            <PanelSection
              title="Holdings"
              hint='One per line: "AAPL 20" for shares or "AAPL $5000" for a dollar value. Kept in this page only.'
            >
              <Label htmlFor={textId} className="sr-only">
                Holdings
              </Label>
              <Textarea
                id={textId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="font-mono"
              />
              <NumberInput
                label="Cash"
                value={cash}
                onChange={setCash}
                min={0}
                max={100_000_000}
                step={100}
                unit="$"
              />
              {data && [...held].sort().join(',') !== [...universe.tickers].sort().join(',') && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setUniverse({ ...universe, tickers: held })}
                  disabled={held.length < 2}
                >
                  Use my holdings as the universe
                </Button>
              )}
            </PanelSection>
            <Separator />
            <PanelSection title="Target" hint="Built from the shared universe and its constraints.">
              <PortfolioSelect label="Method" value={target} onChange={setTarget} />
            </PanelSection>
            <Separator />
            <PanelSection title="Trading rules">
              <Label className="justify-between">
                Fractional shares
                <Switch
                  aria-label="Fractional shares"
                  checked={fractional}
                  onCheckedChange={setFractional}
                />
              </Label>
              <NumberInput
                label="Skip trades smaller than"
                value={minTrade}
                onChange={setMinTrade}
                min={0}
                max={100_000}
                step={50}
                unit="$"
              />
              <NumberInput
                label="Cost per dollar traded"
                value={costBps}
                onChange={setCostBps}
                min={0}
                max={200}
                unit="bp"
              />
              <NumberInput
                label="Keep in cash"
                value={bufferPct}
                onChange={setBufferPct}
                min={0}
                max={90}
                unit="%"
              />
            </PanelSection>
          </Card>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          <QueryError error={query.error} title="Could not build the orders" />
          {data && (
            <>
              {data.problems.length > 0 && (
                <Alert variant="warning">
                  <AlertTriangleIcon aria-hidden="true" />
                  <AlertTitle>Some lines were skipped</AlertTitle>
                  <AlertDescription>
                    <p>{data.problems.join('; ')}</p>
                  </AlertDescription>
                </Alert>
              )}
              {data.outside_universe.length > 0 && (
                <Alert variant="info">
                  <AlertTriangleIcon aria-hidden="true" />
                  <AlertTitle>
                    {data.outside_universe.join(', ')}{' '}
                    {data.outside_universe.length > 1 ? 'are' : 'is'} not in the research universe
                  </AlertTitle>
                  <AlertDescription>
                    <p>
                      The target only allocates across the universe, so these are sold. Add them to
                      the universe (button on the left) to include them in the analysis.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              <StatGrid className="grid-cols-2 md:grid-cols-5">
                <Stat label="Account value" value={dollars(data.total)} hint="holdings + cash" />
                <Stat
                  label="Traded (one-way)"
                  value={pct(data.turnover, 1)}
                  hint={dollars(data.turnover * data.total)}
                />
                <Stat
                  label="Estimated costs"
                  value={dollars(data.total_cost, 2)}
                  hint={`${costBps} bp per dollar`}
                />
                <Stat label="Cash after" value={dollars(data.cash_after)} />
                <Stat
                  label="Gap to target"
                  value={pct(data.tracking_gap, 2)}
                  hint="from rounding and skipped trades"
                />
              </StatGrid>
              <WeightBars
                title="Weights now, target and after trading"
                description={`Share of the account in each asset and in cash. The target is ${portfolioLabel(target)} on the shared universe.`}
                guide={
                  <p>
                    The after-trading bars sit on the target except where whole shares cannot hit it
                    exactly, where a trade was too small to place, or where costs used a little
                    cash. Expensive shares in a small account show the biggest gaps.
                  </p>
                }
                assets={assets}
                series={[
                  { name: 'Now', weights: toWeights('current_weight') },
                  { name: 'Target', weights: toWeights('target_weight') },
                  { name: 'After', weights: toWeights('weight_after') },
                ]}
                stale={query.stale}
                className="h-72"
              />
              <RiskTable data={data} targetName={portfolioLabel(target)} />
              <OrdersTable data={data} fractional={fractional} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

import { ArrowRightIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RegionGuide } from '@/content/guides'
import { AnnotatedScreen } from './annotated-screen'
import { CHAPTERS } from './chapters'

/** The layout every page shares, explained on the walk-forward page. */
const LAYOUT: RegionGuide[] = [
  {
    key: 'universe-bar',
    label: 'The shared universe',
    what: 'The assets, sample dates, cash rate and estimators every page uses, with the button that edits them.',
    read: [
      'Change the universe once and every page follows: construction, risk, validation, planning.',
      'A warning appears when a young asset shortens the sample, or when prices come from the saved copy because Yahoo Finance was unreachable.',
      'Constraints (caps, long-short, sector limits) live in the same dialog, so every method obeys the same rules.',
    ],
  },
  {
    key: 'panel',
    label: 'Page settings on the left',
    what: 'What this page lets you vary: a method, a window, a cost, a model.',
    read: [
      'Drag a slider for intuition or type an exact value; both edit the same number.',
      'Segmented buttons (Monthly | Quarterly) pick one choice among a few.',
      'Results update by themselves shortly after you stop changing things; there is no “run” button.',
    ],
  },
  {
    key: 'stats',
    label: 'The headline numbers',
    what: 'The page’s answer in a row of tiles, each with a short note on what it is compared with.',
    read: [
      'Read these first; the charts below explain where they come from.',
      'The grey note under a number often holds the comparison that matters (“vs equal weight”, “base 1.31”).',
    ],
  },
  {
    key: 'Growth of $1, out of sample',
    label: 'Charts',
    what: 'Each chart has a title, a sentence on what to look for, and a “How to read this chart” section.',
    read: [
      'Hover anywhere on a chart for exact values at that date or point.',
      'The legend names every line; text is never coloured, only the marks are.',
    ],
  },
  {
    key: 'Out-of-sample performance',
    label: 'Tables',
    what: 'Exact numbers when a chart would be too coarse, usually one row per portfolio or method.',
    read: [
      'Rows share one test period, so they compare directly.',
      'Sharpe and Sortino ratios are always measured against cash, never against zero.',
    ],
  },
]

const UNITS: [string, string, string][] = [
  [
    'Returns and volatility',
    '% a year (annualised)',
    'From daily data: means × 252, volatilities × √252.',
  ],
  ['Weights', '% of the portfolio', 'They add up to 100% including CASH; shorts are negative.'],
  [
    'Sharpe ratio',
    'Excess return ÷ volatility',
    'Return above the T-bill rate per unit of risk. 0.5 is ordinary, above 1 is rare out of sample.',
  ],
  ['Cash rate', '% a year', 'The 13-week Treasury bill yield, day by day, unless set by hand.'],
  [
    'Costs',
    'Basis points (bp) per dollar traded',
    '5 bp = 0.05%: buying and selling 10,000 dollars costs 5 dollars.',
  ],
  [
    'Turnover',
    'One-way, % of the portfolio',
    'Moving 10% from one asset to another is 10% turnover.',
  ],
  [
    'VaR and shortfall',
    '% of wealth over one day',
    'A 99% VaR of 2% means one day in a hundred loses more than 2%.',
  ],
  [
    'Planner amounts',
    'Today’s dollars',
    'Inflation is removed, so 1M in year 30 buys what 1M buys now.',
  ],
]

const CHART_CONVENTIONS: [string, string][] = [
  [
    'Growth of $1',
    'What one dollar invested at the start became. On long samples the axis switches to a log scale, where equal percentage moves look equal.',
  ],
  [
    'Stacked bars and areas',
    'Shares of the portfolio. Each asset keeps its colour on every page (universe order); past eight assets they fold into “Other”, and cash is grey.',
  ],
  [
    'Grouped bars',
    'Assets along the axis, one bar per portfolio being compared, at most four at once.',
  ],
  [
    'Shaded bands',
    'A range of simulated outcomes: the middle 50% (dark) and 90% (light) of paths around the median line.',
  ],
  [
    'Histograms',
    'Bars counting simulated outcomes as a share of all paths; long thin tails are rare but large outcomes.',
  ],
  [
    'Heatmaps',
    'A grid coloured blue for positive and red for negative, grey near zero (correlations, exposures). Hover a cell for its value.',
  ],
  [
    'Whiskers',
    'A dot with a line through it: an estimate and its 95% interval. If the line crosses zero, the effect may be noise.',
  ],
  ['Faded charts', 'A new result is being computed; the old one stays visible until it arrives.'],
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t pt-10">
      <h2 className="mb-4 font-semibold text-xl tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function TwoColumn({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid max-w-5xl gap-x-10 gap-y-4 md:grid-cols-2">
      {rows.map(([term, text]) => (
        <div key={term} className="border-b pb-3">
          <dt className="font-medium">{term}</dt>
          <dd className="mt-1 text-muted-foreground text-sm">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function StartPage() {
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="flex max-w-6xl flex-col gap-10">
      <div>
        <Link to="/learn" className="text-muted-foreground text-sm hover:text-foreground">
          ← All chapters
        </Link>
        <h1 className="mt-3 font-semibold text-3xl tracking-tight">
          Start here: how to use the lab
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Every page works on the same universe of assets, follows the same layout and draws charts
          the same way. Ten minutes here make every later page easier to read.
        </p>
      </div>

      <Section id="layout" title="1. One universe, one layout">
        <p className="mb-6 max-w-3xl text-muted-foreground">
          This is the walk-forward test, one of the validation pages. Hover the numbers.
        </p>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <AnnotatedScreen
              screenId="validate-walk-forward"
              regions={LAYOUT}
              active={active}
              onActive={setActive}
              alt="The walk-forward page with its layout regions numbered"
            />
          </div>
          <ol className="flex flex-col gap-3">
            {LAYOUT.map((r, i) => (
              <li
                key={r.key}
                id={`validate-walk-forward-${i}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="rounded-xl border p-4 text-sm"
              >
                <p className="mb-1.5 font-semibold">
                  {i + 1}. {r.label}
                </p>
                <p>{r.what}</p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">
                  {r.read.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-6 max-w-3xl text-muted-foreground text-sm">
          Above every page: the areas (Universe, Construct, Dynamic, …), the pages of the current
          area, and a “Learn this area” link to the matching chapter. Top right, a green dot shows
          the API is connected, and the moon/sun switches dark mode.
        </p>
      </Section>

      <Section id="units" title="2. Reading the numbers">
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4">Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="pe-4">Example</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {UNITS.map(([q, u, e]) => (
                <TableRow key={q}>
                  <TableCell className="ps-4 font-medium">{q}</TableCell>
                  <TableCell>{u}</TableCell>
                  <TableCell className="pe-4 whitespace-normal text-muted-foreground">
                    {e}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section id="charts" title="3. Reading the charts">
        <TwoColumn rows={CHART_CONVENTIONS} />
      </Section>

      <Section id="evidence" title="4. Estimates, backtests and simulations">
        <TwoColumn
          rows={[
            [
              'Expected numbers are estimates',
              '“Expected return” and “expected volatility” come from the sample’s history. Volatility is estimated well from a few years; average returns are not, and they are what the most aggressive methods lean on.',
            ],
            [
              'In-sample flatters',
              'A portfolio judged on the same data that built it looks better than it will. The walk-forward and compare pages re-estimate using only the past at each date: that is the honest test.',
            ],
            [
              'Always against a yardstick',
              'Strategies are shown beside equal weight, their own base portfolio, buy-and-hold and cash. A good-looking line means little until it beats the simple alternative after costs.',
            ],
            [
              '± after a simulated number',
              'The Monte Carlo standard error: how much the number would move with a different random seed. It is small; the uncertainty in the inputs is much larger.',
            ],
            [
              'Trying many settings',
              'Pick the best of ten variants and it will look good by luck. The dynamic and compare pages report probabilities deflated for the variants tried.',
            ],
            [
              'Hindsight in the universe',
              'Tickers chosen today are the ones that survived and became famous. Every result on a hand-picked universe carries that tilt, which no statistic can remove.',
            ],
          ]}
        />
      </Section>

      <Section id="caveats" title="5. What the numbers are not">
        <ul className="max-w-3xl list-disc space-y-2 ps-5 text-muted-foreground">
          <li>
            Not forecasts. A probability on these pages is a probability <em>under a model</em>{' '}
            fitted to the past.
          </li>
          <li>
            Not advice. The trade list on the My portfolio page shows what a rule implies, not what
            anyone should do.
          </li>
          <li>
            Not live trading data. Prices are end-of-day adjusted closes from Yahoo Finance, cached
            for half a day; the factor library lags by about a month.
          </li>
        </ul>
      </Section>

      <Section id="route" title="6. How to go through the course">
        <p className="mb-4 max-w-3xl text-muted-foreground">
          The chapters follow the order a portfolio is built in: understand the assets, construct an
          allocation, move it with signals, measure its risk, validate it out of sample, explain its
          returns, then turn it into trades and a plan. Each chapter has two tabs:{' '}
          <strong>Using the pages</strong> (a tour of every page, with experiments) and{' '}
          <strong>Theory</strong> (the ideas behind them).
        </p>
        <ol className="mb-6 grid max-w-4xl gap-2 text-sm md:grid-cols-2">
          {CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <Link to={`/learn/${c.id}`} className="underline-offset-4 hover:underline">
                {i + 1}. {c.title}
              </Link>
            </li>
          ))}
        </ol>
        <Button render={<Link to={`/learn/${CHAPTERS[0].id}`} />}>
          Begin with chapter 1 <ArrowRightIcon />
        </Button>
      </Section>
    </div>
  )
}

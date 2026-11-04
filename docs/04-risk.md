# 04 · Risk: decomposition, stress, VaR and simulation

A portfolio's weights say where the money is. This chapter is about where the *risk* is: which
assets cause the volatility, what happens when correlations break down, how bad a bad day can
be, and how wide the range of futures is. Pages: *Risk → Decomposition, Stress & scenarios,
Crisis replay, VaR backtest, Monte Carlo*. Code: `risk/`, `research/diversification.py`,
`allocation/overlays.py`, `simulation/monte_carlo.py`.

Symbols: $w$ is the vector of portfolio weights, $\Sigma$ the covariance matrix of asset
returns, $\sigma_i$ asset $i$'s volatility and $\rho_{ij}$ the correlation between two assets.

---

## 1. Where the volatility comes from

Portfolio variance is a sum over every *pair* of assets:

$$\sigma_p^2 = w^\top \Sigma\, w = \sum_i \sum_j w_i w_j \sigma_i \sigma_j \rho_{ij}.$$

With $n$ assets there are $n$ variance terms and $n(n-1)$ covariance terms, so for a portfolio
of more than a few assets the correlations matter more than any single volatility.

**Marginal risk** is how much portfolio volatility rises per unit of extra weight in asset $i$:

$$\mathrm{MR}_i = \frac{\partial \sigma_p}{\partial w_i} = \frac{(\Sigma w)_i}{\sigma_p}.$$

$(\Sigma w)_i$ is the covariance of asset $i$ with the whole portfolio, so marginal risk depends
on the asset's volatility *and* on how it moves with everything else. A volatile asset that moves
against the rest can have a small, even negative, marginal risk.

**Component risk** is weight times marginal risk, $\mathrm{CR}_i = w_i\,\mathrm{MR}_i$. The
components add up exactly to the portfolio volatility:

$$\sum_i w_i \frac{\partial \sigma_p}{\partial w_i} = \sigma_p.$$

This is **Euler's theorem** for functions that scale with their inputs: doubling every weight
doubles $\sigma_p$, and any such function equals the sum of its inputs times its partial
derivatives. Dividing by $\sigma_p$ gives each asset's **risk share**, which sums to 100% like
the weights do. Risk parity is the portfolio whose risk shares are all equal.

The first lesson of the page is that **equal capital is not equal risk**. In a 1/n portfolio
of stocks and a Treasury fund, the stocks typically cause nearly all the volatility: they are
both more volatile and more correlated with each other. A negative risk share means the asset
hedges the rest, so adding a little more would lower total volatility.

---

## 2. Measuring diversification

**Diversification ratio** (Choueifaty & Coignard, 2008): the weighted average asset volatility
divided by the portfolio volatility,

$$\mathrm{DR} = \frac{\sum_i w_i \sigma_i}{\sigma_p}.$$

If every correlation were 1, $\sigma_p$ would equal the weighted average and DR would be 1. Lower
correlations shrink $\sigma_p$ and push DR above 1. The page also shows the **diversification
benefit**, $\sum_i w_i\sigma_i - \sigma_p$: the volatility removed by mixing, in percentage points.
The **marginal diversification** chart removes one asset at a time, rescales the rest, and
reports how much DR falls. A large value marks an asset doing real diversifying work.

**Effective number of assets** counts how many assets the weights are really spread over:
- **HHI version.** The Herfindahl–Hirschman index $\mathrm{HHI} = \sum_i w_i^2$, and
  $N_{\text{eff}} = 1/\mathrm{HHI}$.
- **Entropy version.** $N_{\text{eff}} = \exp\!\big(-\sum_i w_i \ln w_i\big)$.

Both give $n$ for equal weights and 1 for a single asset. HHI is pulled down mostly by the
largest weights, entropy responds more to the small ones. Both count *capital*, not risk: six
equal weights in six highly correlated stocks score 6 while behaving like about one.

---

## 3. Volatility targeting

The simplest way to change risk without changing the mix is to blend it with cash. Scale the
risky weights by $k$ and hold $1-k$ in cash:

$$k = \frac{\sigma^*}{\sigma_p}, \qquad \sigma = k\,\sigma_p, \qquad \mathbb{E}[r] = k\,\mu_p + (1-k)\,r_f.$$

Cash has no volatility and no correlation with anything, so volatility scales one for one with
the risky share, and expected return moves along a straight line toward the cash rate (this is
the capital market line from the construction chapter). Without leverage, $k$ is capped at 1:
a target above the portfolio's own volatility leaves it unchanged. With *Allow leverage*, $k$ can
go up to *Max gross exposure*, the cash weight turns negative, and the borrowing is assumed to
cost the cash rate. Real borrowing costs more, so the leveraged line is optimistic.

---

## 4. Stress tests: when the estimates are too calm

The covariance matrix is estimated over a sample that mixes calm and turbulent periods. In a
sell-off two things happen at once: volatilities jump, and **correlations rise toward +1**.

Why do correlations rise in crises?
- **One factor dominates.** In normal times, company news and sector news move assets
  separately. In a panic, the common factor (the market, or the need for cash) swamps the rest.
- **Forced selling.** Leveraged investors facing margin calls sell whatever they can, so assets
  that have nothing in common fall together.
- **A statistical effect.** Even with an unchanged structure, measured correlation is higher in
  periods of high volatility (Forbes & Rigobon, 2002). Either way, diversification shrinks when
  it is needed most.

The lab stresses the covariance matrix with two levers. With $R$ the correlation matrix,
$\mathbf{1}\mathbf{1}^\top$ the all-ones matrix and $\alpha$ the *Push correlations toward +1*
setting,

$$R_{\text{stressed}} = (1-\alpha)\,R + \alpha\,\mathbf{1}\mathbf{1}^\top, \qquad \sigma_i^{\text{stressed}} = m\,\sigma_i,$$

with $m$ the *Volatility multiplier*. A blend of two valid correlation matrices is a valid
correlation matrix, so the stressed one can always be used. At $\alpha = 1$ every pair moves in
lockstep and, for a long-only portfolio, $\sigma_p = \sum_i w_i\sigma_i$: the diversification
ratio collapses to 1. The multiplier scales the whole curve by $m$. A portfolio whose volatility
rises steeply with $\alpha$ is one that relies on low correlations, as minimum-variance and
maximum-diversification portfolios do by design.

Bonds are a special case. The stock–bond correlation has been negative in most of the last two
decades, which makes Treasuries a hedge, but it turned positive in 2022, when inflation drove
both down together. A correlation that changes *sign* is a regime change, not a stronger
version of the same regime.

### Custom scenarios

A **scenario** is a one-off return $s_i$ for each asset. The portfolio's return is

$$r_p = \sum_i w_i s_i,$$

and each term $w_i s_i$ is that asset's contribution. The presets (*Equity crash*, *Rate shock*,
*Everything falls*) treat Treasuries, aggregate bonds and gold as defensive. A scenario is a
what-if, not a forecast: it has no probability attached, and assumes no rebalancing.

---

## 5. Historical crisis replays

A replay buys **today's weights** at the start of a past episode and holds them through it: the dot-com bust, the global financial crisis, the 2011 eurozone and US downgrade
scare, the Q4 2018 sell-off, the COVID crash, the 2022 rate shock and the 2025 tariff shock.
The holdings are never traded, so each position grows with its own asset and the weights drift:
wealth on day $t$ is $\sum_i w_i \prod_{s \le t}(1 + r_{i,s})$. Nothing is rebalanced or
re-optimised during the crisis, so assets that fall hardest also shrink as a share of the
portfolio, as they would for a real buy-and-hold investor.

Three details matter:
- **Full histories.** Replays use each asset's whole price history, independent of the
  research window, so a five-year research sample can still replay 2008.
- **Missing assets.** An asset that had not started trading is dropped and its weight is spread
  over the others in proportion, $w_i / \sum_{j \in \text{available}} w_j$. That row tests a
  slightly different portfolio, and the page says how much weight moved.
- **Recovery past the window.** Crisis windows usually end near the bottom, so recovery is
  measured on the data that follows: the number of trading days from the trough until the
  holdings regain their pre-crisis peak, or "not recovered" if they have not yet.

A replay of a crisis *inside* the research window is partly hindsight, because that crisis also
shaped the estimates behind the weights.

---

## 6. Value at Risk and expected shortfall

Let $L = -r$ be the loss on a day. At confidence $c$ (say 99%):
- **Value at Risk** is the loss exceeded with probability $1-c$:
  $\mathrm{VaR}_c = -q_{1-c}(r)$, where $q$ is a quantile. A 1-day 99% VaR of 2% means "on one
  day in a hundred we expect to lose more than 2%".
- **Expected shortfall** (ES, also CVaR) is the average loss on those days:
  $\mathrm{ES}_c = \mathbb{E}[L \mid L \ge \mathrm{VaR}_c]$.

VaR says where the tail starts and nothing about how long it is. Two portfolios with the same
VaR can have very different worst days. ES looks inside the tail and is **subadditive**: the ES
of a combined portfolio is never more than the sum of the parts, which VaR does not guarantee.
That is why Basel moved bank capital from VaR to ES.

**Daily vs horizon.** The VaR page is about 1-day VaR. If daily returns were independent and
normal with zero mean, a $h$-day VaR would be $\sqrt{h}$ times the 1-day one. Real returns have
volatility clustering and fat tails, so the Monte Carlo page simulates horizon losses directly
instead of scaling.

### Four VaR models

Each model forecasts tomorrow's VaR from a trailing window of the portfolio's daily returns.
With $z = \Phi^{-1}(1-c)$ (negative, about $-2.33$ at 99%):

| Model | Forecast | Character |
|---|---|---|
| Historical | $-q_{1-c}$ of the window's returns | no shape assumed; slow after a calm year |
| Normal | $-(\hat\mu + z\,\hat\sigma)$ of the window | thin tails; too many exceptions at 99% |
| EWMA (RiskMetrics) | $-z\,\sigma_t$ | volatility adapts within days |
| Filtered historical | $-q_{1-c}(r/\sigma)\cdot\sigma_t$ | fat tails and adaptive volatility |

The **EWMA** variance of RiskMetrics (J.P. Morgan, 1996) updates every day:

$$\sigma_t^2 = \lambda\,\sigma_{t-1}^2 + (1-\lambda)\,r_{t-1}^2, \qquad \lambda = 0.94.$$

Weights on past days decay geometrically, with an average memory of $1/(1-\lambda) \approx 16$
days. **Filtered historical simulation** (Barone-Adesi et al., 1999) divides each past return
by the EWMA volatility of its day, takes the empirical quantile of those standardised returns,
and multiplies by today's volatility. The shape of the tail comes from history; its *size*
comes from current conditions.

---

## 7. Backtesting VaR

A VaR model makes a testable claim. Each day $t$, forecast $\mathrm{VaR}_t$ from data before $t$,
and record an **exception** when $L_t > \mathrm{VaR}_t$. A correct 99% model should show:
1. the right **number** of exceptions, about 1% of days;
2. exceptions that arrive **independently**, not in clusters.

**Kupiec's proportion-of-failures test** (1995) checks the count. With $x$ exceptions in $n$
days, expected rate $p = 1-c$ and observed rate $\hat p = x/n$,

$$\mathrm{LR}_{\text{POF}} = -2\ln\frac{(1-p)^{\,n-x}\,p^{\,x}}{(1-\hat p)^{\,n-x}\,\hat p^{\,x}} \sim \chi^2_1.$$

Too many exceptions means risk was understated; far too few, that it was overstated.

**Christoffersen's independence test** (1998) checks the timing. Count transitions $n_{ij}$ from
state $i$ yesterday to $j$ today (1 = exception), and compare the probability of an exception
after a calm day, $\pi_{01} = n_{01}/(n_{00}+n_{01})$, with the probability after an exception,
$\pi_{11} = n_{11}/(n_{10}+n_{11})$. If they differ, exceptions cluster, which means the model
reacts too slowly when volatility rises. The likelihood ratio is again $\chi^2_1$.
**Conditional coverage** adds the two statistics and tests both at once ($\chi^2_2$).

Each p-value answers: if the model were right, how surprising would this record be? Below 5%,
the test rejects. Above, there is no evidence against the model, which is weaker than proof it
is right. At 99% over four years only about ten exceptions are expected, so the tests have
little power to tell good models from mediocre ones.

**The Basel traffic light** counts 99% exceptions over the last 250 days: 0–4 green, 5–9
yellow, 10 or more red. Under the Basel rules a bank's capital multiplier rises in the yellow
zone, and a red-zone result normally means the model must be revised.

Note what is out of sample here: each VaR forecast uses only earlier days. The portfolio weights
themselves come from the shared estimates, so they were chosen with the whole window in view.

### Component VaR and ES

Euler allocation works for any risk measure that scales with the weights. The page splits:
- **parametric VaR**, $z\,\sigma_p$ with a zero mean and the daily sample covariance, into
  $\mathrm{VaR}_i = |z|\, w_i (\Sigma w)_i / \sigma_p$;
- **historical ES** into $\mathrm{ES}_i = -w_i\,\mathbb{E}[r_i \mid r_p \le q_{1-c}(r_p)]$: each
  asset's average return on the portfolio's worst days.

Both sets of pieces sum to the totals. Both use the whole research window, so they describe the
typical tail rather than today's.

---

## 8. Monte Carlo simulation

Closed forms answer narrow questions (the volatility of a fixed mix, the VaR of a normal). Many
useful questions have none: the chance of a 20% drawdown at some point in two years, the range of
wealth after five years when weights drift, or how often all assets crash together. **Monte
Carlo** simulates thousands of possible futures, asset by asset, and reads the answers off the
simulated paths.

### Five return models

1. **Normal.** $r = \mu/252 + L z$ with $z$ independent standard normals and $LL^\top$ the daily
   covariance (Cholesky). Thin tails: the textbook baseline.
2. **Joint Student-t.** The same, but each day every asset's shock is divided by one shared
   draw, $z / \sqrt{W/\nu}$ with $W \sim \chi^2_\nu$, and rescaled by $\sqrt{(\nu-2)/\nu}$ so the
   covariance is unchanged. A small $W$ makes the day extreme for *all* assets at once, so tails
   are fat and joint. Lower *Degrees of freedom* $\nu$ means fatter tails.
3. **t-copula with empirical marginals.** A **copula** separates "how each asset behaves on its
   own" from "how they move together" (Sklar's theorem). Each asset keeps its own historical
   return distribution, shifted to the model's mean. Joint behaviour comes from a Student-t
   copula whose correlation is estimated on normal scores of the history. Here $\nu$ sets only
   the **tail dependence**: lower values make extreme days more often shared.
4. **Two-regime Markov model.** History is split into calm and stressed days by the
   equal-weight portfolio's trailing 21-day volatility, with the threshold chosen by two-cluster
   k-means on log volatility. Each regime gets its own mean and covariance. Each day the
   simulation stays in its regime or switches, with the observed day-to-day frequencies, and it
   starts in today's regime. A regime kept with probability $p$ lasts $1/(1-p)$ days on average,
   so crises arrive as lasting spells of high volatility *and* correlation.
5. **Block bootstrap.** Resample blocks of consecutive historical days with replacement. No
   distribution is assumed, and volatility clustering survives inside each block. The cost: the
   future can only replay the past, and the mean is the historical one.

The normal, Student-t and t-copula models use the expected returns of the shared estimates; the
regime and bootstrap models use historical means. Simulated daily returns are floored at −99%.

### Two kinds of error

Each headline number carries a **Monte Carlo standard error** from batch means: split the paths
into 20 batches, compute the statistic in each, and use $\mathrm{sd}(\text{batches})/\sqrt{20}$.
It shrinks like $1/\sqrt{N}$ with the number of paths and measures only the noise from
simulating finitely many futures.

**Model error** is far larger and no number of paths removes it. The expected return is the
weakest input: with 15% annual volatility and five years of data, its standard error is about
$15\%/\sqrt5 \approx 6.7\%$ a year. Changing the model (normal vs regime) or the estimates
usually moves the answers more than any seed.

### Buy and hold vs rebalancing

With *Rebalancing* set to *Never*, weights drift: the portfolio's wealth is the weighted average
of each asset's own wealth path, so winners grow into larger weights. That widens the range of
outcomes and skews it to the right. Rebalancing every 21 or 63 days resets the weights, keeping
risk closer to the target.

The **median** path is below the **mean** because of compounding: a loss of 50% needs a gain of
100% to recover, so volatility drags the typical outcome down. For a single lognormal asset the
median grows at about $\mu - \sigma^2/2$ a year while the mean grows at $\mu$.

---

## References

- Litterman (1996), "Hot spots and hedges", *J. Portfolio Management* (risk decomposition)
- Choueifaty & Coignard (2008), "Toward maximum diversification", *J. Portfolio Management*
- Forbes & Rigobon (2002), "No contagion, only interdependence", *J. Finance*
- J.P. Morgan / Reuters (1996), *RiskMetrics Technical Document*
- Barone-Adesi, Giannopoulos & Vosper (1999), "VaR without correlations for portfolios of derivative securities", *J. Futures Markets*
- Kupiec (1995), "Techniques for verifying the accuracy of risk measurement models", *J. Derivatives*
- Christoffersen (1998), "Evaluating interval forecasts", *International Economic Review*
- Basel Committee (1996), "Supervisory framework for the use of backtesting"
- Artzner, Delbaen, Eber & Heath (1999), "Coherent measures of risk", *Mathematical Finance*
- Demarta & McNeil (2005), "The t copula and related copulas", *International Statistical Review*
- Hamilton (1989), "A new approach to the economic analysis of nonstationary time series", *Econometrica*
- Künsch (1989), "The jackknife and the bootstrap for general stationary observations", *Annals of Statistics*

# 05 · Validation: how much to trust an allocation

An optimiser always produces an answer, and on the data it was fitted to that answer always looks
good. Validation asks the harder question: would the *rule* that produced it have worked on data it
had not seen, after costs, against simple alternatives, and is the difference larger than luck?
Pages: *Validate → Walk-forward*, *Rebalancing*, *Stability*, *Compare methods*. Code:
`validation/` (walk-forward, rebalancing, compare), `robustness/bootstrap.py`, `backtest.py`.

Symbols used throughout:

| Symbol | Meaning |
|---|---|
| $w_t$ | portfolio weights held at the end of day $t$ (assets plus cash) |
| $r_{i,t}$ | simple return of asset $i$ on day $t$ |
| $r_{f,t}$ | the cash (T-bill) return on day $t$ |
| $L$ | lookback: trading days of history per decision |
| $k$ | rebalance interval in trading days (5 = weekly, 21 = monthly) |
| $\kappa$ | cost per dollar traded ($5$ bp means $\kappa = 0.0005$) |

---

## 1. In-sample and out-of-sample

**In-sample** results use the same data that chose the weights. **Out-of-sample** results use data
the decision could not see. The gap between the two is the core problem of the whole area.

Take maximum Sharpe fitted to the last five years. It looks at the realised mean returns and
leans into the assets that happened to do best. Its in-sample Sharpe ratio is the highest possible
*by construction*: the optimiser was told the answer. That says nothing about the next five
years, because the estimated means are very noisy. The standard error of an annual mean return is
roughly

$$\mathrm{SE}(\hat\mu) \approx \frac{\sigma}{\sqrt{T_\text{years}}},$$

so an asset with 20% volatility observed for five years has a mean known only to about
$\pm 9\%$ a year. An optimiser that treats a 15% estimate as exact is mostly fitting that
$\pm 9\%$ of noise. Every number on the Construct pages is in-sample; this area replaces it with
an honest test.

---

## 2. Walk-forward testing (page: *Walk-forward*)

A walk-forward test replays history as if you had followed the rule live:

1. Use the first $L$ days only for estimation. The test starts the day after.
2. At each rebalance date, estimate means and covariance from the window, run the allocator, and
   trade to the new target.
3. Hold until the next rebalance date, $k$ trading days later, then repeat.

**Rolling or expanding window.**
- A **rolling window** always uses the last $L$ days. It forgets old data, so it adapts to new
  conditions, but each estimate rests on fewer observations and the weights move more.
- An **expanding window** uses everything from the start of the sample up to the decision date
  ($L$ is then only the *initial* window). It is steadier and gets more precise over time, but it
  reacts slowly when the market changes character.

### The lab's conventions

Every backtest in the lab runs on one engine (`backtest.run_backtest`) with the same rules:

- **No look-ahead.** A decision at day $t$'s close uses data through $t$ and earns from day $t+1$.
- **Drift.** Between trades the weights move with prices instead of being reset daily:

$$w_{i,t+1} = \frac{w_{i,t}\,(1 + r_{i,t+1})}{\sum_j w_{j,t}\,(1 + r_{j,t+1})},$$

  with cash as one of the $j$, earning $r_{f,t+1}$. Winners grow into a larger share.
- **Costs per dollar traded.** On a rebalance day, the cost is paid on the distance between the new
  target and the *drifted* weights (not the previous target):

$$c_t = \kappa \sum_{i \in \text{risky}} \lvert w^\text{new}_{i} - w^\text{drift}_{i,t} \rvert,
\qquad 1 + r^\text{net}_t = (1 + r^\text{gross}_t)(1 - c_t).$$

- **Turnover** is reported one-way: half the sum above, so moving 10% from one asset to another is
  10% turnover.
- **Unallocated weight is cash** and earns the T-bill rate day by day.

### Benchmarks

The method has to beat things that need no estimates at all:
- **Buy-and-hold equal weight** over the same test period: $1/N$ in each asset on the first test
  day, never traded again.
- **Cash**: the T-bill return compounded.

Beating equal weight after costs is the bar a method has to clear to justify its complexity.
DeMiguel, Garlappi and Uppal (2009) found that many optimised portfolios fail to beat $1/N$ out of
sample, because estimation error eats the theoretical gain. The page shows the after-cost and
before-cost lines together: the space between them is the cost drag.

### Predicted versus realised volatility

At every rebalance the estimates also *predict* the new portfolio's risk:
$\hat\sigma_p = \sqrt{w^\top \hat\Sigma\, w}$. The page then measures the volatility actually
delivered over the holding period that followed (annualised standard deviation of the daily
returns, before costs).

- Realised persistently **above** predicted: the model was overconfident; this is typical when
  calm periods are followed by turbulence (risk estimated on a quiet window).
- Realised **below** predicted: the window contained a crisis that has since faded.
- Single spikes are expected: a month has only about 21 days, so its realised volatility is itself
  noisy (relative standard error roughly $1/\sqrt{2 \cdot 21} \approx 15\%$).

Minimum variance is the cleanest method to read this chart on, because its only input is the
covariance.

---

## 3. Rebalancing policies (page: *Rebalancing*)

Once a portfolio is bought, drift pulls it away from the target. Rebalancing trades back, at a
cost. The page fixes one target (estimated once on the full sample, so the comparison isolates
*when* to trade, not *what* to hold) and compares four rules:

| Policy | Trades when |
|---|---|
| Never (buy and hold) | never after the first day |
| Calendar | every $k$ trading days |
| Asset threshold | any single asset is at least $h$ away from its target: $\max_i \lvert w_i - w^*_i \rvert \ge h$ |
| Portfolio distance | the one-way gap reaches $d$: $\tfrac12 \sum_i \lvert w_i - w^*_i \rvert \ge d$ |

The distance is exactly the share of the portfolio you would have to trade to get back, so a
distance rule trades only when the trade is big enough to matter. Threshold and distance rules
trade more in volatile markets, when drift is fast, and not at all in quiet ones.

**Tracking error** here measures how far each policy's daily returns stray from holding the target
exactly (rebalanced every day at no cost):

$$\mathrm{TE} = \sqrt{252}\;\mathrm{sd}\big(r^\text{policy}_t - r^\text{target}_t\big).$$

The trade-off is between two costs:
- trading often keeps tracking error low but pays more in costs;
- trading rarely is cheap, but the portfolio you hold is no longer the one you chose. Buy and hold
  ends up concentrated in whatever went up most, so its risk is no longer the risk you chose.

Long-run returns usually differ only a little between rules. What matters is the tracking error
you accept per unit of cost.

---

## 4. Bootstrap weight stability (page: *Stability*)

An optimiser treats its estimates as exact, but they come from one finite history. The
**bootstrap** asks: if history had been slightly different, how different would the weights be?

1. Build a resampled history of the same length by drawing days from the actual one, with
   replacement.
2. Re-estimate means and covariance on it and re-run the allocator.
3. Repeat (50–500 times) and look at the distribution of each asset's weight.

**IID or moving-block resampling.**
- **Day by day (IID)** draws single days independently. It breaks up calm and turbulent stretches
  and assumes there is no memory from one day to the next.
- **Moving-block** draws runs of $b$ consecutive days (5, 10, 21 or 63) from random starting
  points and joins them until the history is full. Within each block, volatility clustering and
  short-term autocorrelation survive. Blocks should be long enough to hold the dependence you care
  about, and short enough that there are many distinct blocks.

**Why weights move.** Mean-variance methods are *error maximisers* (Michaud): they put the most
weight on the assets whose estimated means are most overstated relative to their risk. Two assets
with similar risk and similar true means are nearly interchangeable, so a small change in the
estimated means swings weight from one to the other. That is why:
- maximum Sharpe and Kelly, which use estimated means, are usually the least stable;
- minimum variance and risk parity, which use only the covariance (estimated far more precisely),
  are steadier;
- equal weight never moves, which is why the page leaves it out.

Read the 5–95% range as the span the weight could plausibly have taken. If it runs from 0% to 40%,
the optimised value is mostly noise, and a simpler or more constrained method is the safer choice.

---

## 5. Comparing many methods (page: *Compare methods*)

The comparison page walks every allocator forward on identical settings (same window, schedule,
costs and test days), so differences come from the weights alone. Equal weight is included as one
of the methods, walked forward and rebalanced on the same schedule. Resampled max Sharpe is left
out, because it solves dozens of problems per rebalance.

### Why a Sharpe difference needs a test

Sharpe ratios are estimates too. Their standard error over $T$ days is roughly
$\sqrt{(1 + \tfrac12 \mathrm{SR}^2)/T}$ per day, which annualises to about
$1/\sqrt{T_\text{years}}$: over five years, ±0.45. Two methods tested on the *same days* are
correlated, which helps: their errors move together, so their difference is measured more
precisely than either one alone.

The lab uses the **Jobson–Korkie test with Memmel's (2003) correction**. With daily Sharpe ratios
$\widehat{\mathrm{SR}}_a$, $\widehat{\mathrm{SR}}_b$ of returns over cash, and $\rho$ the correlation
of the two return series,

$$\hat\theta = \frac{1}{T}\Big[\,2 - 2\rho + \tfrac12\big(\widehat{\mathrm{SR}}_a^2 + \widehat{\mathrm{SR}}_b^2 - 2\,\widehat{\mathrm{SR}}_a \widehat{\mathrm{SR}}_b\,\rho^2\big)\Big],
\qquad z = \frac{\widehat{\mathrm{SR}}_a - \widehat{\mathrm{SR}}_b}{\sqrt{\hat\theta}}.$$

Under the null hypothesis of equal Sharpe ratios, $z$ is approximately standard normal, and the
two-sided **p-value** is $2\,(1 - \Phi(\lvert z \rvert))$. Each method is tested against equal
weight.

A worked example: annual Sharpe ratios of 1.0 and 0.8 over five years (1,260 days). With
$\rho = 0.9$, $z \approx 1.0$; with $\rho = 0$, $z \approx 0.3$. Neither is close to the 1.96 needed
for 5% significance. A Sharpe gap of 0.2 over five years is usually noise.

### p-values and multiple comparisons

A p-value is the probability of a difference at least this large *if there were no true
difference*. It is not the probability that the method is better. With $m$ independent tests at
the 5% level and no true differences, the chance of at least one "significant" result is
$1 - 0.95^m$: about 37% for $m = 9$. The "Significantly different" tile counts plain $p < 0.05$
results, so read a count of one or two with that in mind. A **Bonferroni** adjustment (require
$p < 0.05/m$) is the simple conservative fix. The tests here share the equal-weight leg and many
of the same days, so they are positively correlated and Bonferroni is stricter than needed.

### Probability of backtest overfitting (PBO)

The usual workflow (try many methods, keep the one with the best backtest) has its own bias: the
winner is partly the luckiest. Bailey, Borwein, López de Prado and Zhu (2017) measure how often that
choice disappoints, by **combinatorially symmetric cross-validation (CSCV)**:

1. Cut the test period into $S = 10$ equal blocks of consecutive days.
2. For every way of choosing 5 blocks as "in sample" ($\binom{10}{5} = 252$ splits), the other 5 are
   "out of sample".
3. In each split, find the method with the best in-sample Sharpe, $n^*$. Rank all $M$ methods by
   their out-of-sample Sharpe (1 = worst, $M$ = best) and record $n^*$'s rank $r$.
4. Convert it to a relative rank and its logit:

$$\omega = \frac{r}{M + 1}, \qquad \lambda = \ln\frac{\omega}{1 - \omega}.$$

$\lambda > 0$ means the in-sample winner landed in the top half out of sample; $\lambda \le 0$
means it landed at or below the median. The **PBO** is the share of splits with $\lambda \le 0$.

- PBO near 0: in-sample rankings carry over; picking the best backtest picks a good method.
- PBO near 50%: the choice is a coin flip.
- PBO above 50%: the in-sample winners tend to be the methods that did worst afterwards, a sign of
  rankings driven by noise or by regimes that reversed.

The page adds two diagnostics. The scatter of in-sample against out-of-sample Sharpe for the
winner shows the *decay*: dots below the diagonal lost Sharpe out of sample, which is normal for a
selected winner. "Who won in sample" shows whether one method dominates every split. The splits
share blocks, so they are not independent: PBO is a descriptive frequency, not a p-value. CSCV
needs at least 20 days per block, so very short samples skip it.

---

## 6. Judging covariance estimators

Minimum variance depends only on the covariance matrix, so it is a clean test of a covariance
estimator. The page walks minimum variance forward four times, once with each estimator (sample,
Ledoit–Wolf shrinkage, EWMA, Marchenko–Pastur denoising), before costs, and reports:

- **Realised volatility.** Every version is *trying* to minimise it, so the lowest realised
  volatility identifies the estimator whose risk picture was most useful.
- **Realised ÷ predicted.** The whole test period's realised volatility divided by the average
  predicted volatility at the rebalances. Above 1: risk was understated (overconfident). Below 1:
  overstated. Near 1: well calibrated.

The two answer different questions. An estimator can be well calibrated yet produce a portfolio
that is no less volatile than the others, and the reverse. Differences of a few tenths of a
percentage point are within noise for a sample of a few years.

---

## References

- DeMiguel, Garlappi & Uppal (2009), "Optimal versus naive diversification: how inefficient is the
  1/N portfolio strategy?", *Review of Financial Studies*
- Michaud (1989), "The Markowitz optimization enigma: is 'optimized' optimal?", *Financial
  Analysts Journal*
- Jobson & Korkie (1981), "Performance hypothesis testing with the Sharpe and Treynor measures",
  *Journal of Finance*; Memmel (2003), "Performance hypothesis testing with the Sharpe ratio",
  *Finance Letters*
- Bailey, Borwein, López de Prado & Zhu (2017), "The probability of backtest overfitting",
  *Journal of Computational Finance*
- Künsch (1989), "The jackknife and the bootstrap for general stationary observations", *Annals
  of Statistics* (moving-block bootstrap)
- López de Prado, *Advances in Financial Machine Learning* (2018), ch. 11–12

# 03 · Dynamic allocation: signals, timing and honest evaluation

A static portfolio sets its weights and only rebalances back to them. A **dynamic** (tactical)
portfolio lets market data move the weights: it holds less of an asset that is falling, more of
one that is rising, and sometimes steps into cash. This note covers the signals the lab offers,
the four ways it turns signals into weights, and how it judges whether the signals helped.
Page: *Dynamic*. Code: `signals.py`, `dynamic.py`, `validation/sharpe_tests.py`.

---

## 1. Static vs tactical allocation

The construction chapter answers "what mix should I hold?" with one set of weights, re-estimated
from time to time. Tactical allocation adds a second question: "given what prices have done
lately, should I hold that mix *right now*?"

Two kinds of evidence motivate it:
- **Trend persistence (time-series momentum).** Over months, assets that have been rising tend to
  keep rising a little more often than chance, and long sell-offs tend to unfold over many
  weeks. A rule that steps aside once a downtrend is established can miss part of a long
  decline.
- **Cross-sectional momentum.** Among a set of assets, last year's relative winners have tended
  to outperform last year's relative losers over the next few months (Jegadeesh & Titman, 1993).

Both effects are small relative to day-to-day noise, so the price of acting on them is trading
costs, time out of the market, and a lot of statistical uncertainty. Most of this note is about
measuring that uncertainty honestly.

In the lab, you choose the universe and a **base portfolio** (an allocator such as Equal Weight
or Risk Parity, re-estimated at each rebalance, or fixed weights you type in). The signals only
adjust that base, and the base is also the benchmark they must beat.

---

## 2. Timing signals: in or out

A **timing signal** looks at one asset's own price history and returns 1 (hold it) or 0 (do
not). All windows are in trading days, $P_t$ is the close on day $t$, and every rule uses only
closes up to and including $t$.

| Signal | Rule for "in" | Defaults |
|---|---|---|
| Trend filter | $P_t > \mathrm{SMA}_n(t)$ | $n = 200$ |
| Moving-average crossover | $\mathrm{SMA}_{f}(t) > \mathrm{SMA}_{s}(t)$ | 50 / 200 |
| EMA crossover | $\mathrm{EMA}_{f}(t) > \mathrm{EMA}_{s}(t)$ | 20 / 100 |
| MACD | MACD line above its signal line | 12 / 26 / 9 |
| Donchian breakout | enter above the prior $N$-day high, exit below the prior $M$-day low | 50 / 20 |
| Absolute momentum | trailing $n$-day return beats T-bills over the same $n$ days | $n = 252$ |
| Trend + volatility regime | $P_t > \mathrm{SMA}_n(t)$ and realised volatility $\le$ a cap | 100, 20-day vol, 35% |

The averages are

$$\mathrm{SMA}_n(t) = \frac1n\sum_{k=0}^{n-1} P_{t-k}, \qquad \mathrm{EMA}(t) = \alpha P_t + (1-\alpha)\,\mathrm{EMA}(t-1),\quad \alpha = \frac{2}{\text{span}+1}.$$

**Why these rules?**
- The **trend filter** is the simplest trend follower: a price below its 200-day average has
  fallen for long enough that the average has not caught up. A **crossover** compares two
  averages instead of the price and one average, so a single noisy day cannot flip it.
- An **EMA** weights recent closes most, so it turns sooner than an SMA of the same length. That
  means earlier exits, and also more false alarms.
- **MACD** (moving average convergence divergence) is $\mathrm{EMA}_{12} - \mathrm{EMA}_{26}$, a
  measure of trend strength. Its *signal line* is a 9-day EMA of the MACD line itself. "Line
  above signal" means the trend is strengthening, so MACD reacts to *changes* in momentum.
- A **Donchian channel** is the band between the highest and lowest close of a window. A close
  above the prior 50-day high is a breakout. The position is kept until a close below the prior
  20-day low, so between the two levels the previous state carries on. The asymmetry (enter on
  a long window, exit on a short one) is a common choice. (Closes stand in for the intraday
  highs and lows the original rule uses.)
- **Absolute momentum** (Antonacci) asks whether the asset beat Treasury bills over the past
  year:

  $$\frac{P_t}{P_{t-n}} - 1 \;>\; \prod_{k=t-n+1}^{t}(1 + c_k) - 1,$$

  where $c_k$ is the daily T-bill return. An asset that could not beat cash over a year is
  arguably not paying for its risk.
- The **volatility regime** filter adds a second condition: stay out while 20-day realised
  volatility (annualised) is above the cap, even if the trend is up. High-volatility spells
  are when drawdowns tend to deepen.

A signal is *undefined* until it has enough history (a 200-day average needs 200 closes). The
lab computes signals on each asset's **full** price history, not just the research window, so
long windows are ready on the first day of the test.

---

## 3. Ranking signals: which assets first

A **ranking signal** gives each asset a score, and only the *order* across assets matters.

| Signal | Score on day $t$ | Defaults |
|---|---|---|
| Momentum (12-1) | $P_{t-21}/P_{t-252} - 1$ | 252, skip 21 |
| Volatility-adjusted momentum | 12-1 momentum $\div$ annualised volatility over 252 days | 252, skip 21 |
| Short-term reversal | $-(P_t/P_{t-21} - 1)$ | 21 |
| Low volatility | $-\sigma_{63}(t)$, annualised | 63 |

- **12-1 momentum** is the return from twelve months ago to one month ago. **Why skip the last
  month?** Over horizons of a few weeks, returns tend to *reverse* slightly: last month's
  biggest winners give back a little. That short-term reversal works against momentum, so the
  standard measure leaves the most recent month out.
- **Volatility-adjusted momentum** divides by volatility, so a 30% gain from a calm asset ranks
  above a 30% gain from a wild one: return per unit of risk.
- **Short-term reversal** bets on exactly the effect momentum skips: last month's losers rank
  first. It trades often, so costs matter a great deal.
- **Low volatility** ranks the calmest assets first. The **low-volatility anomaly** is the
  observation that low-risk stocks have historically earned about as much as high-risk ones,
  so more return per unit of risk than the CAPM predicts (Frazzini & Pedersen, 2014, "Betting
  against beta").

---

## 4. From signals to weights: four methods

On each rebalance date the lab computes base weights $b_i$ from the estimation window, reads
the signals, and builds target weights. Whatever is not invested is **cash**, earning the
T-bill rate.

**Filter** (needs a timing signal). Assets that are "in" keep their base weight. For an asset
that is "out" there are two choices (the switch *Out-of-signal weight goes to cash*):
- **to cash:** $w_i = b_i \cdot \mathbb{1}[\text{in}_i]$, and cash $= 1 - \sum_i w_i$. With
  six assets and two out, the portfolio is partly in cash. This is the classic trend-following
  overlay: exposure falls as more assets turn down.
- **redistribute:** the base allocator is re-run on the assets still in, so the portfolio stays
  fully invested unless every asset is out. This changes *which* assets you hold but not *how
  much* risk you take, so it protects less in a broad sell-off.

**Top-k** (needs a ranking signal). Rank the assets and hold the best $k$, weighted by the base
allocator run on just those $k$. With a timing signal too, only assets that are also "in"
qualify, and each of the $k$ slots is worth $1/k$ of the portfolio: an empty slot is held in
cash. With absolute momentum as the timing signal and 12-1 momentum as the ranking, this is
**dual momentum**: hold the relative winners, but only if they also beat T-bills.

**Tilt** (needs a ranking signal). Keep every asset and lean toward high scores. Scores are
first turned into cross-sectional **z-scores**,

$$z_i = \frac{s_i - \bar s}{\mathrm{sd}(s)},\ \text{clipped to } [-2, 2], \qquad w_i = \frac{b_i\, e^{\lambda z_i}}{\sum_j b_j\, e^{\lambda z_j}},$$

with $\lambda$ the *Tilt strength*. At $\lambda = 0$ you get the base back. At $\lambda = 0.5$,
an asset one standard deviation above average gets $e^{0.5} \approx 1.65$ times its base weight
before renormalising. Large $\lambda$ concentrates in the top names. The exponential keeps
weights positive, and clipping stops one extreme score from taking everything.

**BL views** (needs a ranking signal). Express scores as **Black–Litterman views**. The prior is
the base portfolio's implied excess returns $\pi = \delta\,\Sigma\, b$ (with $\delta = 2.5$),
the returns for which the base would be optimal. Each scored asset gets an absolute view

$$q_i = \pi_i + \lambda\, z_i\, \sigma_i,$$

so the control *View size (σ per z-score)* says how many standard deviations of the asset's own
volatility $\sigma_i$ one z-score is worth. *View confidence* $c$ sets each view's uncertainty,
$\Omega_{ii} = \tau\sigma_i^2 (1-c)/c$: at 50% prior and view count equally, and at 100% the
posterior equals the view. Max Sharpe on the posterior (with the universe's constraints) gives
the weights. If no portfolio is expected to beat cash, the base weights are kept.

This is the most principled of the four: a high score on a volatile, highly correlated asset
moves the weights less than the same score on a diversifying one, because the optimiser weighs
the view against risk. At $\lambda = 0$ the views equal the prior and max Sharpe returns the
base (when constraints allow).

For tilt and BL views a timing signal is optional. When one is set and its weight goes to cash,
assets that are "out" are zeroed after the weights are built.

---

## 5. Timing conventions and look-ahead bias

**Look-ahead bias** means using information in a backtest that was not available when the
decision was made, for example trading at today's close on a signal computed from today's close
*and* earning today's return. It is the most common way a backtest flatters a strategy.

The lab's rule, shared with every backtest in the app:
- a decision at the close of day $t$ uses closes up to and including $t$;
- the new weights earn returns from day $t+1$ on.

The tests check this for every signal by **truncation**: computing the signal on data that ends
at day $t$ must give the same value on day $t$ as computing it on the full history. The base
allocator is estimated on the *Estimation window* of returns before the decision, and the test
period starts after that first window.

Between rebalances (*Week*, *Month*, *Quarter*), holdings drift with prices, exactly as a real
account would.

---

## 6. Costs and turnover

Every trade pays *Cost per dollar traded* (basis points, on risky assets; cash is free).
**Turnover** is reported one-way: the share of the portfolio bought (equal to the share sold)
at a rebalance. With $c$ the cost rate, a rebalance that moves the risky weights from $w^-$ to
$w^+$ costs $c \sum_i |w^+_i - w^-_i|$ of wealth.

Timing signals have a characteristic cost: **whipsaw**. When a price hovers around its average,
the signal flips in and out, and each flip pays costs and can sell low and buy back higher.
Longer windows and less frequent rebalancing reduce whipsaw but react later. The *Side by side*
table shows average turnover and total costs so you can see the trade-off directly.

---

## 7. Honest evaluation: what are the signals compared with?

A strategy can look good for reasons that have nothing to do with its signals: a good base mix,
a rising market, or rebalancing itself. The lab runs three comparisons over **the same days**:

1. **The base, rebalanced on the same schedule without signals.** Same allocator, same
   estimation window, same rebalance dates, same costs. The only difference is the signals,
   so the gap between this and the strategy *is* the signals' contribution. This is the
   headline benchmark.
2. **The base bought and held**, with weights set once at the start and left to drift. It shows
   what never trading would have done.
3. **Cash**, the hurdle any risky strategy must clear.

Because timing strategies hold cash in sell-offs, they tend to trail in strong bull markets and
catch up in long declines. A short test window that happens to be one or the other says little
about the long run.

### Active return and tracking error

Let $a_t = r^{\text{strategy}}_t - r^{\text{base}}_t$ be the daily **active return**. The page
reports

$$\text{active return} = 252\,\bar a, \qquad \text{tracking error} = \sqrt{252}\;\mathrm{sd}(a),$$

and their ratio, the **active Sharpe** (also called the information ratio). Tracking error is
how much the strategy's path wanders from the base, in volatility units. A small active return
with a large tracking error is mostly noise.

---

## 8. How much to believe it: PSR and DSR

### The probabilistic Sharpe ratio

A Sharpe ratio estimated from a few years of data is uncertain. The **probabilistic Sharpe
ratio** (Bailey & López de Prado, 2012) is the probability that the *true* Sharpe ratio exceeds
a benchmark $SR^*$, given the sample length $n$, skewness $\gamma_3$ and kurtosis $\gamma_4$ of
the returns:

$$\mathrm{PSR}(SR^*) = \Phi\!\left(\frac{(\widehat{SR} - SR^*)\sqrt{n-1}}{\sqrt{1 - \gamma_3\,\widehat{SR} + \frac{\gamma_4 - 1}{4}\,\widehat{SR}^2}}\right),$$

with $\widehat{SR}$ and $SR^*$ per day (not annualised) and $\Phi$ the standard normal CDF. Three
things raise confidence: a higher Sharpe, a longer record, and well-behaved returns. Negative
skew (rare large losses) and fat tails lower it, because they make the sample Sharpe less
reliable.

The tile *P(beats the base)* is the PSR of the **active** return $a_t$ against $SR^* = 0$: the
probability that the signals truly add return per unit of extra risk.

### The deflated Sharpe ratio

Suppose you try $N$ settings of a strategy that has no skill at all. By luck, the best of them
will still show a positive Sharpe. Keeping the best and reporting it as if it were the only one
tried is **selection bias**. The **deflated Sharpe ratio** (Bailey & López de Prado, 2014) is the
PSR with the benchmark raised to the Sharpe the best of $N$ skill-less trials would be expected
to show:

$$SR^* = \mathbb{E}\big[\max_N \widehat{SR}\big] \approx \sqrt{V}\Big((1-\gamma)\,\Phi^{-1}\!\big(1 - \tfrac1N\big) + \gamma\,\Phi^{-1}\!\big(1 - \tfrac{1}{Ne}\big)\Big),$$

where $V$ is the variance of the trials' Sharpe ratios and $\gamma \approx 0.5772$ is the
Euler–Mascheroni constant. More trials, or trials that disagree more, raise the bar.

**Which trials?** The lab re-runs the strategy with its main signal window scaled by
$\times 0.5, 0.75, 1, 1.5, 2$ (clipped to the allowed range), and for top-k also with one
asset more and one fewer. These are the neighbours a researcher would plausibly have tried.
Their active Sharpe ratios are drawn in *Robustness: the neighbours you could have picked*,
and their spread sets $V$. The tile *After trying neighbours* is the DSR of the active return.

**Why deflate the *active* return?** The question the page asks is not "did this make money?"
(a rising market does that) but "did the signals beat simply holding the base?". Deflating the
active return answers exactly that, net of the search over windows.

Two caveats keep the number in proportion:
- The grid trials are strongly correlated (a 150-day and a 200-day trend filter mostly agree),
  and the formula treats them as independent. That makes the deflation *conservative*.
- The grid counts only the neighbours of the chosen setting. Every other signal, method or base
  you tried by clicking around the page is also a trial. If you tested twenty combinations
  before finding a good one, the honest bar is higher than the tile shows.

A useful habit: look at the robustness chart before the headline. If the chosen bar stands
alone and its neighbours are near zero or negative, the result is probably a lucky parameter.
A broad plateau of similar bars is more convincing.

---

## 9. Hindsight in the universe itself

Every decision in the backtest uses only past prices, but the **universe** was chosen today.
If it contains assets that are famous *now* because they rose enormously, any momentum rule will
have ranked them first during their rise and look skilful. In real time you would not have known
which of hundreds of candidates would become today's leaders. This is **hindsight bias** (a form
of survivorship bias), and no statistic computed from the chosen assets can remove it.

Ways to reduce it:
- test on broad, rules-based universes (asset-class ETFs, sector funds) rather than hand-picked
  winners;
- move the start date earlier so the test covers several market regimes;
- treat a strategy that only works on one hand-picked set with suspicion.

---

## References

- Jegadeesh & Titman (1993), "Returns to buying winners and selling losers", *J. Finance*
- Moskowitz, Ooi & Pedersen (2012), "Time series momentum", *J. Financial Economics*
- Faber (2007), "A quantitative approach to tactical asset allocation", *J. Wealth Management*
- Antonacci (2014), *Dual Momentum Investing*
- Frazzini & Pedersen (2014), "Betting against beta", *J. Financial Economics*
- Black & Litterman (1992), "Global portfolio optimization", *Financial Analysts Journal*
- Bailey & López de Prado (2012), "The Sharpe ratio efficient frontier", *J. Risk*
- Bailey & López de Prado (2014), "The deflated Sharpe ratio", *J. Portfolio Management*

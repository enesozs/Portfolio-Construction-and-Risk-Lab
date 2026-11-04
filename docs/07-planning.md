# 07 · Planning with real money

The research pages work in weights and annual percentages. An investor holds shares, has a cash
balance, saves every month and one day starts spending. This chapter connects the two: turning a
target allocation into orders, and asking whether a portfolio will fund a goal over decades.
Pages: *Plan → My portfolio*, *Goal planner*. Code: `holdings.py`, `planner.py`.

---

## 1. From weights to trades (page: *My portfolio*)

### Valuing what you hold

Holdings are pasted one per line, as a share count ("AAPL 20") or a dollar value ("AAPL" followed
by an amount with a dollar sign). Dollar lines are converted to shares at the latest close. With
prices $P_i$, shares $n_i$ and cash $C$:

$$V = \sum_i n_i P_i + C, \qquad w_i = \frac{n_i P_i}{V}, \qquad w_\text{cash} = \frac{C}{V}.$$

The target comes from any construction method on the shared universe. Holdings outside the
universe get a target of zero and are sold; the page offers to make your holdings the universe
instead.

### Building the orders

1. **Cash buffer.** A chosen share $b$ of the account stays uninvested, so the risky targets are
   scaled to sum to $1 - b$.
2. **Budget.** The investable amount is $V(1 - \kappa)$, which leaves room for costs at $\kappa$
   per dollar traded on roughly a full rebalance.
3. **Desired shares:** $n^*_i = w^*_i \cdot V(1-\kappa) / P_i$.
4. **Whole shares.** Unless fractional shares are allowed, $n^*_i$ is rounded to the nearest whole
   number.
5. **Minimum trade.** Any order smaller than the minimum (in dollars) is skipped, and that holding
   stays as it is. Small orders cost time, attention and sometimes a fixed fee for little benefit.
6. **Funding.** Buys are paid for by sells and the existing cash. If rounding up would push cash
   below zero after costs, the buy that rounded up the most is trimmed by one share, and so on
   until the account balances.

Cash after trading is

$$C_\text{after} = C - \sum_i (n^\text{new}_i - n_i) P_i - \kappa \sum_i \lvert n^\text{new}_i - n_i \rvert P_i \;\ge 0.$$

### The tracking gap

Rounding and skipped trades leave the result slightly off target. The page reports it instead of
hiding it, as the one-way distance between the weights after trading and the target (cash
included):

$$\text{gap} = \tfrac12 \sum_j \lvert w^\text{after}_j - w^*_j \rvert.$$

A concrete case: in a 10,000-dollar account, a 15% target in a stock priced at 900 dollars is 1.67
shares. Two shares are 18% of the account; one share is 9%. Expensive shares in small accounts
create the largest gaps; fractional shares remove most of them. The *What changes* table puts the
ex-ante expected return, volatility and Sharpe of the current, target and after-trading portfolios
side by side, from the shared estimates.

---

## 2. Goal planning (page: *Goal planner*)

### Nominal and real

A **nominal** amount is in the dollars of the day it is paid. A **real** amount is in today's
dollars: nominal divided by the growth in prices since today. With inflation $\pi$, an amount $X$
at year $t$ is worth

$$X_\text{real} = \frac{X_\text{nominal}}{(1 + \pi)^t}$$

in today's money. At 2.5% inflation, prices multiply by about 2.7 over 40 years, so a nominal
million then buys what about 370,000 dollars buys now. The planner reports everything in real
terms, and keeps both **contributions** (money saved each month) and **withdrawals** (money spent
each year in retirement) constant in real terms: in nominal dollars they rise with inflation.

### The simulation

The plan runs month by month for each simulated path:

$$W_{t+1} = \big(W_t + C_t - S_t\big)\,\big(1 + R_{t+1}\big),$$

- $C_t$: the monthly contribution until retirement (zero after);
- $S_t$: one twelfth of the annual withdrawal from retirement on (zero before);
- $R_{t+1}$: the portfolio's return that month.

The portfolio mixes the growth portfolio (the chosen method's weights, long-only) with T-bills at
the sample's average cash rate. The growth share follows a **glide path**: it moves in a straight
line from the start share to the end share over the whole plan, and the portfolio is rebalanced to
it every month. Target-date funds de-risk this way, because a loss just before or after
retirement hurts most (section 4).

Monthly asset returns come from one of three models:
- **History:** a block bootstrap of the universe's actual monthly returns, in 12-month blocks, which
  keeps a year of market dependence intact;
- **Normal:** a multivariate normal with the shared estimates' mean and covariance (scaled to a
  month);
- **Fat tails:** a joint Student-t with 5 degrees of freedom and the same covariance, so extreme
  months are more frequent.

### The expected-return assumption

A few years of history are a poor guide to the next few decades. Over five years, the mean
return of a portfolio with 15% volatility is known only to about $\pm 0.15/\sqrt 5 \approx \pm 7\%$
a year. Compounded over 40 years, the difference between a 6% and a 20% sample mean is the
difference between a factor of about 10 and a factor of about 1,500. Recent winners make long plans
look far better than they are likely to be.

So the planner defaults to an explicit assumption $m$ for the growth portfolio's annual
arithmetic, nominal mean (6% by default) and shows the sample's own mean beside it. Every asset is
shifted by the same amount to hit it:

$$\mu_i \leftarrow \mu_i + \big(m - w^\top \mu\big).$$

The bootstrapped history is shifted the same way, by $(m - \bar r_\text{hist})/12$ a month.
Volatilities and correlations are untouched, so the shape of risk still comes from the data. Note
that a portfolio compounds at roughly $m - \tfrac12\sigma^2$, not $m$: volatility drags down
long-run growth.

### What the simulation reports

- **Probability of reaching the goal:** the share of paths whose real wealth at the goal year is at
  or above the target.
- **Probability of ruin:** the share of paths where wealth runs out while withdrawals are due. A
  ruined path stays at zero. The "Running out of money" curve shows the cumulative share ruined by
  each year.
- **Fan chart:** the 5th, 25th, 50th, 75th and 95th percentiles of real wealth each year. The fan
  widens with time because uncertainty compounds.
- Every number comes from the same fixed random seed, so changing an input changes the answer only
  through that input.

---

## 3. Safe withdrawal rate

The **safe withdrawal rate** is the largest annual withdrawal (a share of wealth at retirement, in
real terms) whose probability of ruin stays at or below $1 - \text{confidence}$. The lab finds it by
**bisection**: start with the range 0–50%, try the midpoint, keep the upper half if ruin is
acceptable and the lower half if not, and repeat 30 times. Every trial reuses the *same* simulated
returns, so ruin rises smoothly with the withdrawal rate and the search converges cleanly.

The rate is applied to the **median** real wealth at retirement, and the resulting dollar amount is
withdrawn on every path. Paths that reach retirement with less than the median therefore face a
higher effective rate.

**The 4% rule.** Bengen (1994) found that withdrawing 4% of the starting portfolio, then raising
the amount with inflation, survived every 30-year retirement in US history with a 50–75% stock
allocation. The lab's number answers the same question for *your* universe, return assumption,
horizon (the years from retirement to the end of the plan), glide path and confidence. It is
usually lower for long horizons and high confidence, and higher for short ones. The 4% rule was
derived from one country's unusually good century of returns, so a lower simulated number is not a
contradiction.

---

## 4. Sequence-of-returns risk

Two retirements with the same average return can end very differently if the bad years come first.
Withdrawals sell assets; selling after a fall sells more shares at low prices, and those shares are
not there for the recovery.

A worked example with 1,000,000 dollars and a 100,000-dollar withdrawal at the start of each year:
- **Loss first** (−20%, then +25%): $(1000 - 100) \times 0.8 = 720$, then
  $(720 - 100) \times 1.25 = 775$ thousand.
- **Gain first** (+25%, then −20%): $(1000 - 100) \times 1.25 = 1125$, then
  $(1125 - 100) \times 0.8 = 820$ thousand.

Without withdrawals both orders end at exactly 1,000,000 dollars, because $0.8 \times 1.25 = 1$.
With withdrawals, the order alone costs 45,000 dollars in two years.

The planner measures this directly. It groups the paths into fifths by the portfolio's compounded
return over the first five years of retirement, and reports the success rate of each group. Every
group has the same long-run assumptions, yet the worst-start group fails far more often. That is
why the years around retirement carry the most risk, and why glide paths cut risk then.

---

## 5. Saved universes

The universe dialog can save the current universe (tickers, dates, estimators and constraints)
under a name and load it later. Saved universes are kept in this browser only (local storage), so
they do not follow you to another device and disappear if the browser's site data is cleared. On
*My portfolio*, "Use my holdings as the universe" sets the shared universe to the assets you hold,
so every research page then analyses your actual portfolio.

---

## References

- Bengen (1994), "Determining withdrawal rates using historical data", *Journal of Financial
  Planning*
- Cooley, Hubbard & Walz (1998), "Retirement savings: choosing a withdrawal rate that is
  sustainable" (the "Trinity study"), *AAII Journal*
- Milevsky, *The 7 Most Important Equations for Your Retirement* (2012) (sequence risk)
- Pfau (2011), "Can we predict the sustainable withdrawal rate for new retirees?", *Journal of
  Financial Planning*
- Dimson, Marsh & Staunton, *Triumph of the Optimists* (2002) (long-run returns outside the US)

# 02 · Portfolio construction: from estimates to weights

Given expected returns $\mu$, a covariance matrix $\Sigma$ and a set of rules, how should capital
be split? There is no single answer: each method answers a different question (lowest risk,
best risk-adjusted return, equal risk shares, smallest crash loss), and each trusts the
estimates to a different degree. This note covers the methods in the *Construct* area and the
optimisation machinery behind them. Pages: *Portfolios*, *Estimators*, *Black–Litterman*,
*Tail risk*, *Robust & turnover*, *Risk budgets*. Code: `optimization/convex.py`,
`optimization/hierarchical.py`, `optimization/hrp.py`, `optimization/black_litterman.py`,
`optimization/registry.py`.

Symbols follow chapter 01: $w$ weights (summing to 1), $\mu$ expected returns, $\Sigma$
covariance, $\sigma_p = \sqrt{w^\top\Sigma w}$ portfolio volatility, $r_f$ the cash rate. Every
method is called as `allocate(key, estimates, constraints)`, so any page can swap one for another.

---

## 1. Mean-variance and the efficient frontier

Markowitz (1952) framed the problem as a trade-off: more expected return, less variance. With a
**risk aversion** $\lambda$, the mean-variance portfolio maximises

$$\mu^\top w - \frac{\lambda}{2}\, w^\top \Sigma\, w$$

Low $\lambda$ chases return; high $\lambda$ approaches the minimum-variance portfolio. Sweeping
over all trade-offs traces the **efficient frontier**: for each target return, the portfolio
with the lowest volatility. Anything below the frontier could earn more for the same risk.

The *Efficient frontier* chart on *Portfolios* solves this 40 times, from the minimum-variance
portfolio's return up to the highest return the constraints allow, and places each standard
portfolio against it. The frontier is "efficient" *given these estimates*. Change the estimates
and it moves; the portfolios on it move further.

---

## 2. Cash, the capital market line and maximum Sharpe

If you can also hold cash at $r_f$, any risky portfolio $P$ can be mixed with cash. The mixes lie
on a straight line from $(0, r_f)$ through $P$, with slope equal to $P$'s Sharpe ratio. The
steepest such line touches the frontier at the **tangency portfolio**, the one with the highest
Sharpe ratio:

$$\max_w\ \frac{(\mu - r_f\mathbf 1)^\top w}{\sqrt{w^\top\Sigma w}}$$

That line is the **capital market line** (dashed on the chart). Every point on it beats every
other frontier point at the same volatility: a cautious investor holds the tangency portfolio
plus cash, an aggressive one holds it with leverage. So in theory everyone holds the same risky
mix and only the cash share differs (Tobin's separation).

---

## 3. Minimum variance: the method that ignores returns

The **minimum-variance** portfolio is the left tip of the frontier: minimise $w^\top\Sigma w$
subject to the rules. It uses no expected returns at all, only the covariance matrix, so it is
immune to the noisiest input (chapter 01, §3). Out of sample it has historically held up well
against methods that do use $\mu$, partly because low-volatility assets have not earned less
than their risk suggested. Its weakness is concentration: without caps it piles into the
calmest one or two assets, often bonds.

---

## 4. Why maximum Sharpe is estimate-sensitive

Without constraints the tangency weights are $w \propto \Sigma^{-1}(\mu - r_f\mathbf 1)$: the
expected returns enter linearly, then get multiplied by an inverse that amplifies errors.
Expected returns are measured to within several percent a year (chapter 01, §3), so two assets
whose true premiums are equal can easily look 4% apart, and the optimiser will bet heavily on
the difference. Michaud (1989) called mean-variance optimisers "error maximisers": they
overweight assets whose returns were overestimated and whose risks were underestimated.

The *Estimators* page makes this visible. It runs one allocator under all twelve combinations
of return estimator (arithmetic, geometric, EWMA) and covariance estimator (sample,
Ledoit–Wolf, EWMA, denoised) on the same data. Maximum Sharpe usually swings by tens of
percentage points; minimum variance moves only with the covariance choice. Every row looks good
by its own estimates, because the optimiser always believes its inputs.

The rest of this note is, in one way or another, about defending against this: ignore $\mu$
(§3, §5–§7), anchor it (§11), average over its uncertainty (§10), penalise it (§12), or trade
only when the change is worth it (§13).

---

## 5. Risk contributions, risk parity and risk budgets

Capital weights say where the money is; they do not say where the risk is. Volatility is
homogeneous of degree one in the weights (double every weight, double $\sigma_p$), so **Euler's
theorem** splits it exactly into per-asset pieces:

$$\sigma_p = \sum_i \mathrm{RC}_i, \qquad \mathrm{RC}_i = w_i\,\frac{\partial\sigma_p}{\partial w_i} = \frac{w_i\,(\Sigma w)_i}{\sigma_p}$$

$\mathrm{RC}_i/\sigma_p$ is asset $i$'s **risk contribution** as a share of the total. It is weight
times marginal risk: an asset that moves with the rest of the portfolio contributes more than
its weight, a diversifier less. A 60/40 stock–bond portfolio typically has around 90% of its
risk in stocks.

**Risk parity** chooses weights so that every asset contributes the same share. A **risk budget**
generalises it: you set the shares $b_i$ and the weights follow. The lab solves Spinu's (2013)
convex problem

$$\min_{x > 0}\ \tfrac12 x^\top\Sigma x - \sum_i b_i \ln x_i$$

whose first-order condition is $x_i(\Sigma x)_i = b_i$, so the normalised $w = x/\sum x$ has risk
shares exactly proportional to $b$. It needs no expected returns, and calm assets get large
weights. When a weight cap or group limit binds, the exact budget may be unreachable; the lab
then finds the closest feasible risk shares (a small SLSQP problem started from Spinu's
solution) and the *Risk budgets* page reports the largest miss.

---

## 6. Maximum diversification

The **diversification ratio** is the weighted average volatility divided by the portfolio's
volatility:

$$\mathrm{DR}(w) = \frac{\sum_i w_i\sigma_i}{\sigma_p}$$

It is 1 for a single asset or perfectly correlated assets, and grows as correlations fall.
Choueifaty and Coignard (2008) proposed holding the portfolio that maximises it: the mix that
gets the most volatility reduction out of correlation. It has the same form as maximum Sharpe
with the vector of volatilities $\sigma$ in place of $\mu - r_f$, which is the same as assuming each
asset's expected excess return is proportional to its volatility. No return estimates are
needed.

---

## 7. Clusters: HRP, HERC and NCO

A covariance matrix of $N$ assets has $N(N+1)/2$ noisy entries, and an optimiser that inverts it
lets noise in one corner move weights everywhere. The cluster methods first group assets that
move together, using the correlation distance $d_{ij} = \sqrt{\tfrac12(1-\rho_{ij})}$ (0 for twins,
1 for opposites), then allocate in stages so that errors stay inside their branch.

- **HRP** (hierarchical risk parity, López de Prado 2016): single-linkage clustering sorts the
  assets so similar ones sit next to each other. The sorted list is then cut in half again and
  again; at each cut, capital is split between the halves in inverse proportion to their
  variance (each half held at inverse-variance weights). No matrix is inverted.
- **HERC** (hierarchical equal risk contribution, Raffinot 2017): Ward-linkage clustering, then
  the tree is cut into $k$ clusters, with $k$ chosen by the **silhouette** score (how much closer
  each asset is to its own cluster than to the next one). Risk is split along the tree's actual
  branches down to the clusters, and inverse-variance inside each cluster.
- **NCO** (nested clustered optimisation, López de Prado 2019): the same clusters, then minimum
  variance *inside* each cluster; each cluster's mix becomes one synthetic asset, and minimum
  variance is run again *across* the synthetic assets. An asset's weight is its weight in its
  cluster times its cluster's weight.

All three are long-only by construction and ignore caps, group limits and tracking error: the
two-stage structure is their regulariser. The pages mark them "unconstrained" when constraints
are active.

---

## 8. Tail risk: minimum CVaR

Volatility treats a large gain like a large loss and sees only averages of squared returns.
**CVaR** (conditional value at risk, or expected shortfall) at level $\beta$ is the average loss on
the worst $1-\beta$ share of days. Rockafellar and Uryasev (2000) showed that minimising it is a
linear programme over the historical days $r_1,\dots,r_T$:

$$\min_{w,\ \alpha}\ \ \alpha + \frac{1}{(1-\beta)\,T}\sum_{t=1}^T \max\!\big(-r_t^\top w - \alpha,\ 0\big)$$

At the optimum, $\alpha$ is the VaR (the loss threshold) and the objective is the CVaR. The method
can hold more of an asset that is volatile but rarely crashes, and less of one that is calm until
it falls with everything else. On *Tail risk* you choose the confidence level and, optionally, a
**return floor** (a minimum historical mean return), because unconstrained minimum CVaR can be
very defensive. It is fitted to the sample's worst days, so its edge on that page is in-sample.

---

## 9. Growth-optimal (Kelly)

Kelly (1956) asked which bet maximises long-run compound growth. For a portfolio it is the one
that maximises the average log return. The lab maximises it over the historical days:

$$\max_w\ \frac1T \sum_{t=1}^T \ln\big(1 + r_t^\top w\big)$$

To second order, $\mathbb E[\ln(1+R)] \approx \mu^\top w - \tfrac12 w^\top\Sigma w$: mean-variance with risk
aversion 1, which is far more aggressive than most investors choose. Its answer is also
dominated by the estimated means. Practitioners therefore hold a **fraction** of the Kelly
portfolio with the rest in cash. With fraction $f$ of the full Kelly exposure, growth is
proportional to $f(2-f)$: half Kelly keeps three quarters of the growth with half the
volatility, and it is much more forgiving when the means were overestimated. In the lab Kelly
is fully invested (weights sum to 1), so its fraction is applied separately, for example with
the volatility targeting on the Risk page.

---

## 10. Resampling (Michaud)

If one sample's estimates give a noisy optimum, average optima over many plausible samples.
The lab's **resampled max Sharpe** draws 60 bootstrap histories (days drawn with replacement,
same length, fixed seed), re-estimates the mean and sample covariance on each, solves maximum
Sharpe under the universe constraints, and averages the 60 weight vectors. Corner solutions
that depend on one lucky sample get diluted; weights that appear in most draws survive. Linear
constraints survive averaging (an average of feasible portfolios is feasible); a holdings cap
does not, so it applies per draw. The **resampled frontier** of Michaud (1998) is the same idea
applied to every point of the frontier.

---

## 11. Black–Litterman: start from the market

Black and Litterman (1992) replaced historical means with a neutral starting point. If the
market portfolio $w_{\text{mkt}}$ is what investors collectively hold, and they are mean-variance
investors with risk aversion $\delta$, then the excess returns that make it optimal are

$$\pi = \delta\,\Sigma\, w_{\text{mkt}}$$

These **equilibrium** (implied) returns are smooth and plausible, and maximum Sharpe on them
returns the market portfolio itself. The *Black–Litterman* page builds the prior from market
capitalisation (stocks) and fund size (ETFs), or equal weights.

You then state **views**: "I expect asset $k$ to return $q_k$", each with a confidence $c_k$. The
posterior blends the two, weighting each by its precision:

$$\mu_{\text{BL}} = \pi + \tau\Sigma P^\top\big(P\tau\Sigma P^\top + \Omega\big)^{-1}(q - P\pi)$$

$P$ picks the assets with views and $\Omega$ holds the views' variances. The lab sets each view's
variance from its confidence, $\Omega_{kk} = \tau\,p_k^\top\Sigma p_k\,(1-c_k)/c_k$. Because $\Omega$ is then
proportional to $\tau$, **$\tau$ cancels from the posterior mean**, so the page has no τ control:
confidence alone decides how far a view pulls. With a single view on asset $i$ the formula
collapses to something readable:

$$\mu_{\text{BL},i} = \pi_i + c\,(q_i - \pi_i), \qquad \mu_{\text{BL},j} = \pi_j + \frac{\Sigma_{ji}}{\Sigma_{ii}}\,c\,(q_i - \pi_i)$$

At 50% confidence the posterior closes half the gap; other assets move by their regression beta
on asset $i$. The lab works in excess returns internally and shows total returns (cash added
back), then runs maximum Sharpe on the posterior under the universe constraints.

---

## 12. Robust mean-variance

Instead of trusting $\mu$, charge for its uncertainty. The standard error of asset $i$'s annual
mean is $\mathrm{se}_i = \sigma_i/\sqrt{\text{years}}$ (computed in the code as
$\sqrt{252\,\sigma_i^2/T}$ with $T$ days). Treating the assets' estimation errors as independent, the
portfolio's expected return has standard error $\|\mathrm{diag}(\mathrm{se})\,w\|_2$, and the lab maximises

$$\mu^\top w - \frac{\lambda}{2}w^\top\Sigma w - \kappa\,\big\|\mathrm{diag}(\mathrm{se})\,w\big\|_2$$

with $\kappa$ the **uncertainty aversion**. At $\kappa = 0$ this is plain mean-variance; raising it moves
weight away from the assets whose means are least precisely known, which are the volatile ones.
The penalty is a norm, so the problem is a second-order cone programme, still convex. Judged
by its own estimates the robust portfolio looks slightly worse; its case rests on the estimates
being wrong out of sample.

---

## 13. Turnover-aware rebalancing

Every trade costs spreads, commissions and sometimes taxes, and many "improvements" are churn
on estimation noise. One-way **turnover** from current weights $w_0$ is
$\mathrm{TO} = \tfrac12\sum_i |w_i - w_{0,i}|$ (moving 10% from A to B is 10%). The lab adds a cost
per unit of turnover to the objective, in **annual-return units**:

$$\text{mean-variance: } \max\ \mu^\top w - \tfrac{\lambda}{2}w^\top\Sigma w - \text{cost}\cdot\mathrm{TO}, \qquad \text{min volatility: } \min\ \sigma_p + \text{cost}\cdot\mathrm{TO}$$

A cost of 1% means that trading the whole portfolio must improve the objective by at least 1% a
year. The absolute value makes the optimiser leave small differences alone and make the trades
with the most improvement per unit traded first. A hard turnover cap and a volatility cap are
optional. The page compares the current portfolio, the cost-free target and the compromise.

---

## 14. Constraints

The universe editor's rules apply to every optimising method, translated once
(`convex._feasible`) so they mean the same thing everywhere:

- **Weight cap:** $w_i \le$ cap. A cap below $1/N$ cannot add up to 100% and is rejected.
- **Long-short:** $w_i \ge -\text{max short}$ and **gross exposure** $\sum_i|w_i| \le G$. With $G = 1.6$ the
  book can be 130% long and 30% short (a 130/30 fund). The optimiser will short on noise too.
- **Group cap:** $\sum_{i\in g} w_i \le$ cap for every group $g$ (Yahoo sector for stocks, fund
  category for ETFs).
- **Tracking error:** $\sqrt{(w-b)^\top\Sigma(w-b)} \le \mathrm{TE}$, with $b$ equal weight: a leash that keeps the
  portfolio's return within a band of the equal-weight portfolio's.
- **Max holdings:** a limit on the number of non-zero positions makes the problem combinatorial
  (mixed-integer). The lab uses a standard heuristic: solve, keep the largest positions, solve
  again on those assets only. It is not guaranteed optimal.

Infeasible rules (say, a 40% group cap with only two groups) are reported, never silently relaxed.

---

## 15. Convex optimisation, and the max-Sharpe trick

A problem is **convex** when its objective is a bowl (or a ramp) and its feasible set has no dents.
Then any local optimum is the global one, and interior-point solvers find it to high precision
and *prove* it, or prove that no feasible portfolio exists. The lab states each problem in
cvxpy and solves it with Clarabel (falling back to ECOS or SCS). General-purpose methods like
SLSQP can stop short of the optimum and only approximately satisfy constraints, which is why the
lab moved off them.

Minimum variance, mean-variance, minimum CVaR (a linear programme), Kelly (log is concave),
robust mean-variance (a cone) and turnover-aware rebalancing are convex as written. Maximum
Sharpe is not: it is a ratio. Cornuéjols and Tütüncü (*Optimization Methods in Finance*, §8.2)
remove the ratio by rescaling. Write $y = \kappa w$ with $\kappa > 0$ chosen so that $(\mu-r_f)^\top y = 1$.
The Sharpe ratio is unchanged by scaling and equals $1/\sqrt{y^\top\Sigma y}$, so maximising it means

$$\min_{y,\ \kappa\ge 0}\ y^\top\Sigma y \quad \text{s.t.}\quad (\mu - r_f\mathbf 1)^\top y = 1,\quad \mathbf 1^\top y = \kappa,\quad Ay \le \kappa b$$

and the weights are recovered as $w = y/\kappa$. Every linear rule $Aw \le b$ carries over as
$Ay \le \kappa b$, so caps, shorting limits, group caps and the tracking-error cone all hold exactly.
Maximum diversification uses the same trick with $\sigma$ in place of $\mu - r_f$. If no allowed
portfolio beats cash, the constraint $(\mu - r_f)^\top y = 1$ cannot be met and the lab says so.

---

## References

- Markowitz (1952), "Portfolio selection", *J. Finance*; Tobin (1958), "Liquidity preference as behavior towards risk"
- Michaud (1989), "The Markowitz optimization enigma: is 'optimized' optimal?"; Michaud (1998), *Efficient Asset Management*
- Black and Litterman (1992), "Global portfolio optimization"; Idzorek (2005), "A step-by-step guide to the Black–Litterman model"
- Choueifaty and Coignard (2008), "Toward maximum diversification", *J. Portfolio Management*
- Maillard, Roncalli and Teïletche (2010), equal risk contribution; Spinu (2013), "An algorithm for computing risk parity weights"
- López de Prado (2016), "Building diversified portfolios that outperform out of sample"; (2019), "A robust estimator of the efficient frontier"
- Raffinot (2017), "Hierarchical clustering-based asset allocation"; Rockafellar and Uryasev (2000), "Optimization of conditional value-at-risk"
- Kelly (1956), "A new interpretation of information rate"; MacLean, Thorp and Ziemba (2011), *The Kelly Capital Growth Investment Criterion*
- Cornuéjols and Tütüncü (2007), *Optimization Methods in Finance*, ch. 8; Boyd and Vandenberghe (2004), *Convex Optimization*

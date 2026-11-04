# 06 · Attribution: where the return came from

A portfolio's return is a mix of things you chose deliberately and things you took on without
noticing: market exposure, a lean toward small or cheap companies, one holding doing most of the
work. Attribution separates them. Page: *Attribution* (benchmark, contributions, Fama–French
factor lab). Code: `portfolio/attribution.py`, `research/factor_model.py`, `data/factors.py`. The
*Report* page is covered at the end.

All regressions use daily simple returns; annual figures multiply daily means by 252 and daily
standard deviations by $\sqrt{252}$. The portfolio is held at its **fixed target weights**
(estimated on the full sample), so these are in-sample descriptions of a chosen allocation, not
out-of-sample evidence.

---

## 1. Against a benchmark

A **benchmark** is what you would otherwise hold, usually a broad index fund (SPY for US large
caps, ACWI for global equities, AGG for US bonds). Regress the portfolio's return over cash on the
benchmark's:

$$r_{p,t} - r_{f,t} = \alpha + \beta\,(r_{b,t} - r_{f,t}) + \varepsilon_t.$$

- **Beta** $\beta = \mathrm{cov}(r_p - r_f,\ r_b - r_f) / \mathrm{var}(r_b - r_f)$: how much the
  portfolio moves per 1% move in the benchmark. A beta of 0.7 means a 10% market fall typically
  costs about 7%.
- **Jensen's alpha** $\alpha$, annualised: the average return left over once the beta exposure is
  paid for. Measuring both sides *over cash* matters. Without it, a low-beta portfolio would be
  credited with alpha simply for the cash part of its return.
- **R²** is the share of the portfolio's daily variance the benchmark explains. With one regressor
  it is the squared correlation. A low R² means beta and alpha describe only a small part of the
  portfolio's behaviour.

**Active return and tracking error** use the plain gap $a_t = r_{p,t} - r_{b,t}$, where cash
cancels:

$$\text{active return} = 252\,\bar a, \qquad
\mathrm{TE} = \sqrt{252}\,\mathrm{sd}(a_t), \qquad
\mathrm{IR} = \frac{\text{active return}}{\mathrm{TE}}.$$

The **information ratio** is the Sharpe ratio of the bet against the benchmark: how much extra
return per unit of extra risk relative to it. Active managers who sustain an IR of 0.5 are
considered good.

**Up and down capture** split behaviour by direction. On the benchmark's up days, upside capture
is the portfolio's average return divided by the benchmark's average return; downside capture is
the same on down days. Upside 80% with downside 50% means the portfolio kept most of the gains and
avoided half the losses, the signature of a defensive allocation with positive alpha. The lab
computes them as ratios of average daily returns.

---

## 2. Return contributions

With fixed weights, the portfolio's annualised arithmetic return is a weighted sum, so it splits
exactly into one piece per asset:

$$\bar r_p = \sum_i w_i\,\bar r_i, \qquad \text{contribution}_i = 252\,w_i\,\bar r_{i}.$$

One tall bar means the result depends on a single holding. Compare it with the risk contributions
on *Risk → Decomposition*: an asset that adds far more risk than return is a candidate for a
smaller weight.

---

## 3. Factor models

A benchmark explains returns with one number. **Factor models** use several, each a long-short
portfolio that captures a known source of return. The factors in the lab come from Kenneth
French's data library, built from US stocks.

**CAPM** (Sharpe, 1964): one factor, the market's excess return (Mkt-RF). Everything else is
alpha.

**Fama–French three factors** (1993) add:
- **SMB, size (small minus big):** small companies minus large ones. Small firms have historically
  earned more, plausibly as payment for being riskier, less liquid and more exposed to bad times.
- **HML, value (high minus low book-to-market):** cheap stocks (high book value relative to price)
  minus expensive ones. The risk story: cheap firms are often distressed. The behavioural story:
  investors over-extrapolate growth and overpay for glamour stocks.

**Five factors** (2015) add:
- **RMW, profitability (robust minus weak):** firms with high operating profitability minus low.
- **CMA, investment (conservative minus aggressive):** firms that grow their assets slowly minus
  those that grow them fast. Aggressive investment tends to be followed by lower returns.

**Momentum** (Carhart, 1997; Jegadeesh & Titman, 1993):
- **Mom (winners minus losers):** stocks with the best returns over the past year (skipping the
  latest month) minus those with the worst. Trends persist for months, usually explained by slow
  diffusion of information.

Each factor portfolio is built from sorts: stocks are split by size and by the characteristic
(book-to-market, profitability, investment, past return), and the factor is the average return of
the top group minus the bottom group. A factor is a *spread*, not a holding you can buy for free:
its returns are before costs and include short positions.

### The regression

The lab regresses the portfolio's daily return over the T-bill rate on all six factors at once:

$$r_{p,t} - r_{f,t} = \alpha + \sum_{k} \beta_k\,f_{k,t} + \varepsilon_t,
\qquad k \in \{\text{Mkt-RF, SMB, HML, RMW, CMA, Mom}\}.$$

Each $\beta_k$ is an exposure. A market beta near 1 moves with US stocks; a positive HML beta
behaves like cheap-minus-expensive; a negative SMB beta like large companies. Here $r_f$ is the
T-bill rate published with the factors, so both sides use the same cash rate.

### Newey–West standard errors

Ordinary least squares (OLS) standard errors assume the residuals are independent and have constant
variance. Daily returns break both assumptions:
- volatility clusters, so some periods are much noisier than others (heteroskedasticity);
- returns are slightly autocorrelated, especially for assets that trade in other time zones or
  less frequently.

Plain OLS errors then overstate the precision of every estimate. The **Newey–West** (HAC)
estimator keeps the OLS coefficients and replaces their covariance with

$$\hat V = (X^\top X)^{-1}\Big[\sum_t u_t^2\,x_t x_t^\top + \sum_{\ell=1}^{L}\Big(1 - \frac{\ell}{L+1}\Big)\sum_t u_t u_{t-\ell}\big(x_t x_{t-\ell}^\top + x_{t-\ell} x_t^\top\big)\Big](X^\top X)^{-1},$$

where $u_t$ are the residuals and $x_t$ the factor values (with a constant). The first sum allows
for changing variance; the second for correlation up to $L$ days apart, with linearly declining
(Bartlett) weights that keep $\hat V$ positive. The lab uses the standard automatic lag
$L = \lfloor 4\,(n/100)^{2/9} \rfloor$: 6 lags for about five years of daily data.

### t-statistics, p-values and alpha

- **t-statistic:** $t_k = \hat\beta_k / \mathrm{SE}(\hat\beta_k)$. $\lvert t \rvert$ above about 2
  corresponds to $p < 0.05$.
- **p-value:** the chance of an estimate this far from zero if the true exposure were zero (from a
  Student-t with $n - 7$ degrees of freedom). The 95% interval on the chart is
  $\hat\beta \pm 1.96\,\mathrm{SE}$.
- Large samples make even tiny exposures significant. A significant beta of 0.05 is real, but it
  barely moves the portfolio: read the size as well as the p-value.

**Alpha needs a long record.** The standard error of an annual alpha is roughly the residual
volatility divided by $\sqrt{T_\text{years}}$. With 5% residual volatility over five years, that is
about 2.2%, so a 2% alpha has $t \approx 0.9$: indistinguishable from zero. Put differently,
$t_\alpha \approx \mathrm{IR}_\varepsilon\sqrt{T_\text{years}}$, so even a residual IR of 0.5 needs
about 16 years to reach $t = 2$. A positive alpha that is not significant is not evidence of skill.
For portfolios chosen on the same data, in-sample alpha is also biased upward.

**R²** here is the share of daily variance the six factors explain together.

### Where the risk comes from

The variance of the excess return splits into a factor part and a residual part:

$$\mathrm{var}(r_p - r_f) \approx \beta^\top \Sigma_f\,\beta + \mathrm{var}(\varepsilon),$$

where $\Sigma_f$ is the factor covariance. The factor part is attributed to each factor by its
**Euler contribution** $\beta_k (\Sigma_f \beta)_k$, the same idea as risk contributions to
assets. The shares add up to 100% together with the **idiosyncratic** share $\mathrm{var}(\varepsilon)$
(risk tied to the particular assets, not to any broad style).

- Correlated factors share credit through the covariance term.
- A *negative* share is a hedge: that exposure tends to move against the rest and lowers total
  variance.
- A large idiosyncratic share means the result depends on specific holdings more than on styles.

### Rolling betas and per-asset exposures

The full-sample betas are averages. **Rolling betas** re-run the regression (plain OLS) on each
trailing 252-day window, every 5 days. They show whether a tilt was steady or came and went. Fixed
weights still drift in factor terms, because assets change character (a growth stock can mature
into a value stock). One year of data gives noisy betas, so expect some wobble from noise alone.

The same regression run on each asset alone shows which holdings bring each tilt. Because OLS is
linear, the portfolio's betas are the weighted average of the assets' betas.

### Limits

- **US-equity factors.** The factors are built from US stocks. Bonds, commodities, gold and
  foreign assets usually show a low R²: most of their risk lies outside these factors. A long
  Treasury fund typically shows a market beta near zero and a large idiosyncratic share.
- **Lag.** The library publishes with a lag of about a month, so the latest days are not in the
  regression. When the library cannot be reached, a bundled copy is used and flagged.
- **Time zones.** Foreign markets close before New York, so their daily returns relate partly to the
  *next* US day; this lowers same-day betas and is one reason for Newey–West errors.
- **Description, not prediction.** Exposures describe how the portfolio behaved; future factor
  returns are as uncertain as any other.

---

## 4. The Research report (page: *Report*)

The report is one written summary of a chosen portfolio, in Markdown. It runs a fixed set of
analyses on the current universe:

- **Construction:** every method's expected Sharpe, expected volatility and diversification ratio
  from the shared estimates (model-implied, in-sample), and which method leads on each.
- **Risk:** the selected portfolio's largest risk contributor against its capital weight, its
  effective number of assets and its weighted average correlation.
- **Robustness:** 100 moving-block bootstrap resamples, naming the most sample-sensitive weight.
- **Out-of-sample validation:** a walk-forward test (rolling one-year window, monthly
  rebalancing, 5 bp costs), with return before and after costs and the Sharpe ratio over cash,
  when the sample is long enough.
- **Stress and scenarios:** volatility after moving correlations 30% of the way to +1 and scaling
  volatilities by 1.5×, and the deepest drawdown among the historical crisis replays.
- **Attribution:** beta, alpha and information ratio against SPY.

It is reproducible because nothing depends on what you clicked before: the same analyses always
run, with fixed settings and fixed random seeds. The same universe and the same price data give
the same report, so it can be downloaded, saved and compared with a later one.

---

## References

- Jensen (1968), "The performance of mutual funds in the period 1945–1964", *Journal of Finance*
- Sharpe (1964), "Capital asset prices: a theory of market equilibrium under conditions of risk",
  *Journal of Finance*
- Fama & French (1993), "Common risk factors in the returns on stocks and bonds", *Journal of
  Financial Economics*; (2015), "A five-factor asset pricing model", *JFE*
- Carhart (1997), "On persistence in mutual fund performance", *Journal of Finance*
- Jegadeesh & Titman (1993), "Returns to buying winners and selling losers", *Journal of Finance*
- Newey & West (1987), "A simple, positive semi-definite, heteroskedasticity and autocorrelation
  consistent covariance matrix", *Econometrica*
- Grinold & Kahn, *Active Portfolio Management* (2000), ch. 5 (information ratio)
- Kenneth French's data library: mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html

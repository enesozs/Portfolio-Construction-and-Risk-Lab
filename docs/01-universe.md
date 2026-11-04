# 01 · The universe: returns, risk and estimation

Every page of the lab starts from the same thing: a list of assets, a date range and two
estimates computed from their history, expected returns $\mu$ and the covariance matrix
$\Sigma$. This note explains what those numbers are, how precisely history pins them down,
and why the covariance estimator is a choice worth making on purpose. Page: *Universe*, plus
the universe bar and its editor at the top of every page. Code: `data/universe.py`,
`estimators/`, `research/covariance_diagnostics.py`, `research/dependency_regimes.py`.

Symbols used throughout:

| Symbol | Meaning |
|---|---|
| $R_t$ | simple return on day $t$: $P_t / P_{t-1} - 1$, dividends reinvested |
| $T$ | number of daily observations in the sample |
| $N$ | number of assets |
| $\mu$ | expected (mean) return, annual |
| $\sigma$ | volatility (standard deviation of returns), annual |
| $\rho_{ij}$ | correlation between assets $i$ and $j$ |
| $\Sigma$ | covariance matrix, annual: $\Sigma_{ij} = \rho_{ij}\sigma_i\sigma_j$ |
| $w$ | portfolio weights, summing to 1 |
| $r_f$ | cash (risk-free) rate, annual |

---

## 1. Daily returns: simple or log

A **simple return** is the percentage change in price, $R_t = P_t/P_{t-1} - 1$. A **log
return** is $r_t = \ln(P_t/P_{t-1}) = \ln(1 + R_t)$. For small moves they are almost equal
(a 1% day is a 0.995% log return); they differ on big days and they add up differently:

- **Log returns add over time.** The log return over a year is the sum of the daily log
  returns, which makes them convenient for statistics on a single asset.
- **Simple returns add across assets.** A portfolio's return on a day is exactly the weighted
  sum of its assets' simple returns, $R_{p,t} = \sum_i w_i R_{i,t}$. The log return of a
  portfolio is *not* the weighted sum of log returns.

Portfolio construction is about weighted sums, so the lab uses **daily simple returns**
everywhere, computed from adjusted closes (dividends reinvested).

---

## 2. Annualising: ×252 and ×√252

Numbers are quoted per year, using 252 trading days:

$$\mu_{\text{annual}} = 252\,\bar R_{\text{daily}}, \qquad \sigma_{\text{annual}} = \sqrt{252}\;\sigma_{\text{daily}}, \qquad \Sigma_{\text{annual}} = 252\,\Sigma_{\text{daily}}$$

Means scale with time. Variances scale with time too *if days are independent*, so
standard deviations scale with its square root: a daily volatility of 1.26% is about 20% a
year. Daily returns are close to uncorrelated from one day to the next, so this works well
for prices; it understates risk for assets whose returns trend or are smoothed.

---

## 3. Expected returns, and why they are the noisiest estimate

The lab estimates $\mu$ in one of three ways (universe editor → *Expected returns*):

- **Arithmetic mean:** average daily return × 252. The textbook input to mean-variance, and
  the right one for "expected return over the next period".
- **Geometric mean:** the compound annual growth rate actually achieved,
  $\big(\prod_t (1+R_t)\big)^{252/T} - 1$. It is lower than the arithmetic mean, by roughly
  $\sigma^2/2$: about 1% a year for a 15%-volatility asset, about 8% for a 40%-volatility one.
  Volatility drags compound growth down.
- **EWMA (exponentially weighted moving average):** recent days count more. The lab uses a
  span of 126 days, so each day's weight is $\lambda = 1 - 2/127 \approx 0.984$ times the next
  one's: a half-life of about 44 trading days (two months). It reacts quickly, which also
  means it chases whatever happened last quarter.

Whichever you pick, the estimate is imprecise. The **standard error** of a sample mean is the
standard deviation divided by the square root of the number of observations. Annualised,
that becomes

$$\text{SE}(\hat\mu) = \frac{\sigma}{\sqrt{\text{years of data}}}$$

and the number of days does not matter, only the span of time. Five years of a 20%-volatility
stock give $\text{SE} = 20\%/\sqrt5 \approx 9\%$ a year: a measured 12% mean is consistent with a
true mean anywhere from about −6% to 30%. To get the error down to 2% you would need a
century of data, during which the company and the market would have changed many times.

Volatility is different. Its standard error is roughly $\sigma/\sqrt{2T}$ with $T$ in *days*,
so the same five years (1,260 days) pin a 20% volatility down to about ±0.4%. More frequent
data improves risk estimates but not return estimates. This asymmetry is why the lab marks
methods that use $\mu$ with a **μ** badge, and why many practitioners prefer methods that
ignore expected returns altogether (minimum variance, risk parity, HRP).

---

## 4. Volatility, correlation and the covariance matrix

**Volatility** is the standard deviation of returns, a measure of how widely they swing.
**Correlation** $\rho_{ij} \in [-1, 1]$ measures how two assets move together: +1 always in
step, 0 unrelated, −1 always opposite. The **covariance** combines the two,
$\Sigma_{ij} = \rho_{ij}\sigma_i\sigma_j$, and the **covariance matrix** collects every pair. A
portfolio's variance is

$$\sigma_p^2 = w^\top \Sigma\, w = \sum_i\sum_j w_i w_j \rho_{ij}\sigma_i\sigma_j$$

With correlations below 1, $\sigma_p$ is smaller than the weighted average volatility
$\sum_i w_i\sigma_i$. That gap is the **diversification** benefit, and it depends on every pair.
With $N$ assets there are $N(N+1)/2$ distinct entries to estimate: 21 for six assets, 325 for
25. Each one carries its own estimation error.

The *Correlation of daily returns* heatmap shows the correlations; *Risk and return by asset*
places each asset by volatility and expected return, with the cash rate as a dashed line.

---

## 5. Why optimisers invert the covariance matrix

Without constraints, the minimum-variance and maximum-Sharpe portfolios have closed forms:

$$w_{\text{min var}} \propto \Sigma^{-1}\mathbf 1, \qquad w_{\text{max Sharpe}} \propto \Sigma^{-1}(\mu - r_f\mathbf 1)$$

Both multiply by $\Sigma^{-1}$, and an inverse amplifies errors. Look at $\Sigma$ through its
**eigenvalues**: the variances of uncorrelated "directions" (combinations of assets). The
largest is usually "everything moves together"; the smallest is a near-hedge, a long-short
combination that the sample says barely moves. Inverting turns the smallest eigenvalue into
the *largest* weight: the optimiser loves the direction it believes is almost riskless, and
it is exactly the direction measured least reliably.

The **condition number** $\kappa = \lambda_{\max}/\lambda_{\min}$ measures this. A relative
error in the inputs can be amplified by up to $\kappa$ in the output. For two assets with equal
volatility and correlation $\rho$, the eigenvalues are $\sigma^2(1\pm\rho)$, so
$\kappa = (1+\rho)/(1-\rho)$: 19 at $\rho = 0.9$, 199 at $\rho = 0.99$. Near-duplicates (two S&P
500 funds, two Treasury funds) make the problem ill-conditioned.

The **effective rank** asks how many independent directions really carry the risk. Normalise
the eigenvalues to shares $p_k = \lambda_k/\sum\lambda$, then take
$\exp\!\big(-\sum_k p_k\ln p_k\big)$. It is $N$ when every direction carries equal variance and
close to 1 when one factor dominates. An all-stock universe can have an effective rank near 2
out of 6: one market factor plus a little else.

The table *How trustworthy is the covariance matrix?* shows both numbers for each estimator,
plus the **distance from sample** $\|\hat\Sigma - S\|_F / \|S\|_F$ (how far an estimator moved
away from the plain sample matrix $S$, as a share of its size).

---

## 6. Better covariance estimators

The **sample covariance** estimates every entry independently. It is unbiased, but with few
observations per parameter its extreme eigenvalues are too extreme: the largest too large and
the smallest too small. That is precisely what inversion punishes. The lab offers three
alternatives (universe editor → *Covariance*); **Ledoit–Wolf** is the default.

### Ledoit–Wolf shrinkage

Blend the sample matrix with a simple, stable target:

$$\hat\Sigma = (1-\delta)\,S + \delta\,\bar\sigma^2 I, \qquad \bar\sigma^2 = \operatorname{tr}(S)/N$$

The target in the lab is a **scaled identity**: every asset gets the average variance, and
every correlation is zero. The intensity $\delta \in [0,1]$ is not a tuning knob: Ledoit and Wolf
(2004) derived the value that minimises expected squared error from the data itself, so noisy
samples (many assets, few days) shrink more. Shrinking pulls the eigenvalues toward their
average, which lowers the condition number. With long samples and few assets $\delta$ is small
and the result is close to the sample matrix. The implementation is written out directly and
matches scikit-learn to 1e-19.

### EWMA covariance

The same exponential weights as the EWMA mean (span 126 days), applied to covariances; the
lab uses the latest value. It describes *current* risk better after a regime change (a
volatility spike shows up within weeks) at the cost of using fewer effective observations,
so it is noisier.

### Denoising (Marchenko–Pastur)

Random-matrix theory gives a benchmark for pure noise. If $N$ assets were truly uncorrelated
and you estimated their correlation matrix from $T$ days, the sample eigenvalues would not all
be 1. They would spread over the **Marchenko–Pastur** range

$$\lambda \in \big[\sigma^2(1-\sqrt q)^2,\ \sigma^2(1+\sqrt q)^2\big], \qquad q = N/T$$

An eigenvalue inside that band cannot be told apart from noise. The lab's **constant
residual eigenvalue** method (López de Prado, 2020) keeps the eigenvalues above the upper edge
as signal, replaces all the others by their average (so the total variance is unchanged),
rebuilds the matrix, rescales it to a unit diagonal, and multiplies back the sample
volatilities. The noise level $\sigma^2$ is itself estimated as the mean of the noise
eigenvalues, iterated to a fixed point.

The band's width depends on $q$. With 6 assets and 5 years, $q \approx 0.005$ and the band is
roughly [0.87, 1.14]: narrow, so little is treated as noise. With 100 assets and one year,
$q \approx 0.4$ and it runs from 0.13 to 2.66: most of the spectrum is noise. Denoising matters
most for wide universes and short windows.

---

## 7. Cash, T-bills and the Sharpe ratio

Holding cash is always an option, so risk is only worth taking if it pays more than cash. The
lab's cash earns the **13-week US Treasury bill yield** (`^IRX`), accrued day by day at
yield/252. The universe's single **cash rate** $r_f$ is the average of that yield over the
sample; switch on *Manual cash rate* in the editor to replace the series with a constant.

The **Sharpe ratio** is the excess return per unit of risk:

$$\text{Sharpe} = \frac{\mu - r_f}{\sigma}$$

On the *Assets* table it is computed from the estimated $\mu$ and $\sigma$; on performance
tables it uses realised daily returns minus that day's cash return, annualised. A Sharpe of
0.5 means the asset earned half a volatility's worth of return over cash per year. Measuring
against zero instead of cash flatters everything when rates are high: at a 5% cash rate, an
asset earning 7% with 20% volatility has a Sharpe of 0.1, not 0.35.

The *Assets* table also shows **realised return** (the compound annual growth actually
achieved) and **maximum drawdown**: the largest fall from a running peak of wealth,
$\min_t\big(W_t/\max_{s\le t}W_s - 1\big)$. It is the loss an investor who bought at the worst
moment would have sat through.

---

## 8. One common sample: the youngest asset sets the start

Covariances need returns on the *same* days for every pair, so every analysis uses only dates
on which all assets traded. Short gaps from differing exchange holidays are filled (at most
five days); a missing start is never filled. If one asset listed after your start date, the
whole sample starts on its first trading day. The universe records each ticker's first trade
and which tickers moved the start (`limiting`); the universe bar and the *Universe* page warn
when it happens and the *Assets* table flags them with ⚑.

This matters because a shorter sample changes every estimate. Adding a recently listed stock
to a universe of funds with 30-year histories can silently cut the sample to a few years and
drop the 2008 crisis from every estimate. The crisis replays (Risk area) avoid this by using
each asset's full history.

---

## 9. Correlations move: rolling correlation and crisis spikes

A single correlation matrix averages calm and stressed periods together. The *Rolling average
correlation* chart recomputes the average pairwise correlation over a trailing window (21,
63, 126 or 252 days) and classifies today against the sample's terciles: low, normal or high
correlation.

The recurring pattern is that correlations **jump in sell-offs**. In 2008 and March 2020, assets
that usually moved independently fell together, because the same investors were selling
everything to raise cash. Diversification estimated over a calm sample overstates the
protection available in a crash. Correlations between asset classes also shift over years:
US stocks and Treasuries were negatively correlated for most of 2000–2021 and turned positive
when inflation rose in 2022. Short windows react quickly but are noisy; 252 days is smoother
and later.

---

## References

- Campbell, Lo and MacKinlay, *The Econometrics of Financial Markets*, ch. 1 (returns)
- Merton (1980), "On estimating the expected return on the market", *J. Financial Economics*
- Ledoit and Wolf (2004), "A well-conditioned estimator for large-dimensional covariance
  matrices", *J. Multivariate Analysis*
- RiskMetrics Technical Document (1996), J.P. Morgan/Reuters (EWMA)
- Marchenko and Pastur (1967), "Distribution of eigenvalues for some sets of random matrices"
- López de Prado (2020), *Machine Learning for Asset Managers*, ch. 2 (denoising)
- Roy and Vetterli (2007), "The effective rank: a measure of effective dimensionality"
- Longin and Solnik (2001), "Extreme correlation of international equity markets", *J. Finance*

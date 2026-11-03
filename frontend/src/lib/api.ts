// Typed client for the FastAPI backend. The types are generated from its OpenAPI schema
// (`npm run api-types`); never edit api-types.ts by hand.
import type { components } from './api-types'

type Schemas = components['schemas']

export type UniverseIn = Schemas['UniverseIn']
export type PortfolioKey = NonNullable<Schemas['PortfolioRequest']['portfolio']>
export type TimeSeries = Schemas['TimeSeries']
export type Histogram = Schemas['Histogram']
export type Performance = Schemas['Performance']
export type Weights = Record<string, number>

export type OverviewResponse = Schemas['OverviewResponse']
export type DependencyResponse = Schemas['DependencyResponse']
export type PortfoliosResponse = Schemas['PortfoliosResponse']
export type PortfolioSummary = Schemas['PortfolioSummary']
export type EstimatorsResponse = Schemas['EstimatorsResponse']
export type BlackLittermanResponse = Schemas['BlackLittermanResponse']
export type TailRiskResponse = Schemas['TailRiskResponse']
export type CompareResponse = Schemas['CompareResponse']
export type RiskBudgetResponse = Schemas['RiskBudgetResponse']
export type DecompositionResponse = Schemas['DecompositionResponse']
export type VolTargetResponse = Schemas['VolTargetResponse']
export type StressResponse = Schemas['StressResponse']
export type ScenarioResponse = Schemas['ScenarioResponse']
export type CrisesResponse = Schemas['CrisesResponse']
export type CrisisOut = Schemas['CrisisOut']
export type SimulationResponse = Schemas['SimulationResponse']
export type WalkForwardResponse = Schemas['WalkForwardResponse']
export type RebalancingResponse = Schemas['RebalancingResponse']
export type BootstrapResponse = Schemas['BootstrapResponse']
export type BenchmarkResponse = Schemas['BenchmarkResponse']
export type FactorResponse = Schemas['FactorResponse']
export type ReportResponse = Schemas['ReportResponse']
export type MetaResponse = Schemas['MetaResponse']
export type SignalsResponse = Schemas['SignalsResponse']
export type SignalOut = Schemas['SignalOut']
export type DynamicRequest = Schemas['DynamicRequest']
export type DynamicResponse = Schemas['DynamicResponse']

/** Page-specific parameters sent beside the shared universe. */
type Params<T> = Omit<T, 'universe'>

export class ApiError extends Error {}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('Cannot reach the portfolio API. Is the backend running?')
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const message =
      typeof detail?.detail === 'string'
        ? detail.detail
        : Array.isArray(detail?.detail)
          ? detail.detail.map((d: { msg: string }) => d.msg).join('; ')
          : `Request failed (${response.status})`
    throw new ApiError(message)
  }
  return (await response.json()) as T
}

/** One POST endpoint taking `{ universe, ...params }`. */
function endpoint<Req extends { universe: UniverseIn }, Res>(path: string) {
  return (universe: UniverseIn, params: Params<Req>, signal?: AbortSignal) =>
    request<Res>(path, { universe, ...params }, signal)
}

export const api = {
  meta: (signal?: AbortSignal) => request<MetaResponse>('/meta', undefined, signal),
  overview: endpoint<Schemas['UniverseRequest'], OverviewResponse>('/universe/overview'),
  dependency: endpoint<Schemas['DependencyRequest'], DependencyResponse>('/universe/dependency'),
  portfolios: endpoint<Schemas['UniverseRequest'], PortfoliosResponse>('/construction/portfolios'),
  estimators: endpoint<Schemas['EstimatorsRequest'], EstimatorsResponse>(
    '/construction/estimators',
  ),
  blackLitterman: endpoint<Schemas['BlackLittermanRequest'], BlackLittermanResponse>(
    '/construction/black-litterman',
  ),
  tailRisk: endpoint<Schemas['TailRiskRequest'], TailRiskResponse>('/construction/tail-risk'),
  robust: endpoint<Schemas['RobustRequest'], CompareResponse>('/construction/robust'),
  turnover: endpoint<Schemas['TurnoverRequest'], CompareResponse>('/construction/turnover'),
  riskBudget: endpoint<Schemas['RiskBudgetRequest'], RiskBudgetResponse>(
    '/construction/risk-budget',
  ),
  decomposition: endpoint<Schemas['PortfolioRequest'], DecompositionResponse>(
    '/risk/decomposition',
  ),
  volTarget: endpoint<Schemas['VolTargetRequest'], VolTargetResponse>('/risk/vol-target'),
  stress: endpoint<Schemas['StressRequest'], StressResponse>('/risk/stress'),
  scenario: endpoint<Schemas['ScenarioRequest'], ScenarioResponse>('/risk/scenario'),
  crises: endpoint<Schemas['PortfolioRequest'], CrisesResponse>('/risk/crises'),
  simulation: endpoint<Schemas['SimulationRequest'], SimulationResponse>('/risk/simulation'),
  walkForward: endpoint<Schemas['WalkForwardRequest'], WalkForwardResponse>(
    '/validation/walk-forward',
  ),
  rebalancing: endpoint<Schemas['RebalancingRequest'], RebalancingResponse>(
    '/validation/rebalancing',
  ),
  bootstrap: endpoint<Schemas['BootstrapRequest'], BootstrapResponse>('/validation/bootstrap'),
  benchmark: endpoint<Schemas['BenchmarkRequest'], BenchmarkResponse>('/attribution/benchmark'),
  factors: endpoint<Schemas['PortfolioRequest'], FactorResponse>('/attribution/factors'),
  report: endpoint<Schemas['PortfolioRequest'], ReportResponse>('/report'),
  signals: (signal?: AbortSignal) =>
    request<SignalsResponse>('/dynamic/signals', undefined, signal),
  dynamic: endpoint<DynamicRequest, DynamicResponse>('/dynamic/backtest'),
}

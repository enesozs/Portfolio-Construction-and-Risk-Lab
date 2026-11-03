import { type ComponentType, type LazyExoticComponent, lazy } from 'react'

type PageModule = { default: ComponentType }

export interface PageDef {
  /** Relative to the area; '' is the area's index page. */
  path: string
  label: string
  load: () => Promise<PageModule>
  Component: LazyExoticComponent<ComponentType>
}

export interface AreaDef {
  path: string
  label: string
  pages: PageDef[]
}

function page(path: string, label: string, load: () => Promise<PageModule>): PageDef {
  return { path, label, load, Component: lazy(load) }
}

/** Every area and page: drives the router and each area's tabs. */
export const AREAS: AreaDef[] = [
  {
    path: 'universe',
    label: 'Universe',
    pages: [page('', 'Overview', () => import('@/features/universe/overview-page'))],
  },
  {
    path: 'construct',
    label: 'Construct',
    pages: [
      page('', 'Portfolios', () => import('@/features/construct/portfolios-page')),
      page('estimators', 'Estimators', () => import('@/features/construct/estimators-page')),
      page(
        'black-litterman',
        'Black–Litterman',
        () => import('@/features/construct/black-litterman-page'),
      ),
      page('tail-risk', 'Tail risk', () => import('@/features/construct/tail-risk-page')),
      page('robust', 'Robust & turnover', () => import('@/features/construct/robust-page')),
      page('risk-budget', 'Risk budgets', () => import('@/features/construct/risk-budget-page')),
    ],
  },
  {
    path: 'dynamic',
    label: 'Dynamic',
    pages: [page('', 'Dynamic allocation', () => import('@/features/dynamic/dynamic-page'))],
  },
  {
    path: 'risk',
    label: 'Risk',
    pages: [
      page('', 'Decomposition', () => import('@/features/risk/decomposition-page')),
      page('stress', 'Stress & scenarios', () => import('@/features/risk/stress-page')),
      page('crises', 'Crisis replay', () => import('@/features/risk/crises-page')),
      page('simulation', 'Monte Carlo', () => import('@/features/risk/simulation-page')),
    ],
  },
  {
    path: 'validate',
    label: 'Validate',
    pages: [
      page('', 'Walk-forward', () => import('@/features/validate/walk-forward-page')),
      page('rebalancing', 'Rebalancing', () => import('@/features/validate/rebalancing-page')),
      page('bootstrap', 'Stability', () => import('@/features/validate/bootstrap-page')),
    ],
  },
  {
    path: 'attribution',
    label: 'Attribution',
    pages: [
      page('', 'Benchmark & factors', () => import('@/features/attribution/attribution-page')),
    ],
  },
  {
    path: 'report',
    label: 'Report',
    pages: [page('', 'Report', () => import('@/features/report/report-page'))],
  },
]

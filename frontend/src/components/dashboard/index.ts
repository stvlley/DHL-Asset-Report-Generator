/**
 * Dashboard components barrel export
 */
export { default as KPICard } from './KPICard'
export { default as SectionCard } from './SectionCard'
export { default as SiteSummaryTable } from './SiteSummaryTable'

// Charts
export { default as TrendLineChart } from './charts/TrendLineChart'
export { default as VarianceDonutChart, transformVarianceSummary } from './charts/VarianceDonutChart'

// Alerts
export { default as AlertsPanel, computeAlerts } from './alerts/AlertsPanel'
export { default as AlertItem } from './alerts/AlertItem'

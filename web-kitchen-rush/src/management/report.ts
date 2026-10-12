import type { Report } from './types';

/** Derived receipt figures, preserving the game's existing after-repayment profit accounting. */
export function summarizeReport(report: Report, previous?: Report) {
  const totalRevenue = report.revenue + report.tips;
  const totalCosts = report.ingredients + report.wages + report.rent + report.debtPayment;
  return {
    totalRevenue,
    totalCosts,
    margin: totalRevenue > 0 ? report.profit / totalRevenue * 100 : null,
    profitChange: previous ? report.profit - previous.profit : null,
  };
}

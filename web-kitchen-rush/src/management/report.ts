import type { Report } from './types';

/** Derived receipt figures, preserving the game's existing after-repayment profit accounting. Branch income counts as income. */
export function summarizeReport(report: Report, previous?: Report) {
  const branch = report.branch ?? 0;
  const totalRevenue = report.revenue + report.tips + branch;
  const totalCosts = report.ingredients + report.wages + report.rent + report.debtPayment;
  return {
    branch,
    totalRevenue,
    totalCosts,
    margin: totalRevenue > 0 ? report.profit / totalRevenue * 100 : null,
    profitChange: previous ? report.profit - previous.profit : null,
  };
}

/** Whole-dollar display shared by the owner ledger and management panels. */
export const money = (value: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

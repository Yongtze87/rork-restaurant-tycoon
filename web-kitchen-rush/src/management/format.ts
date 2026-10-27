/** Whole-dollar display shared by the owner ledger and management panels. */
export const money = (value: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
/** Up to cents, for per-dish ingredient costs that town, tide and region effects make fractional. */
export const moneyCents = (value: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

// All monetary figures in the database are stored in a single reporting
// currency, SGD (TSH Group's AutoCount book currency — see finsight_schema.sql).
// Multi-currency support is a display-only concern: values are converted from
// SGD to the viewer's chosen currency at render time using daily FX rates.

export const CURRENCIES = ["SGD", "USD", "MYR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: CurrencyCode = "SGD";

// Units of `currency` per 1 SGD, keyed by currency code.
export type ExchangeRates = Partial<Record<CurrencyCode, number>>;

export type FxContext = { currency: CurrencyCode; rates: ExchangeRates | null };

const SYMBOLS: Record<CurrencyCode, string> = { SGD: "$", USD: "US$", MYR: "RM" };

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function currencySymbol(currency: CurrencyCode): string {
  return SYMBOLS[currency];
}

export function fxSymbol(fx?: FxContext | null): string {
  return currencySymbol(fx?.currency ?? BASE_CURRENCY);
}

export function convertAmount(amountInSgd: number, fx?: FxContext | null): number {
  if (!fx || fx.currency === BASE_CURRENCY) return amountInSgd;
  const rate = fx.rates?.[fx.currency];
  return rate ? amountInSgd * rate : amountInSgd;
}

export function formatCurrencyCompact(value: number, fx?: FxContext | null) {
  const converted = convertAmount(value, fx);
  const absoluteValue = Math.abs(converted);
  const sign = converted < 0 ? "-" : "";
  const symbol = fxSymbol(fx);

  if (absoluteValue >= 1_000_000) return `${sign}${symbol}${(absoluteValue / 1_000_000).toFixed(1)}m`;
  if (absoluteValue >= 1_000) return `${sign}${symbol}${(absoluteValue / 1_000).toFixed(0)}k`;
  return `${sign}${symbol}${absoluteValue.toFixed(0)}`;
}

export function formatCurrencyExact(value: number, fx?: FxContext | null) {
  const converted = convertAmount(value, fx);
  return `${converted < 0 ? "-" : ""}${fxSymbol(fx)}${Math.abs(converted).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

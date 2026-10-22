import { NextResponse } from "next/server";
import { BASE_CURRENCY, CURRENCIES, type ExchangeRates } from "@/lib/currency";

const quotes = CURRENCIES.filter((currency) => currency !== BASE_CURRENCY);

// Frankfurter v2 (v1 is deprecated) needs no API key. By default each rate is
// blended across the central banks that publish it, which for SGD and MYR
// include the Monetary Authority of Singapore and Bank Negara Malaysia.
// Next.js persists this fetch for 24h server-side, so every request for a
// given day is served from cache instead of re-hitting the upstream API.
const UPSTREAM = `https://api.frankfurter.dev/v2/rates?base=${BASE_CURRENCY}&quotes=${quotes.join(",")}`;

// One row per quote currency, e.g. { date: "2026-10-22", base: "SGD", quote: "USD", rate: 0.78284 }.
type FrankfurterRate = { date: string; base: string; quote: string; rate: number };

export async function GET() {
  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, { next: { revalidate: 86400 } });
  } catch {
    return NextResponse.json({ error: "Exchange rate service is unreachable." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Exchange rate service returned an error." }, { status: 502 });
  }

  const rows = (await upstream.json()) as FrankfurterRate[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Exchange rate service returned no rates." }, { status: 502 });
  }

  const rates: ExchangeRates = { [BASE_CURRENCY]: 1 };
  for (const row of rows) rates[row.quote as keyof ExchangeRates] = row.rate;
  // Rows can carry different dates; report the most recent one.
  const date = rows.map((row) => row.date).sort().at(-1);

  return NextResponse.json({ base: BASE_CURRENCY, date, rates });
}

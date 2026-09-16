import { NextResponse } from "next/server";
import { BASE_CURRENCY, CURRENCIES, type ExchangeRates } from "@/lib/currency";

const symbols = CURRENCIES.filter((currency) => currency !== BASE_CURRENCY);

// Frankfurter mirrors the ECB's daily reference rates and needs no API key.
// Next.js persists this fetch for 24h server-side, so every request for a
// given day is served from cache instead of re-hitting the upstream API.
const UPSTREAM = `https://api.frankfurter.dev/v1/latest?base=${BASE_CURRENCY}&symbols=${symbols.join(",")}`;

type FrankfurterResponse = { amount: number; base: string; date: string; rates: Record<string, number> };

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

  const payload = (await upstream.json()) as FrankfurterResponse;
  const rates: ExchangeRates = { [BASE_CURRENCY]: 1, ...payload.rates };

  return NextResponse.json({ base: BASE_CURRENCY, date: payload.date, rates });
}

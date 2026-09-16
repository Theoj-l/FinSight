"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BASE_CURRENCY, type ExchangeRates, type FxContext } from "./currency";
import { PREFERENCES_STORAGE_KEY, restorePreferences, subscribePreferences } from "./preferences";

type FxState = { rates: ExchangeRates | null; date: string | null; error: string | null; loading: boolean };

type CurrencyContextValue = FxContext & Pick<FxState, "date" | "error" | "loading">;

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: BASE_CURRENCY,
  rates: null,
  date: null,
  error: null,
  loading: false,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(
    subscribePreferences,
    () => localStorage.getItem(PREFERENCES_STORAGE_KEY),
    () => null,
  );
  const currency = restorePreferences(raw).currency;
  const [fx, setFx] = useState<FxState>({ rates: null, date: null, error: null, loading: true });

  // The rates never change for the viewer's chosen currency until the next
  // day, and /api/fx is itself cached server-side for 24h, so one fetch per
  // app load is enough.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fx")
      .then((response) => {
        if (!response.ok) throw new Error("fx fetch failed");
        return response.json() as Promise<{ rates: ExchangeRates; date: string }>;
      })
      .then((data) => {
        if (!cancelled) setFx({ rates: data.rates, date: data.date, error: null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setFx({ rates: null, date: null, error: "Exchange rates unavailable right now — showing SGD.", loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, rates: fx.rates, date: fx.date, error: fx.error, loading: fx.loading }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

import { BASE_CURRENCY, isCurrencyCode, type CurrencyCode } from "./currency";

export type Preferences = {
  weeklyBrief: boolean;
  varianceAlerts: boolean;
  reportReady: boolean;
  compactNumbers: boolean;
  currency: CurrencyCode;
};

export const PREFERENCES_STORAGE_KEY = "finsight:preferences:v1";
export const PREFERENCES_EVENT = "finsight-preferences";

export const defaultPreferences: Preferences = {
  weeklyBrief: true,
  varianceAlerts: true,
  reportReady: true,
  compactNumbers: false,
  currency: BASE_CURRENCY,
};

export function restorePreferences(raw: string | null): Preferences {
  if (!raw) return defaultPreferences;
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...defaultPreferences,
      ...parsed,
      currency: isCurrencyCode(parsed.currency) ? parsed.currency : defaultPreferences.currency,
    };
  } catch {
    return defaultPreferences;
  }
}

export function subscribePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PREFERENCES_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PREFERENCES_EVENT, callback);
  };
}

export function savePreferences(preferences: Preferences) {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

"use client";

import { Bell, Check, Globe2, LockKeyhole, Mail, Palette, UserRound } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import {
  PREFERENCES_STORAGE_KEY,
  restorePreferences,
  savePreferences,
  subscribePreferences as subscribe,
  type Preferences,
} from "@/lib/preferences";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${checked ? "bg-brand-navy" : "bg-slate-300"}`}
    >
      <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function SettingsPanel({ email }: { email: string }) {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(PREFERENCES_STORAGE_KEY),
    () => null,
  );
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState(false);
  const preferences = draft ?? restorePreferences(raw);

  function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setSaved(false);
    setDraft({ ...preferences, [key]: value });
  }

  function save() {
    try {
      savePreferences(preferences);
    } catch {
      // Preferences still apply to the active session.
    }
    setDraft(null);
    setSaved(true);
  }

  const rows: Array<{ key: "weeklyBrief" | "varianceAlerts" | "reportReady" | "compactNumbers"; title: string; description: string }> = [
    { key: "weeklyBrief", title: "Weekly performance brief", description: "A concise Monday summary of financial movement and emerging risks." },
    { key: "varianceAlerts", title: "Variance alerts", description: "Get notified when a KPI moves outside your configured attention range." },
    { key: "reportReady", title: "Report status", description: "Receive an alert when a scheduled report is ready for review." },
    { key: "compactNumbers", title: "Compact number format", description: "Show abbreviated values such as $1.2M where space is limited." },
  ];

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm xl:sticky xl:top-24">
        {[
          ["account", "Account", UserRound],
          ["preferences", "Preferences", Palette],
          ["notifications", "Notifications", Bell],
          ["security", "Security", LockKeyhole],
        ].map(([id, label, Icon], index) => (
          <a key={String(id)} href={`#${id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-brand-blue-light hover:text-brand-navy ${index === 0 ? "bg-brand-blue-light text-brand-navy" : "text-slate-600"}`}>
            <Icon aria-hidden="true" className="h-4 w-4" />{label as string}
          </a>
        ))}
      </aside>

      <div className="space-y-6">
        <section id="account" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-blue-light text-brand-navy"><UserRound aria-hidden="true" className="h-5 w-5" /></span><div><h2 className="font-semibold text-brand-navy">Account details</h2><p className="mt-0.5 text-sm text-muted">Your profile information and regional defaults.</p></div></div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Display name<input defaultValue="Finance team" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-normal text-foreground outline-none transition focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/10" /></label>
            <label className="text-sm font-medium text-slate-700">Email address<span className="relative mt-1.5 block"><Mail aria-hidden="true" className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input value={email} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 font-normal text-muted" /></span></label>
            <label className="text-sm font-medium text-slate-700">Currency<select value={preferences.currency} onChange={(event) => setPreference("currency", event.target.value as CurrencyCode)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-normal outline-none focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/10">{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Timezone<span className="relative mt-1.5 block"><Globe2 aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><select defaultValue="Asia/Singapore" className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 font-normal outline-none focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/10"><option value="Asia/Singapore">Singapore (GMT+8)</option><option value="Asia/Kuala_Lumpur">Kuala Lumpur (GMT+8)</option></select></span></label>
          </div>
        </section>

        <section id="preferences" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-blue-light text-brand-navy"><Palette aria-hidden="true" className="h-5 w-5" /></span><div><h2 className="font-semibold text-brand-navy">Preferences</h2><p className="mt-0.5 text-sm text-muted">Choose how FinSight presents information to you.</p></div></div>
          <div className="mt-5 divide-y divide-slate-100">
            {rows.map((row) => (
              <div id={row.key === "weeklyBrief" ? "notifications" : undefined} key={row.key} className="flex items-center justify-between gap-6 py-4 first:pt-1">
                <div><h3 className="text-sm font-medium text-slate-800">{row.title}</h3><p className="mt-0.5 text-sm leading-5 text-muted">{row.description}</p></div>
                <Toggle label={row.title} checked={preferences[row.key]} onChange={(value) => setPreference(row.key, value)} />
              </div>
            ))}
          </div>
        </section>

        <section id="security" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><LockKeyhole aria-hidden="true" className="h-5 w-5" /></span><div><h2 className="font-semibold text-brand-navy">Security</h2><p className="mt-0.5 text-sm text-muted">Your account is protected by Supabase authentication.</p></div></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-center gap-3"><Check aria-hidden="true" className="h-5 w-5 text-emerald-700" /><div><p className="text-sm font-medium text-emerald-900">Account access is active</p><p className="text-xs text-emerald-700">Your session is securely managed and refreshed automatically.</p></div></div></div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3 pb-4">
          {saved && <span role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check aria-hidden="true" className="h-4 w-4" /> Preferences saved</span>}
          <button type="button" onClick={save} className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Save changes</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { FILTER_CONTROL } from "./filter-control";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A reporting-month picker; only months supplied by the reporting feed are selectable. */
export function MonthPicker({ label, value, periods, onChange }: { label: string; value: string; periods: number[]; onChange: (value: string) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const years = [...new Set(periods.map(p => Math.floor(p / 100)))].sort((a,b) => a-b);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0,4)) || years.at(-1) || 0);
  useEffect(() => {
    if (!open) return;
    (panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? panel.current?.querySelector<HTMLButtonElement>('button[data-month]:not(:disabled)'))?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const monthIndex = Number(value.slice(4)) - 1;
  const display = periods.includes(Number(value)) ? `${MONTHS[monthIndex]?.slice(0,3)} ${value.slice(0,4)}` : "Choose month";
  const yearIndex = years.indexOf(year);
  return <div ref={root} className="relative min-w-0" onBlur={event => { if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <label id={`${id}-label`} className="mb-1 block text-sm font-medium text-brand-navy">{label}</label>
    <button ref={trigger} type="button" disabled={!periods.length} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} className={`${FILTER_CONTROL} flex items-center gap-2 text-left`} onClick={() => { if (!open) setYear(years.includes(Number(value.slice(0,4))) ? Number(value.slice(0,4)) : years.at(-1)!); setOpen(!open); }}>
      <CalendarDays size={16} className="shrink-0 text-brand-blue" aria-hidden="true" /><span id={`${id}-value`} className="flex-1 truncate">{display}</span><ChevronDown size={16} className="shrink-0 text-muted" aria-hidden="true" />
    </button>
    {open && <div ref={panel} id={`${id}-panel`} role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className="absolute left-0 z-30 mt-2 w-64 max-w-[calc(100vw-5rem)] rounded-xl border border-brand-navy/15 bg-white p-3 shadow-lg">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" aria-label="Previous year" disabled={yearIndex <= 0} onClick={() => setYear(years[yearIndex-1])} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand-navy hover:bg-brand-blue-light disabled:opacity-30"><ChevronLeft size={16} /></button>
        <label className="flex-1"><span className="sr-only">Reporting year</span><select value={year} onChange={event => setYear(Number(event.target.value))} className="h-9 w-full rounded-lg border border-brand-navy/20 bg-white px-2 text-sm font-semibold text-brand-navy">{years.map(y => <option key={y}>{y}</option>)}</select></label>
        <button type="button" aria-label="Next year" disabled={yearIndex >= years.length-1} onClick={() => setYear(years[yearIndex+1])} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand-navy hover:bg-brand-blue-light disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-1" onKeyDown={event => {
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (current < 0 || !(event.key in moves || event.key === "Home" || event.key === "End")) return;
        event.preventDefault();
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length-1 : Math.max(0, Math.min(buttons.length-1, current+moves[event.key]))]?.focus();
      }}>{MONTHS.map((month,index) => {
        const period = year*100+index+1;
        return <button key={month} data-month type="button" aria-label={`${month} ${year}`} aria-pressed={String(period)===value} disabled={!periods.includes(period)} className={`h-10 rounded-lg text-sm font-medium focus:outline-2 focus:outline-brand-blue disabled:cursor-not-allowed disabled:text-slate-300 ${String(period)===value ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-blue-light disabled:hover:bg-white"}`} onClick={() => { onChange(String(period)); setOpen(false); trigger.current?.focus(); }}>{month.slice(0,3)}</button>;
      })}</div>
      <p className="mt-2 text-[11px] text-muted">Only available reporting months can be selected.</p>
    </div>}
  </div>;
}

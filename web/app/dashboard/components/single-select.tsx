"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FILTER_CONTROL } from "./filter-control";

type Option = { value: string; label: string };

/** App-styled single choice, avoiding the operating system's native popup. */
export function SingleSelect({ label, value, options, onChange, disabled = false, hideLabel = false, className = "" }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function choose(index: number) {
    if (!options[index]) return;
    setOpen(false);
    onChange(options[index].value);
    trigger.current?.focus();
  }
  function openMenu(index = Math.max(0, selected)) {
    setActive(index);
    setOpen(true);
    typeahead.current = { text: "", time: 0 };
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else setActive(current => Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : options.length - 1;
      if (open) setActive(index); else openMenu(index);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else openMenu();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const time = Date.now();
      const text = time - typeahead.current.time < 600 ? typeahead.current.text + event.key.toLowerCase() : event.key.toLowerCase();
      typeahead.current = { text, time };
      const index = options.findIndex(option => option.label.toLowerCase().startsWith(text));
      if (index >= 0) { setActive(index); setOpen(true); }
    }
  }

  return <div ref={root} className={`relative min-w-0 ${className}`} onBlur={event => {
    if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <span id={`${id}-label`} className={hideLabel ? "sr-only" : "mb-1 block text-sm font-medium text-brand-navy"}>{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-option-${active}` : undefined} data-value={value} disabled={disabled || !options.length} onKeyDown={keyDown} onClick={() => open ? setOpen(false) : openMenu()} className={`${FILTER_CONTROL} flex items-center justify-between gap-2 text-left`}>
      <span className="truncate">{options[selected]?.label ?? "Choose an option"}</span>
      <ChevronDown size={16} className={`shrink-0 text-muted ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="absolute left-0 z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-brand-navy/15 bg-white p-2 text-foreground shadow-lg">
      {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={index === selected} data-value={option.value} onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)} className={`flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-2 text-sm ${active === index ? "bg-brand-blue-light" : "hover:bg-brand-blue-light"}`}>
        <span>{option.label}</span>{index === selected ? <Check size={16} className="shrink-0 text-brand-blue" aria-hidden="true" /> : <span className="w-4 shrink-0" />}
      </div>)}
    </div>}
  </div>;
}

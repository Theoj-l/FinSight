"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronDown, FileText, House, Lightbulb, LogOut, Menu, MessageSquare, Settings, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { signOut } from "@/app/auth/actions";

const navigation = [
  { label: "Home", href: "/home", icon: House },
  { label: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { label: "Assistant", href: "/assistant", icon: MessageSquare },
  { label: "Forecast", href: "/forecast", icon: Lightbulb },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

function Brand({ compact = false, onNavigate, onNavigation }: { compact?: boolean; onNavigate?: () => void; onNavigation?: (href: string) => void }) {
  return (
    <Link
      href="/home"
      onClick={onNavigate}
      aria-label="FinSight home"
      className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"
    >
      <Image src="/FinSight_logo.png" alt={compact ? "FinSight" : ""} aria-hidden={compact ? undefined : true} width={88} height={29} priority className="shrink-0" />
      {!compact && (
        <>
          <span className="h-7 w-px shrink-0 bg-brand-navy/10" />
          <Image src="/tsh.png" alt="TSH Group" width={112} height={29} priority className="shrink-0" />
        </>
      )}
    </Link>
  );
}

function ProfileMenu({
  email,
  compact = false,
  onNavigate,
  onNavigation,
}: {
  email: string;
  compact?: boolean;
  onNavigate?: () => void;
  onNavigation?: (href: string) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeProfile(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("mousedown", closeProfile);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", closeProfile);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  return (
    <div ref={profileRef} className="relative">
      <button
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={profileOpen}
        onClick={() => setProfileOpen((open) => !open)}
        className="flex w-full items-center gap-3 rounded-2xl border border-brand-navy/[.08] bg-white/75 py-2.5 pl-[18px] pr-2.5 text-left shadow-[0_10px_30px_-24px_rgba(31,42,121,0.7)] transition hover:border-brand-navy/15 hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-blue"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-navy text-xs font-bold tracking-wide text-white shadow-sm">
          {initials(email)}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-brand-navy">Finance team</span>
              <span className="block truncate text-xs text-muted">{email}</span>
            </span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {profileOpen && (
        <div
          role="menu"
          className={`absolute z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-18px_rgba(31,42,121,0.34)] ${
            compact ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2"
          }`}
        >
          {compact && (
            <div className="mb-1 rounded-xl bg-brand-blue-light/70 px-3 py-2.5">
              <p className="text-xs font-medium text-muted">Signed in as</p>
              <p className="truncate text-sm font-semibold text-brand-navy">{email}</p>
            </div>
          )}
          <Link role="menuitem" href="/settings#account" onClick={() => { onNavigate?.(); onNavigation?.("/settings"); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-brand-blue-light hover:text-brand-navy">
            <UserRound aria-hidden="true" className="h-4 w-4" /> Account settings
          </Link>
          <Link role="menuitem" href="/settings#preferences" onClick={() => { onNavigate?.(); onNavigation?.("/settings"); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-brand-blue-light hover:text-brand-navy">
            <Settings aria-hidden="true" className="h-4 w-4" /> Preferences
          </Link>
          <div className="my-1.5 h-px bg-slate-100" />
          <form action={signOut}>
            <button role="menuitem" type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-red transition hover:bg-red-50">
              <LogOut aria-hidden="true" className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  email,
  compact = false,
  onNavigate,
  onNavigation,
}: {
  email: string;
  compact?: boolean;
  onNavigate?: () => void;
  onNavigation?: (href: string) => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-visible">
      <div className="flex h-20 shrink-0 items-center border-b border-brand-navy/[.07] pl-3 pr-4">
        <Brand compact={compact} onNavigate={onNavigate} onNavigation={onNavigation} />
      </div>

      <nav aria-label="Primary navigation" className="mt-7 px-4">
        <div className="space-y-2">
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => { onNavigate?.(); onNavigation?.(href); }}
                title={compact ? label : undefined}
                aria-label={compact ? label : undefined}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl py-3 pl-[28px] pr-3 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-brand-blue ${
                  active
                    ? "bg-brand-navy text-white shadow-[0_12px_26px_-18px_rgba(31,42,121,0.95)]"
                    : "text-slate-600 hover:bg-white/80 hover:text-brand-navy"
                }`}
              >
                <Icon aria-hidden="true" className={`h-[19px] w-[19px] shrink-0 ${active ? "text-white" : "text-brand-blue transition group-hover:text-brand-red"}`} strokeWidth={1.9} />
                {!compact && label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto px-4 pb-5 pt-8">
        <ProfileMenu email={email} compact={compact} onNavigate={onNavigate} onNavigation={onNavigation} />
      </div>
    </div>
  );
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const pathname = usePathname();
  const expanded = hovered || focused;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setNavigationPending(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }

  function startNavigation(href: string) {
    if (pathname !== href) setNavigationPending(true);
  }

  return (
    <div className="min-h-screen bg-app-surface">
      {navigationPending && <div className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-brand-blue-light" role="status" aria-label="Loading page"><div className="h-full w-1/3 animate-[navigation-progress_1.1s_ease-in-out_infinite] bg-brand-blue" /></div>}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col overflow-visible border-r border-brand-navy/[.08] bg-[linear-gradient(165deg,#f8faff_0%,#edf2fb_55%,#e6eefb_100%)] transition-[width] duration-200 ease-out lg:flex ${
          expanded ? "w-[280px] shadow-2xl" : "w-[108px]"
        }`}
      >
        <SidebarContent email={email} compact={!expanded} onNavigation={startNavigation} />
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:hidden">
        <Brand />
        <button type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-brand-navy shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-brand-navy/35 backdrop-blur-[2px]" />
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="sidebar-enter absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col overflow-visible border-r border-brand-navy/10 bg-[linear-gradient(165deg,#f8faff_0%,#edf2fb_55%,#e6eefb_100%)] shadow-2xl">
            <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 z-10 grid h-9 w-9 place-items-center rounded-xl text-brand-navy transition hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-brand-blue">
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
            <SidebarContent email={email} onNavigate={() => setMobileOpen(false)} onNavigation={startNavigation} />
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ease-out ${expanded ? "lg:pl-[280px]" : "lg:pl-[108px]"}`}>
        <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9 xl:px-10">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChartColumnIncreasing, ChartNoAxesCombined, Sparkles } from "lucide-react";

const features = [
  { title: "Interactive P&L Insights", eyebrow: "Understand performance", body: "Bring revenue, costs and profitability into focus. Explore your financial performance in one clear view, from the group overview to the details that matter.", icon: ChartColumnIncreasing, caption: "See how the numbers connect", tags: ["Revenue", "Expenses", "Profitability"] },
  { title: "Financial Forecasting", eyebrow: "Look ahead", body: "Go beyond the monthly report. Explore financial trends and forward-looking insights to support planning and more informed decisions.", icon: ChartNoAxesCombined, caption: "Make room for what comes next", tags: ["Historical trends", "Future outlook"] },
  { title: "AI-Assisted Analysis", eyebrow: "Ask better questions", body: "Start with a question about your financial data. FinSight helps you explore the numbers in natural language and turn complex information into useful insight.", icon: Sparkles, caption: "A conversation with your financial data", tags: ["Ask", "Explore", "Understand"] },
];

function FeatureIllustration({ index }: { index: number }) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-sm rounded-xl border border-brand-navy/10 bg-white p-6 shadow-sm">
      <div className="mb-7 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-red" /><span className="h-2 w-2 rounded-full bg-brand-blue/30" /><span className="h-2 w-2 rounded-full bg-brand-blue/15" /><span className="ml-auto h-1.5 w-16 rounded-full bg-brand-blue-light" /></div>
      {index === 0 ? (
        <div className="flex h-32 items-end justify-between gap-3 border-b border-brand-navy/10 px-2">
          {[45, 70, 55, 85, 65, 95].map((height, i) => <div key={i} className="flex h-full flex-1 items-end gap-1"><span style={{ height: `${height}%` }} className="flex-1 rounded-t bg-brand-blue" /><span style={{ height: `${height * 0.65}%` }} className="flex-1 rounded-t bg-brand-blue/20" /></div>)}
        </div>
      ) : index === 1 ? (
        <svg viewBox="0 0 280 128" fill="none" className="h-32 w-full"><path d="M0 32H280M0 64H280M0 96H280" stroke="#eef2fb" /><path d="M0 110L40 93L80 98L120 63L160 75" stroke="#4c6fbb" strokeWidth="3" strokeLinejoin="round" /><path d="M160 75L200 46L240 55L280 14" stroke="#4c6fbb" strokeWidth="3" strokeDasharray="6 6" /><path d="M160 75L200 28L240 30L280 0V42L240 80L200 65Z" fill="#4c6fbb" fillOpacity=".1" /><circle cx="160" cy="75" r="4" fill="#e02718" /></svg>
      ) : (
        <div className="flex h-32 flex-col justify-center gap-4"><div className="ml-8 rounded-lg bg-brand-blue-light px-4 py-3 text-xs text-brand-navy">What changed in our performance?</div><div className="flex items-start gap-3"><Sparkles className="h-5 w-5 shrink-0 text-brand-blue" /><div className="flex-1 space-y-2 pt-1"><div className="h-2 rounded-full bg-brand-blue/25" /><div className="h-2 w-5/6 rounded-full bg-brand-blue/15" /><div className="h-2 w-2/3 rounded-full bg-brand-blue/15" /></div></div></div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">{features[index].tags.map(tag => <span key={tag} className="rounded-md bg-app-surface px-2 py-1 text-[10px] font-medium text-muted">{tag}</span>)}</div>
    </div>
  );
}

export function FeatureCarousel() {
  const [active, setActive] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function move(direction: number) { setActive(index => (index + direction + features.length) % features.length); }

  return (
    <section aria-label="Explore FinSight features" aria-roledescription="carousel" className="border-y border-brand-navy/5 bg-app-surface py-12 sm:py-16" onKeyDown={event => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
    }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-brand-blue">Inside FinSight</p><h2 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">From numbers to understanding.</h2></div>
          <div className="flex shrink-0 gap-2">
            <button type="button" aria-label="Previous feature" onClick={() => move(-1)} className="grid h-11 w-11 place-items-center rounded-full border border-brand-navy/15 bg-white text-brand-navy transition-colors hover:bg-brand-blue-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" aria-label="Next feature" onClick={() => move(1)} className="grid h-11 w-11 place-items-center rounded-full border border-brand-navy/15 bg-white text-brand-navy transition-colors hover:bg-brand-blue-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand-navy/10 bg-white shadow-sm" onTouchStart={event => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => {
          const start = touchStart.current;
          if (start) { const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1); }
          touchStart.current = null;
        }}>
          <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${active * 100}%)` }}>
            {features.map(({ title, eyebrow, body, icon: Icon, caption }, index) => (
              <article key={title} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${features.length}: ${title}`} aria-hidden={active !== index} inert={active !== index} className="grid w-full shrink-0 md:grid-cols-[1.1fr_1fr]">
                <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                  <span className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-brand-blue-light text-brand-blue"><Icon aria-hidden="true" className="h-6 w-6" /></span>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{eyebrow}</p>
                  <h3 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">{title}</h3>
                  <p className="mt-4 max-w-md text-sm leading-7 text-muted sm:text-base">{body}</p>
                </div>
                <div className="flex flex-col justify-center gap-5 bg-brand-blue-light/50 px-7 py-8 sm:p-10"><FeatureIllustration index={index} /><p className="text-center text-xs font-medium text-muted">{caption}</p></div>
              </article>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Choose a feature">
          {features.map(({ title }, index) => <button key={title} type="button" aria-label={`Show ${title}`} aria-pressed={active === index} onClick={() => setActive(index)} className={`min-h-11 rounded-full px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue ${active === index ? "bg-brand-navy text-white" : "text-muted hover:bg-brand-blue-light"}`}><span aria-hidden="true" className="mr-2">0{index + 1}</span>{title}</button>)}
        </div>
        <p aria-live="polite" aria-atomic="true" className="sr-only">Feature {active + 1} of {features.length}: {features[active].title}</p>
      </div>
    </section>
  );
}

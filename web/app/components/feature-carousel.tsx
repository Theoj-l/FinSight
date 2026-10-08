"use client";

import styles from "./feature-carousel.module.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, ChartColumnIncreasing, ChartNoAxesCombined, Sparkles } from "lucide-react";

const features = [
  { title: "Interactive P&L Insights", eyebrow: "Understand performance", body: "Bring revenue, costs and profitability into focus. Explore your financial performance in one clear view, from the group overview to the details that matter.", icon: ChartColumnIncreasing, caption: "See how the numbers connect", tags: ["Revenue", "Expenses", "Profitability"] },
  { title: "Financial Forecasting", eyebrow: "Look ahead", body: "Go beyond the monthly report. Explore financial trends and forward-looking insights to support planning and more informed decisions.", icon: ChartNoAxesCombined, caption: "Make room for what comes next", tags: ["Historical trends", "Future outlook"] },
  { title: "AI-Assisted Analysis", eyebrow: "Ask better questions", body: "Start with a question about your financial data. FinSight helps you explore the numbers in natural language and turn complex information into useful insight.", icon: Sparkles, caption: "A conversation with your financial data", tags: ["Ask", "Explore", "Understand"] },
];

function FeatureIllustration({ index }: { index: number }) {
  return (
    <div aria-hidden="true" className={styles.illustration}>
      <div className={styles.windowBar}><span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} /><span className={styles.windowLine} /></div>
      {index === 0 ? (
        <div className={styles.bars}>
          {[45, 70, 55, 85, 65, 95].map((height, i) => <div key={i} className={styles.barPair}><span style={{ height: `${height}%` }} className={styles.bar} /><span style={{ height: `${height * 0.65}%` }} className={`${styles.bar} ${styles.barSecondary}`} /></div>)}
        </div>
      ) : index === 1 ? (
        <svg viewBox="0 0 280 128" fill="none" className={styles.chart}><path d="M0 32H280M0 64H280M0 96H280" stroke="#eef2fb" /><path d="M0 110L40 93L80 98L120 63L160 75" stroke="#4c6fbb" strokeWidth="3" strokeLinejoin="round" /><path d="M160 75L200 46L240 55L280 14" stroke="#4c6fbb" strokeWidth="3" strokeDasharray="6 6" /><path d="M160 75L200 28L240 30L280 0V42L240 80L200 65Z" fill="#4c6fbb" fillOpacity=".1" /><circle cx="160" cy="75" r="4" fill="#e02718" /></svg>
      ) : (
        <div className={styles.conversation}><div className={styles.question}>What changed in our performance?</div><div className={styles.answer}><Sparkles /><div className={styles.answerLines}><div /><div /><div /></div></div></div>
      )}
      <div className={styles.tags}>{features[index].tags.map(tag => <span key={tag} className={styles.tag}>{tag}</span>)}</div>
    </div>
  );
}

export function FeatureCarousel() {
  const [{ active, previous, direction }, setSlide] = useState<{ active: number; previous: number | null; direction: number }>({ active: 0, previous: null, direction: 1 });
  const transitioning = useRef(false);
  const activeRef = useRef(0);
  const busy = previous !== null;

  function selectSlide(index: number, step?: number) {
    if (transitioning.current || activeRef.current === index) return;
    setExplicitPlay(false);
    transitioning.current = true;
    const from = activeRef.current;
    activeRef.current = index;
    setSlide({ active: index, previous: from, direction: step ?? ((index - from + features.length) % features.length === 1 ? 1 : -1) });
  }
  function finishTransition() {
    transitioning.current = false;
    setSlide(current => current.previous === null ? current : { ...current, previous: null });
  }
  // Also settle safely if CSS is delayed or animationend is interrupted.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(finishTransition, 800);
    return () => window.clearTimeout(timer);
  }, [busy, active]);
  const [explicitPlay, setExplicitPlay] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const stopped = paused || (!explicitPlay && (hovered || focused));

  useEffect(() => {
    if (stopped) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    if (sectionRef.current) observer.observe(sectionRef.current);
    const timer = window.setInterval(() => {
      if (visible && !document.hidden && !reducedMotion.matches && !transitioning.current) {
        const from = activeRef.current;
        transitioning.current = true;
        activeRef.current = (from + 1) % features.length;
        setSlide({ active: activeRef.current, previous: from, direction: 1 });
      }
    }, 6000);
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [stopped, active]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function move(step: number) { selectSlide((activeRef.current + step + features.length) % features.length, step); }

  return (
    <section ref={sectionRef} data-rotation={stopped ? "paused" : "playing"} aria-label="Explore FinSight features" aria-roledescription="carousel" className={styles.section}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={event => { setFocused(true); if (!(event.target as HTMLElement).hasAttribute("data-playback")) setExplicitPlay(false); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={event => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
    }}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div><p className={styles.eyebrow}>Inside FinSight</p><h2 className={styles.heading}>From numbers to understanding.</h2></div>
          <div className={styles.controls}>
            <button type="button" data-playback aria-label={paused ? "Resume automatic rotation" : "Pause automatic rotation"} onClick={() => {
              if (paused) {
                // Explicit Play must work even while its button retains focus.
                setExplicitPlay(true);
                setFocused(false);
                setHovered(false);
              }
              setPaused(value => !value);
            }} className={styles.control}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
            <button type="button" aria-label="Previous feature" aria-disabled={busy} onClick={() => move(-1)} className={styles.control}><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
            <button type="button" aria-label="Next feature" aria-disabled={busy} onClick={() => move(1)} className={styles.control}><ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div>
        <div data-testid="carousel-viewport" data-animating={busy} className={styles.viewport}
          style={{ position: "relative", overflow: "hidden", width: "100%", background: "#fff" }} onTouchStart={event => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => {
          const start = touchStart.current;
          if (start) { const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1); }
          touchStart.current = null;
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", isolation: "isolate" }}>
            {features.map(({ title, eyebrow, body, icon: Icon, caption }, index) => (
              <article key={title} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${features.length}: ${title}`}
                aria-hidden={active !== index} inert={active !== index} hidden={index !== active && index !== previous}
                className={`${styles.slide} ${busy ? index === active ? styles.incoming : styles.outgoing : ""}`}
                onAnimationEnd={event => { if (event.target === event.currentTarget && index === active) finishTransition(); }}
                style={{
                  // Critical geometry is kept with the markup: stale/late CSS must
                  // never expose all three features or let slides escape the frame.
                  display: index === active || index === previous ? "grid" : "none",
                  gridArea: "1 / 1", minWidth: 0, width: "100%", background: "#fff",
                  transform: index === active ? "translateX(0)" : `translateX(${-direction * 100}%)`,
                  "--entry-offset": `${direction * 100}%`, "--exit-offset": `${-direction * 100}%`,
                } as CSSProperties}>
                <div className={styles.copy}>
                  <span className={styles.icon}><Icon aria-hidden="true" /></span>
                  <p className={styles.kicker}>{eyebrow}</p>
                  <h3 className={styles.title}>{title}</h3>
                  <p className={styles.body}>{body}</p>
                </div>
                <div className={styles.visual}><FeatureIllustration index={index} /><p className={styles.caption}>{caption}</p></div>
              </article>
            ))}
          </div>
        </div>
        <div className={styles.selectors} aria-label="Choose a feature">
          {features.map(({ title }, index) => <button key={title} type="button" disabled={busy} aria-label={`Show ${title}`} aria-pressed={active === index} onClick={() => selectSlide(index)} className={styles.selector}><span aria-hidden="true" className={styles.number}>0{index + 1}</span>{title}</button>)}
        </div>
        <p aria-live={stopped ? "polite" : "off"} aria-atomic="true" className={styles.srOnly}>Feature {active + 1} of {features.length}: {features[active].title}</p>
      </div>
    </section>
  );
}

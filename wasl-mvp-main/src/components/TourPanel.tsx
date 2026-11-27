import { ArrowLeft, ArrowRight, PartyPopper, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_STEPS, isTourFinished } from '../domain/tour';
import { cn } from '../lib/cn';
import { ROUTES } from '../routes';
import { useDemoStore } from '../state/store';
import { Button, IconButton } from './ui';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGIN = 16;
const CORNERS = [
  { id: 'br', className: 'right-4 bottom-4' },
  { id: 'bl', className: 'bottom-4 left-4' },
  { id: 'tr', className: 'top-4 right-4' },
  { id: 'tl', className: 'top-4 left-4' },
] as const;

/** First corner where a panel of this size does not intersect the highlighted box. */
export function pickCorner(box: Box | undefined, panel: { width: number; height: number }, viewport: { width: number; height: number }) {
  if (!box) return CORNERS[0];
  const free = CORNERS.find((c) => {
    const left = c.id.endsWith('r') ? viewport.width - MARGIN - panel.width : MARGIN;
    const top = c.id.startsWith('b') ? viewport.height - MARGIN - panel.height : MARGIN;
    const pad = 8; // keep clear of the highlight ring too
    return left + panel.width < box.left - pad || box.left + box.width + pad < left || top + panel.height < box.top - pad || box.top + box.height + pad < top;
  });
  return free ?? CORNERS[0];
}

/**
 * Guided demo panel: a non-modal card in a bottom corner plus a ring around the
 * element the step talks about. It never covers that element (it switches corner),
 * and the page stays fully usable while the tour is running.
 */
export default function TourPanel() {
  const store = useDemoStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { tour } = store.state;
  const step = tour.active ? TOUR_STEPS[tour.step] : undefined;
  const finished = isTourFinished(tour);
  const [box, setBox] = useState<Box | undefined>();
  const scrolledFor = useRef<string | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);

  // Go to the step's screen when the step changes (not when the user wanders off on their own).
  useEffect(() => {
    if (!step) return;
    const current = location.pathname + location.search;
    if (current !== step.route) navigate(step.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // Track the highlighted element (it may appear late, move or resize).
  useEffect(() => {
    if (!step) {
      setBox(undefined);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) return setBox(undefined);
      if (scrolledFor.current !== step.id) {
        scrolledFor.current = step.id;
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      const r = el.getBoundingClientRect();
      setBox((b) =>
        b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height
          ? b
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    measure();
    const timer = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  if (!tour.active) return null;

  // Keep the panel off the highlighted element: bottom-right by default, otherwise the first free corner.
  const corner = pickCorner(
    box,
    { width: panelRef.current?.offsetWidth ?? 360, height: panelRef.current?.offsetHeight ?? 240 },
    { width: window.innerWidth, height: window.innerHeight },
  );

  const exit = () => store.tour({ type: 'EXIT' });

  return (
    <>
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-accent ring-offset-2 ring-offset-bg transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
        />
      )}
      <section
        ref={panelRef}
        lang="en"
        dir="ltr"
        role="complementary"
        aria-label="Guided demo"
        className={cn(
          'fixed z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-line-strong bg-surface-2 p-4 font-sans text-sm shadow-pop',
          corner.className,
        )}
      >
        {finished ? (
          <>
            <div className="flex items-center gap-2">
              <PartyPopper size={18} aria-hidden="true" className="text-accent" />
              <h2 className="text-sm font-semibold">That is WASL in 8 steps</h2>
            </div>
            <p className="text-ink-2">Everything you saw runs on synthetic data. Change the simulated day, answer as a patient, or add your own discharge plan.</p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  exit();
                  navigate(ROUTES.careGaps);
                }}
              >
                Explore freely
              </Button>
              <Button size="sm" onClick={() => store.tour({ type: 'START' })}>
                Restart tour
              </Button>
            </div>
          </>
        ) : step ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted tabular-nums" aria-live="polite">
                Guided demo · Step {tour.step + 1} of {TOUR_STEPS.length}
              </span>
              <IconButton label="Exit the guided demo" size="sm" className="ms-auto" icon={<X size={14} aria-hidden="true" />} onClick={exit} />
            </div>
            <h2 className="text-sm font-semibold">{step.title}</h2>
            <p className="leading-relaxed text-ink-2">{step.body}</p>
            {step.tryIt && <p className="text-xs text-muted">{step.tryIt}</p>}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={tour.step === 0} icon={<ArrowLeft size={14} aria-hidden="true" />} onClick={() => store.tour({ type: 'BACK' })}>
                Back
              </Button>
              <Button size="sm" variant="primary" className="ms-auto" onClick={() => store.tour({ type: 'NEXT' })}>
                {tour.step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

/**
 * Placeholder for the simulated-day clock (days since discharge).
 * Static in Phase 1; wired to src/state in a later phase.
 */
export default function SimulatedDayControl() {
  const day = 0;
  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-line bg-panel px-1 py-0.5 text-xs"
      title="Simulated clock — not real time. Interactive in a later phase."
    >
      <button type="button" disabled className="rounded px-2 py-1 text-muted opacity-50" aria-label="Previous simulated day">
        ‹
      </button>
      <span className="whitespace-nowrap">
        <span className="text-muted">Simulated day </span>
        <span className="font-semibold text-accent">{day}</span>
      </span>
      <button type="button" disabled className="rounded px-2 py-1 text-muted opacity-50" aria-label="Next simulated day">
        ›
      </button>
    </div>
  );
}

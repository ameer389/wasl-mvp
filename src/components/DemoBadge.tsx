/** Rule 1 (CLAUDE.md): every screen shows that the data is synthetic. Rendered in the shared header. */
export default function DemoBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-medium/40 bg-medium/10 px-3 py-1 text-xs font-semibold whitespace-nowrap text-medium"
      title="All patients, plans and feeds in this app are synthetic. No real patient data."
    >
      <span className="h-1.5 w-1.5 rounded-full bg-medium" aria-hidden="true" />
      DEMO · synthetic data
    </span>
  );
}

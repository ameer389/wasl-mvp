import { FlaskConical } from 'lucide-react';
import { EmptyState, StatCard } from '../../components/ui';

export default function Validation() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Validation metrics" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Synthetic scenarios" value="—" hint="Discharge plans replayed" simulated />
        <StatCard label="Labelled utterances" value="—" hint="Saudi-dialect check-in answers" simulated />
        <StatCard label="Gap detection recall" value="—" hint="On synthetic scenarios" simulated />
        <StatCard label="Parser accuracy" value="—" hint="On labelled utterances" simulated />
      </section>
      <EmptyState
        icon={FlaskConical}
        title="No validation run yet"
        text="Validation replays synthetic discharge scenarios and labelled Saudi-dialect utterances through the engine. Every number on this page is simulated — it is not clinical validation."
      />
    </div>
  );
}

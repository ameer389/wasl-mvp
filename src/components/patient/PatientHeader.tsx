import { DEMO_PATIENT } from '../../data/demoPatient';
import DemoBadge from '../DemoBadge';
import { WaslMark } from '../WaslMark';

export default function PatientHeader() {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4">
      <div
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-lg font-semibold text-ink-2"
      >
        م
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">هلا {DEMO_PATIENT.displayNameAr}</p>
        <DemoBadge variant="ar" />
      </div>
      <div className="flex shrink-0 items-center gap-2" aria-label="وصل">
        <span className="text-lg font-bold">وصل</span>
        <WaslMark size={28} />
      </div>
    </header>
  );
}

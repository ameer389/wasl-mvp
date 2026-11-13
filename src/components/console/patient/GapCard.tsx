import { CheckCircle2, ClipboardCheck, Phone } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { claimOptionsFor, confirmationHint } from '../../../domain/claimOptions';
import { GAP_TYPE_LABEL, ROUTE_LABEL, gapSubject, readableReason } from '../../../domain/labels';
import type { CareTask, Evidence, EvidenceClaim, Gap, Patient } from '../../../domain/types';
import { cn } from '../../../lib/cn';
import { useDemoStore } from '../../../state/store';
import { Badge, Button, Card, Field, SegmentedControl, textareaClasses, useToast } from '../../ui';
import { RiskBadge } from '../badges';
import { EvidenceChip } from '../evidence';

type Mode = 'idle' | 'call' | 'confirm' | 'resolve';

interface GapCardProps {
  gap: Gap;
  patient: Patient;
  tasks: readonly CareTask[];
  evidence: readonly Evidence[];
  inReview: boolean;
  highlighted: boolean;
  daysOpen: number;
}

export const GapCard = forwardRef<HTMLDivElement, GapCardProps>(function GapCard(
  { gap, patient, tasks, evidence, inReview, highlighted, daysOpen },
  ref,
) {
  const store = useDemoStore();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('idle');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<'reached' | 'no_answer'>('reached');
  const task = gap.taskId ? tasks.find((t) => t.id === gap.taskId) : undefined;
  const options = task ? claimOptionsFor(task.type) : [];
  const [claim, setClaim] = useState<EvidenceClaim | ''>('');
  const items = gap.evidenceIds.map((id) => evidence.find((e) => e.id === id)).filter((e): e is Evidence => !!e);
  const hint = task ? confirmationHint(task.type) : 'Medication-level gap: check with the patient, then mark it resolved with a note.';

  const close = () => {
    setMode('idle');
    setNote('');
    setClaim('');
  };

  const saveCall = () => {
    const text = `${outcome === 'reached' ? 'Reached' : 'No answer'}${note.trim() ? `: ${note.trim()}` : ''}`;
    store.resolveGap(gap.id, 'CALLED', text);
    toast.show({ message: 'Call logged. The gap stays open and shows "In review".' });
    close();
  };

  const saveConfirm = () => {
    if (!task || !claim) return;
    store.confirmTask(patient.id, task.id, claim, note);
    toast.show({ message: 'Recorded as confirmed by the care team. WASL re-evaluated this task.' });
    close();
  };

  const saveResolve = () => {
    if (!note.trim()) return;
    const snapshot = store.state;
    store.resolveGap(gap.id, 'RESOLVED', note.trim());
    toast.show({ message: 'Gap marked resolved.', action: { label: 'Undo', onClick: () => store.replace(snapshot) } });
    close();
  };

  return (
    <Card
      ref={ref}
      padding="lg"
      className={cn(
        'flex flex-col gap-4 transition-shadow duration-300',
        highlighted && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <RiskBadge risk={gap.risk} />
        <h3 className="text-sm font-semibold">{GAP_TYPE_LABEL[gap.type]}</h3>
        <span className="text-sm text-muted">· {gapSubject(gap, tasks, patient)}</span>
        {inReview && <Badge variant="neutral">In review</Badge>}
        <span className="ms-auto text-xs text-faint tabular-nums">
          {ROUTE_LABEL[gap.route]} · open {daysOpen}d · priority {gap.priority.toFixed(1)}
        </span>
      </header>

      <div data-tour="gap-reasons" className="flex flex-col gap-3 rounded-lg">
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted">Why WASL flagged this</h4>
          <ul className="list-disc space-y-1 ps-4 text-sm text-ink-2 marker:text-faint">
            {gap.reasons.map((r) => (
              <li key={r} title={r}>
                {readableReason(r)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length > 0 ? items.map((e) => <EvidenceChip key={e.id} evidence={e} />) : <span className="text-xs text-faint">No evidence received for this task.</span>}
        </div>
      </div>

      {mode === 'idle' && (
        <div data-tour="gap-actions" className="flex flex-wrap gap-2 rounded-lg border-t border-line pt-4">
          <Button size="sm" icon={<Phone size={14} aria-hidden="true" />} onClick={() => setMode('call')}>
            Log call
          </Button>
          {options.length > 0 && (
            <Button size="sm" icon={<ClipboardCheck size={14} aria-hidden="true" />} onClick={() => setMode('confirm')}>
              Confirm what happened
            </Button>
          )}
          <Button size="sm" icon={<CheckCircle2 size={14} aria-hidden="true" />} onClick={() => setMode('resolve')}>
            Mark resolved
          </Button>
          {options.length === 0 && hint && <p className="w-full text-xs text-faint">{hint}</p>}
        </div>
      )}

      {mode !== 'idle' && (
        <form
          className="flex flex-col gap-3 rounded-lg border border-line bg-bg/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'call') saveCall();
            if (mode === 'confirm') saveConfirm();
            if (mode === 'resolve') saveResolve();
          }}
        >
          {mode === 'call' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Outcome</span>
              <SegmentedControl
                label="Call outcome"
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: 'reached', label: 'Reached' },
                  { value: 'no_answer', label: 'No answer' },
                ]}
              />
            </div>
          )}
          {mode === 'confirm' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">What did you verify with the patient?</span>
              <SegmentedControl
                label="Verified outcome"
                value={claim}
                onChange={(v) => setClaim(v)}
                options={options.map((o) => ({ value: o.claim, label: o.label }))}
              />
            </div>
          )}
          <Field
            label={mode === 'resolve' ? 'Resolution note (required)' : 'Note (optional)'}
            hint={mode === 'confirm' ? 'Recorded as clinician evidence (confidence 100%, confirmed by a person).' : undefined}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={textareaClasses}
              required={mode === 'resolve'}
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={(mode === 'resolve' && !note.trim()) || (mode === 'confirm' && !claim)}
            >
              {mode === 'call' ? 'Save call' : mode === 'confirm' ? 'Record confirmation' : 'Mark resolved'}
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
});

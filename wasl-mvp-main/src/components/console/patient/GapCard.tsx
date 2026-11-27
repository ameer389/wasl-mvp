import { CheckCircle2, ClipboardCheck, Phone } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { claimOptionsFor, confirmationHint } from '../../../domain/claimOptions';
import { isOpenMedicationReport } from '../../../domain/medicationEvidence';
import { GAP_TYPE_LABEL, ROUTE_LABEL, gapSubject, readableReason } from '../../../domain/labels';
import type { AdministrativeReason, CareTask, Evidence, EvidenceClaim, Gap, Patient } from '../../../domain/types';
import type { GapLifecycle } from '../../../domain/gapLifecycle';
import { cn } from '../../../lib/cn';
import { useDemoStore } from '../../../state/store';
import { Badge, Button, Card, Field, SegmentedControl, selectClasses, textareaClasses, useToast } from '../../ui';
import { RiskBadge } from '../badges';
import { DrugPicker } from '../DrugPicker';
import { EvidenceChip } from '../evidence';

type Mode = 'idle' | 'call' | 'confirm' | 'resolve' | 'review' | 'intervene';
type ReviewOutcome = '' | 'identify' | 'correct' | 'current';

interface GapCardProps {
  gap: Gap;
  patient: Patient;
  tasks: readonly CareTask[];
  evidence: readonly Evidence[];
  lifecycle?: GapLifecycle;
  highlighted: boolean;
  daysOpen: number;
}

export const GapCard = forwardRef<HTMLDivElement, GapCardProps>(function GapCard(
  { gap, patient, tasks, evidence, lifecycle, highlighted, daysOpen },
  ref,
) {
  const store = useDemoStore();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('idle');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<'reached' | 'no_answer'>('reached');
  const [reason, setReason] = useState<AdministrativeReason | ''>('');
  const task = gap.taskId ? tasks.find((t) => t.id === gap.taskId) : undefined;
  const options = task ? claimOptionsFor(task.type) : [];
  const [claim, setClaim] = useState<EvidenceClaim | ''>('');
  const items = gap.evidenceIds.map((id) => evidence.find((e) => e.id === id)).filter((e): e is Evidence => !!e);
  const reports = items.filter(isOpenMedicationReport);
  const priority = gap.priorityFactors;
  const [reportId, setReportId] = useState('');
  const [review, setReview] = useState<ReviewOutcome>('');
  const [identifiedDrug, setIdentifiedDrug] = useState('');
  const report = reports.find((e) => e.id === reportId) ?? reports[0];
  const reviewDrug = report?.drugId ?? (identifiedDrug || undefined);
  const canSaveReview = !!report && !!review && (review === 'correct' || (review === 'current' ? !!report.drugId : !!reviewDrug));
  const hint = task ? confirmationHint(task.type) : undefined;

  const close = () => {
    setMode('idle');
    setNote('');
    setClaim('');
    setReportId('');
    setReview('');
    setIdentifiedDrug('');
    setReason('');
    setOutcome('reached');
  };

  const saveCall = () => {
    store.resolveGap(gap.id, 'CALLED', { contactOutcome: outcome, note });
    toast.show({ message: 'Call logged. The gap stays open and shows "In review".' });
    close();
  };

  const saveConfirm = () => {
    if (!task || !claim) return;
    store.confirmTask(patient.id, task.id, claim, note, gap.id);
    toast.show({ message: 'Recorded as confirmed by the care team. WASL re-evaluated this task.' });
    close();
  };

  const saveResolve = () => {
    if (!note.trim() || !reason) return;
    const seq = store.resolveGap(gap.id, 'RESOLVED', { note, disposition: 'ADMINISTRATIVE', reasonCode: reason });
    toast.show({ message: 'Administrative disposition recorded.', action: { label: 'Undo', onClick: () => store.undoResolution(gap.id, seq) } });
    close();
  };

  const saveReview = () => {
    if (!report || !canSaveReview) return;
    store.reviewMedicationReport(report, review === 'identify' ? 'TAKING_UNLISTED' : 'STOPPED', reviewDrug, review !== 'current', note, gap.id);
    toast.show({ message: 'Medication evidence updated.' });
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
        {lifecycle?.reopened && <Badge variant="neutral">Reopened</Badge>}
        {lifecycle?.review && <Badge variant="neutral">In review</Badge>}
        {lifecycle?.intervention && <Badge variant="neutral">Awaiting evidence</Badge>}
        <span className="ms-auto text-xs text-faint tabular-nums">
          {ROUTE_LABEL[gap.route]} · open {daysOpen}d · priority {gap.priority.toFixed(1)}
        </span>
      </header>

      <div data-tour="gap-reasons" className="flex flex-col gap-3 rounded-lg">
        {lifecycle?.intervention?.note && <p className="text-sm text-muted">{lifecycle.intervention.note}</p>}
        {priority && (
          <p className="text-xs text-muted tabular-nums">
            Severity {priority.severity} · risk ×{priority.riskMultiplier} · overdue {priority.daysOverdue}d
            {priority.uncertaintyBonus > 0 && ` · uncertainty +${priority.uncertaintyBonus}`}
          </p>
        )}
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
          {reports.length > 0 && !task && (
            <Button size="sm" icon={<ClipboardCheck size={14} aria-hidden="true" />} onClick={() => setMode('review')}>
              Review medication report
            </Button>
          )}
          <Button size="sm" onClick={() => setMode('intervene')}>Document intervention</Button>
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
            if (mode === 'review') saveReview();
            if (mode === 'intervene' && note.trim()) {
              store.resolveGap(gap.id, 'INTERVENED', { note });
              toast.show({ message: 'Intervention documented. Awaiting eligible evidence.' });
              close();
            }
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
          {mode === 'review' && report && (
            <>
              {reports.length > 1 && (
                <Field label="Report to review">
                  <select className={selectClasses} value={report.id} onChange={(e) => { setReportId(e.target.value); setIdentifiedDrug(''); }}>
                    {reports.map((e) => <option key={e.id} value={e.id}>{e.detail ?? e.drugId ?? e.id}</option>)}
                  </select>
                </Field>
              )}
              <span className="text-xs font-medium text-muted">What did you establish with the patient?</span>
              <SegmentedControl<ReviewOutcome>
                label="Medication review outcome"
                value={review}
                onChange={setReview}
                options={[
                  { value: 'identify', label: 'Confirm reported use' },
                  { value: 'correct', label: 'Correct earlier report' },
                  ...(report.drugId ? [{ value: 'current' as const, label: 'No current use' }] : []),
                ]}
              />
              {!report.drugId && review === 'identify' && (
                <Field label="Confirmed medicine"><DrugPicker value={identifiedDrug} onChange={setIdentifiedDrug} /></Field>
              )}
            </>
          )}
          {mode === 'resolve' && (
            <Field label="Administrative reason" hint="The condition and its verification remain visible.">
              <select className={selectClasses} value={reason} onChange={(e) => setReason(e.target.value as AdministrativeReason | '')}>
                <option value="">Choose a reason</option>
                <option value="FOLLOW_UP_ARRANGED">Follow-up arranged</option>
                <option value="HANDED_OFF">Handed off for review</option>
                <option value="OTHER_DOCUMENTED">Other documented reason</option>
              </select>
            </Field>
          )}
          <Field
            label={mode === 'resolve' ? 'Resolution note (required)' : mode === 'intervene' ? 'Intervention note (required)' : 'Note (optional)'}
            hint={mode === 'confirm' ? 'Recorded as clinician evidence (confidence 100%, confirmed by a person).' : undefined}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={textareaClasses}
              required={mode === 'resolve' || mode === 'intervene'}
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={(mode === 'resolve' && (!note.trim() || !reason)) || (mode === 'intervene' && !note.trim()) ||
                (mode === 'confirm' && !claim) || (mode === 'review' && !canSaveReview)}
            >
              {mode === 'call' ? 'Save call' : mode === 'confirm' ? 'Record confirmation' : mode === 'review' ? 'Record medication review'
                : mode === 'intervene' ? 'Save intervention' : 'Mark resolved'}
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

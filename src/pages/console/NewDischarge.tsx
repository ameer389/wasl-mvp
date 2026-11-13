import { FlaskConical, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RiskBadge } from '../../components/console/badges';
import { DrugPicker } from '../../components/console/DrugPicker';
import { Badge, Button, Card, Field, IconButton, inputClasses, selectClasses, textareaClasses, useToast } from '../../components/ui';
import { buildCareGraph } from '../../domain/careGraph';
import { getDrug } from '../../domain/drugs';
import { LANES, laneOf } from '../../domain/graphLayout';
import { shortTaskLabel } from '../../domain/labels';
import {
  emptyFollowUp,
  emptyForm,
  emptyLab,
  emptyMed,
  formToPatient,
  nextPatientId,
  sampleForm,
  validatePlanForm,
  type FollowUpRow,
  type LabRow,
  type MedRow,
  type PlanForm,
} from '../../domain/planForm';
import type { MedAction } from '../../domain/types';
import { cn } from '../../lib/cn';
import { clinicianPatientPath } from '../../routes';
import { useDemoStore } from '../../state/store';

const ACTIONS: MedAction[] = ['NEW', 'CONTINUE', 'CHANGED', 'STOP'];
const ACTION_LABEL: Record<MedAction, string> = { NEW: 'New', CONTINUE: 'Continue', CHANGED: 'Dose changed', STOP: 'Stop' };

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function NewDischarge() {
  const store = useDemoStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // ?sample=1 opens with the fictional sample case (used by the guided demo).
  const [form, setForm] = useState<PlanForm>(() => (params.get('sample') ? sampleForm() : emptyForm()));
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => validatePlanForm(form), [form]);
  const err = (path: string) => (submitted ? errors[path] : undefined);
  const preview = useMemo(() => {
    const patient = formToPatient(form, 'preview', 0, true);
    return { patient, tasks: buildCareGraph(patient) };
  }, [form]);

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setRow = <K extends 'meds' | 'labs' | 'followUps'>(key: K, index: number, patch: Partial<PlanForm[K][number]>) =>
    setForm((f) => ({ ...f, [key]: f[key].map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  const removeRow = (key: 'meds' | 'labs' | 'followUps', index: number) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== index) }));

  const save = () => {
    setSubmitted(true);
    const count = Object.keys(errors).length;
    if (count > 0) {
      toast.show({ message: `Check ${count} highlighted ${count === 1 ? 'field' : 'fields'} before saving.` });
      return;
    }
    const id = nextPatientId(store.state.patients);
    // The patient's Day 0 is today's simulated day; their timeline starts now.
    const patient = formToPatient(form, id, store.state.simulatedDay);
    store.addPatient(patient);
    toast.show({
      message: `${patient.nameEn} added — ${buildCareGraph(patient).length} tasks created.`,
      action: { label: 'Open patient', onClick: () => navigate(clinicianPatientPath(id)) },
    });
    setForm(emptyForm());
    setSubmitted(false);
  };

  const medRow = (m: MedRow, i: number) => (
    <div key={m.key} className="grid grid-cols-12 gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <Field label="Medicine" error={err(`meds.${i}.drugId`)} className="col-span-12 md:col-span-5">
        <DrugPicker value={m.drugId} onChange={(drugId) => setRow('meds', i, { drugId })} />
      </Field>
      <Field label="Action" className="col-span-6 md:col-span-3">
        <select value={m.action} onChange={(e) => setRow('meds', i, { action: e.target.value as MedAction })} className={selectClasses}>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dose (as written)" error={err(`meds.${i}.dose`)} className="col-span-6 md:col-span-3">
        <input value={m.dose} onChange={(e) => setRow('meds', i, { dose: e.target.value })} className={inputClasses} />
      </Field>
      <div className="col-span-12 flex items-end justify-end md:col-span-1">
        <IconButton label={`Remove medicine ${i + 1}`} icon={<Trash2 size={15} aria-hidden="true" />} onClick={() => removeRow('meds', i)} />
      </div>
      <Field label="Frequency" error={err(`meds.${i}.frequency`)} className="col-span-6 md:col-span-4">
        <input value={m.frequency} onChange={(e) => setRow('meds', i, { frequency: e.target.value })} className={inputClasses} />
      </Field>
      <Field label="Prescriber" error={err(`meds.${i}.prescriber`)} className="col-span-6 md:col-span-4">
        <input value={m.prescriber} onChange={(e) => setRow('meds', i, { prescriber: e.target.value })} className={inputClasses} />
      </Field>
      {m.action === 'CHANGED' && (
        <Field label="Previous dose" error={err(`meds.${i}.previousDose`)} className="col-span-12 md:col-span-4">
          <input value={m.previousDose} onChange={(e) => setRow('meds', i, { previousDose: e.target.value })} className={inputClasses} />
        </Field>
      )}
      {getDrug(m.drugId)?.highAlert && (
        <p className="col-span-12 flex items-center gap-2 text-xs text-muted">
          <Badge variant="high">High-alert</Badge> Tasks for this medicine are high risk and route to a clinician immediately when they fail.
        </p>
      )}
    </div>
  );

  const labRow = (l: LabRow, i: number) => (
    <div key={l.key} className="grid grid-cols-12 gap-3">
      <Field label="Test" error={err(`labs.${i}.test`)} className="col-span-12 md:col-span-5">
        <input value={l.test} onChange={(e) => setRow('labs', i, { test: e.target.value })} className={inputClasses} />
      </Field>
      <Field label="Due day" error={err(`labs.${i}.dueDay`)} className="col-span-4 md:col-span-2">
        <input inputMode="numeric" value={l.dueDay} onChange={(e) => setRow('labs', i, { dueDay: e.target.value })} className={inputClasses} />
      </Field>
      <Field label="Linked medicine (optional)" className="col-span-8 md:col-span-4">
        <select value={l.linkedDrugId} onChange={(e) => setRow('labs', i, { linkedDrugId: e.target.value })} className={selectClasses}>
          <option value="">None</option>
          {form.meds
            .filter((m) => getDrug(m.drugId))
            .map((m) => (
              <option key={m.key} value={m.drugId}>
                {getDrug(m.drugId)?.generic}
              </option>
            ))}
        </select>
      </Field>
      <div className="col-span-12 flex items-end justify-end md:col-span-1">
        <IconButton label={`Remove lab ${i + 1}`} icon={<Trash2 size={15} aria-hidden="true" />} onClick={() => removeRow('labs', i)} />
      </div>
    </div>
  );

  const followUpRow = (fu: FollowUpRow, i: number) => (
    <div key={fu.key} className="grid grid-cols-12 gap-3">
      <Field label="Clinic" error={err(`followUps.${i}.clinic`)} className="col-span-12 md:col-span-5">
        <input value={fu.clinic} onChange={(e) => setRow('followUps', i, { clinic: e.target.value })} className={inputClasses} />
      </Field>
      <Field label="Book by day" error={err(`followUps.${i}.bookByDay`)} className="col-span-6 md:col-span-3">
        <input inputMode="numeric" value={fu.bookByDay} onChange={(e) => setRow('followUps', i, { bookByDay: e.target.value })} className={inputClasses} />
      </Field>
      <Field label="Visit day" error={err(`followUps.${i}.visitDay`)} className="col-span-6 md:col-span-3">
        <input inputMode="numeric" value={fu.visitDay} onChange={(e) => setRow('followUps', i, { visitDay: e.target.value })} className={inputClasses} />
      </Field>
      <div className="col-span-12 flex items-end justify-end md:col-span-1">
        <IconButton label={`Remove follow-up ${i + 1}`} icon={<Trash2 size={15} aria-hidden="true" />} onClick={() => removeRow('followUps', i)} />
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form
        noValidate
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted">Synthetic data only. Enter the plan exactly as written in the discharge summary.</p>
          <Button className="ms-auto" size="sm" icon={<Wand2 size={14} aria-hidden="true" />} onClick={() => setForm(sampleForm())}>
            Load sample case
          </Button>
        </div>

        <Section title="Patient">
          <div className="grid grid-cols-12 gap-3">
            <Field label="Name (English)" error={err('nameEn')} className="col-span-12 md:col-span-4">
              <input value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Name (Arabic)" error={err('nameAr')} className="col-span-12 md:col-span-4">
              <input dir="rtl" lang="ar" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} className={cn(inputClasses, 'font-arabic')} />
            </Field>
            <Field label="Age" error={err('age')} className="col-span-6 md:col-span-2">
              <input inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Sex" error={err('sex')} className="col-span-6 md:col-span-2">
              <select value={form.sex} onChange={(e) => set('sex', e.target.value as PlanForm['sex'])} className={selectClasses}>
                <option value="">—</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Discharge">
          <div className="grid grid-cols-12 gap-3">
            <Field label="Hospital" error={err('hospital')} className="col-span-12 md:col-span-6">
              <input value={form.hospital} onChange={(e) => set('hospital', e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Diagnosis label" error={err('diagnosisLabel')} className="col-span-12 md:col-span-6">
              <input value={form.diagnosisLabel} onChange={(e) => set('diagnosisLabel', e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Transferred from (optional)" error={err('transferFrom')} className="col-span-12 md:col-span-6">
              <input value={form.transferFrom} onChange={(e) => set('transferFrom', e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Transferred to (optional)" error={err('transferTo')} className="col-span-12 md:col-span-6">
              <input value={form.transferTo} onChange={(e) => set('transferTo', e.target.value)} className={inputClasses} />
            </Field>
          </div>
        </Section>

        <Section
          title="Medications"
          description="Doses are copied from the plan as written. WASL never suggests or changes doses."
          action={
            <Button size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => set('meds', [...form.meds, emptyMed()])}>
              Add medicine
            </Button>
          }
        >
          {form.meds.length === 0 ? <p className="text-sm text-muted">No medicines.</p> : form.meds.map(medRow)}
        </Section>

        <Section
          title="Labs"
          action={
            <Button size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => set('labs', [...form.labs, emptyLab()])}>
              Add lab
            </Button>
          }
        >
          {form.labs.length === 0 ? <p className="text-sm text-muted">No labs.</p> : form.labs.map(labRow)}
        </Section>

        <Section
          title="Follow-ups"
          action={
            <Button size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => set('followUps', [...form.followUps, emptyFollowUp()])}>
              Add follow-up
            </Button>
          }
        >
          {form.followUps.length === 0 ? <p className="text-sm text-muted">No follow-ups.</p> : form.followUps.map(followUpRow)}
        </Section>

        <Section title="Wound care">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.woundEnabled} onChange={(e) => set('woundEnabled', e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
            The patient has a wound to check at home
          </label>
          {form.woundEnabled && (
            <div className="grid grid-cols-12 gap-3">
              <Field label="Instructions" error={err('woundInstructions')} className="col-span-12 md:col-span-9">
                <textarea value={form.woundInstructions} onChange={(e) => set('woundInstructions', e.target.value)} rows={2} className={textareaClasses} />
              </Field>
              <Field label="Check day" error={err('woundCheckDay')} className="col-span-12 md:col-span-3">
                <input inputMode="numeric" value={form.woundCheckDay} onChange={(e) => set('woundCheckDay', e.target.value)} className={inputClasses} />
              </Field>
            </div>
          )}
        </Section>

        {submitted && errors.plan && <p className="text-sm text-high">{errors.plan}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" icon={<Save size={14} aria-hidden="true" />}>
            Save discharge plan
          </Button>
          <Button variant="ghost" onClick={() => (setForm(emptyForm()), setSubmitted(false))}>
            Clear
          </Button>
          <span className="text-xs text-faint">Day 0 for this patient = simulated Day {store.state.simulatedDay}.</span>
        </div>
      </form>

      <aside aria-label="Care graph preview" className="min-w-0">
        <Card className="flex flex-col gap-3 xl:sticky xl:top-0" data-tour="task-preview">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Executable tasks</h2>
            <span className="ms-auto text-xs text-muted tabular-nums">{preview.tasks.length} tasks</span>
          </div>
          <p className="text-xs text-muted">Live preview of the care graph WASL will follow for this plan.</p>
          {preview.tasks.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-6 text-sm text-muted">
              <FlaskConical size={16} aria-hidden="true" />
              Add a medicine, lab or follow-up to see its tasks.
            </p>
          ) : (
            LANES.map((lane) => {
              const tasks = preview.tasks.filter((t) => laneOf(t.type) === lane);
              if (tasks.length === 0) return null;
              return (
                <Fragment key={lane}>
                  <h3 className="mt-1 text-xs font-medium text-faint">{lane}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-bg/40 px-2.5 py-1.5 text-sm">
                        <span className="w-10 shrink-0 text-xs text-faint tabular-nums">D{t.deadlineDay}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-2">{shortTaskLabel(t, preview.patient)}</span>
                        <RiskBadge risk={t.risk} />
                      </li>
                    ))}
                  </ul>
                </Fragment>
              );
            })
          )}
          <p className="border-t border-line pt-3 text-xs text-faint">Doses are copied from the plan as written. WASL never suggests or changes doses.</p>
        </Card>
      </aside>
    </div>
  );
}

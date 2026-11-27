/**
 * The one demo store: React context + useReducer, persisted to localStorage.
 * Domain logic lives in src/domain; this file only wires it to React.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { targetsPatient } from '../domain/auditTrail';
import { claimOptionsFor } from '../domain/claimOptions';
import type { QuestionPlan } from '../domain/questionPlanner';
import type { TourEvent } from '../domain/tour';
import type { AdministrativeReason, AuditEntry, CareTask, Day, Disposition, Evidence, EvidenceClaim, OpenMedsOutcome, Patient } from '../domain/types';
import { observeLifecycle } from './lifecycle';
import type { DemoState } from './demoState';
import { isDemoState, loadState, saveState } from './persistence';
import { demoReducer } from './reducer';
import { buildAllTasks, dayFor, evaluateAll, planAll, type AllEvaluation } from './selectors';

/** Who the demo user is when acting in the care team console. */
export const DEMO_CLINICIAN = 'Care coordinator (demo)';

interface DemoStore {
  state: DemoState;
  tasksByPatient: Record<string, CareTask[]>;
  /** Evaluation at the current simulated day (each patient on their own timeline). */
  evaluation: AllEvaluation;
  /** Today's adaptive vs baseline questions, per discharged patient. */
  questionPlans: Record<string, QuestionPlan>;
  tasksFor: (patientId: string) => CareTask[];
  /** A patient's own day since discharge at the current simulated day. */
  patientToday: (patientId: string) => Day;
  setDay: (day: Day) => void;
  addEvidence: (evidence: Evidence, actor?: string) => void;
  /** Clinician records what they verified with the patient (confidence 1, confirmed by a human). */
  confirmTask: (patientId: string, taskId: string, claim: EvidenceClaim, note?: string, gapId?: string) => void;
  reviewMedicationReport: (report: Evidence, claim: 'STOPPED' | 'TAKING_UNLISTED', drugId: string | undefined, historical: boolean, note?: string, gapId?: string) => void;
  resolveGap: (gapId: string, action: 'CALLED' | 'INTERVENED' | 'RESOLVED', details: {
    note?: string; disposition?: Disposition; reasonCode?: AdministrativeReason; contactOutcome?: 'reached' | 'no_answer';
  }) => number;
  undoResolution: (gapId: string, resolutionSeq: number) => void;
  addPatient: (patient: Patient, by?: string) => void;
  /** Save one check-in answer (evidence + one audit entry). */
  recordPresentation: (patientId: string, target: string, actor: string) => void;
  recordAnswer: (patientId: string, evidence: Evidence[], meta: { actor: string; target: string; note: string; openMedsOutcome?: OpenMedsOutcome; presentation?: AuditEntry }) => string;
  completeCheckin: (patientId: string, actor: string, note: string) => void;
  tour: (event: TourEvent) => void;
  reset: () => void;
  replace: (state: DemoState) => void;
}

const StoreContext = createContext<DemoStore | null>(null);

const now = () => new Date().toISOString();

export function DemoStoreProvider({ children, initialState }: { children: ReactNode; initialState?: DemoState }) {
  const [state, dispatch] = useReducer(demoReducer, initialState, (init) => isDemoState(init) ? init : loadState());

  useEffect(() => saveState(state), [state]);

  const tasksByPatient = useMemo(() => buildAllTasks(state.patients), [state.patients]);
  const evaluation = useMemo(
    () => evaluateAll(state.patients, tasksByPatient, state.evidence, state.resolutions, state.simulatedDay, state.audit),
    [state.patients, tasksByPatient, state.evidence, state.resolutions, state.simulatedDay, state.audit],
  );
  const questionPlans = useMemo(
    () => planAll(state.patients, tasksByPatient, state.evidence, evaluation, state.simulatedDay, state.audit),
    [state.patients, tasksByPatient, state.evidence, evaluation, state.simulatedDay, state.audit],
  );

  const store = useMemo<DemoStore>(() => {
    const patientToday = (patientId: string) => {
      const p = state.patients.find((x) => x.id === patientId);
      return p ? dayFor(p, state.simulatedDay) : state.simulatedDay;
    };
    return {
      state,
      tasksByPatient,
      evaluation,
      questionPlans,
      tasksFor: (id) => tasksByPatient[id] ?? [],
      patientToday,
      setDay: (day) => dispatch({ type: 'SET_DAY', day }),
      addEvidence: (evidence, actor = 'Patient app') => dispatch({ type: 'ADD_EVIDENCE', evidence, actor, at: now() }),
      confirmTask: (patientId, taskId, claim, note, gapId) => {
        const task = tasksByPatient[patientId]?.find((item) => item.id === taskId);
        if (!task || !claimOptionsFor(task.type).some((option) => option.claim === claim)) return;
        dispatch({
          type: 'ADD_EVIDENCE',
          gapId,
          actor: DEMO_CLINICIAN,
          at: now(),
          evidence: {
            id: `clin-${state.evidence.length + 1}-${Date.now().toString(36)}`,
            patientId,
            taskId,
            source: 'clinician',
            day: patientToday(patientId),
            claim,
            detail: note?.trim() || 'Confirmed with the patient by the care team',
            confidence: 1,
            confirmedByHuman: true,
          },
        });
      },
      reviewMedicationReport: (report, claim, drugId, historical, note, gapId) =>
        dispatch({
          type: 'ADD_EVIDENCE',
          gapId,
          basedOnEvidenceId: report.id,
          actor: DEMO_CLINICIAN,
          at: now(),
          evidence: {
            id: `clin-${state.evidence.length + 1}-${Date.now().toString(36)}`,
            patientId: report.patientId,
            source: 'clinician',
            day: historical ? report.day : patientToday(report.patientId),
            claim,
            ...(drugId ? { drugId } : {}),
            ...(historical ? { correctsEvidenceId: report.id } : {}),
            detail: note?.trim() || (historical ? 'Earlier report reviewed with the patient' : 'Current use reviewed with the patient'),
            confidence: 1,
            confirmedByHuman: true,
          },
        }),
      resolveGap: (gapId, action, details) => {
        const expectedSeq = observeLifecycle(state).audit.length + 1;
        dispatch({
          type: 'RESOLVE_GAP',
          gapId,
          action,
          ...details,
          by: DEMO_CLINICIAN,
          at: now(),
          expectedSeq,
        });
        return expectedSeq;
      },
      undoResolution: (gapId, resolutionSeq) => dispatch({
        type: 'UNDO_RESOLUTION', gapId, resolutionSeq, by: DEMO_CLINICIAN, at: now(),
      }),
      addPatient: (patient, by = DEMO_CLINICIAN) => dispatch({ type: 'ADD_PATIENT', patient, by, at: now() }),
      recordPresentation: (patientId, target, actor) => dispatch({ type: 'RECORD_PRESENTATION', patientId, target, actor, at: now() }),
      recordAnswer: (patientId, evidence, meta) => {
        const at = now();
        dispatch({ type: 'RECORD_ANSWER', patientId, evidence, ...meta, at });
        return at;
      },
      completeCheckin: (patientId, actor, note) => dispatch({ type: 'COMPLETE_CHECKIN', patientId, actor, note, at: now() }),
      tour: (event) => dispatch({ type: 'TOUR', event }),
      reset: () => dispatch({ type: 'RESET' }),
      replace: (s) => dispatch({ type: 'REPLACE', state: s }),
    };
  }, [state, tasksByPatient, evaluation, questionPlans]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useDemoStore(): DemoStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useDemoStore must be used inside <DemoStoreProvider>');
  return ctx;
}

export function usePatient(id: string | undefined): Patient | undefined {
  const { state } = useDemoStore();
  return id ? state.patients.find((p) => p.id === id) : undefined;
}

/** Today's check-in progress for a patient (from the audit log, at the current simulated day). */
export function useCheckinToday(patientId: string | undefined): { answered: number; completed: boolean } {
  const { state } = useDemoStore();
  return useMemo(() => {
    if (!patientId) return { answered: 0, completed: false };
    const today = state.audit.filter((a) => targetsPatient(a.target, patientId) && a.day === state.simulatedDay);
    return {
      answered: today.filter((a) => a.action === 'CHECKIN_ANSWER').length,
      completed: today.some((a) => a.action === 'CHECKIN_COMPLETED' && a.target === patientId),
    };
  }, [patientId, state.audit, state.simulatedDay]);
}

/** Today's adaptive check-in questions for one patient (on the patient's own timeline). */
export function useQuestionPlan(patientId: string | undefined): QuestionPlan | undefined {
  const { questionPlans } = useDemoStore();
  return patientId ? questionPlans[patientId] : undefined;
}

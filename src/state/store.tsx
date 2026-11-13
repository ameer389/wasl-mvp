/**
 * The one demo store: React context + useReducer, persisted to localStorage.
 * Domain logic lives in src/domain; this file only wires it to React.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { targetsPatient } from '../domain/auditTrail';
import type { QuestionPlan } from '../domain/questionPlanner';
import type { CareTask, Day, Evidence, EvidenceClaim, Patient, ResolutionAction } from '../domain/types';
import type { DemoState } from './demoState';
import { loadState, saveState } from './persistence';
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
  confirmTask: (patientId: string, taskId: string, claim: EvidenceClaim, note?: string) => void;
  resolveGap: (gapId: string, action: ResolutionAction, note?: string, by?: string) => void;
  addPatient: (patient: Patient, by?: string) => void;
  /** Save one check-in answer (evidence + one audit entry). */
  recordAnswer: (patientId: string, evidence: Evidence[], meta: { actor: string; target: string; note: string }) => void;
  completeCheckin: (patientId: string, actor: string, note: string) => void;
  reset: () => void;
  replace: (state: DemoState) => void;
}

const StoreContext = createContext<DemoStore | null>(null);

const now = () => new Date().toISOString();

export function DemoStoreProvider({ children, initialState }: { children: ReactNode; initialState?: DemoState }) {
  const [state, dispatch] = useReducer(demoReducer, initialState, (init) => init ?? loadState());

  useEffect(() => saveState(state), [state]);

  const tasksByPatient = useMemo(() => buildAllTasks(state.patients), [state.patients]);
  const evaluation = useMemo(
    () => evaluateAll(state.patients, tasksByPatient, state.evidence, state.resolutions, state.simulatedDay),
    [state.patients, tasksByPatient, state.evidence, state.resolutions, state.simulatedDay],
  );
  const questionPlans = useMemo(
    () => planAll(state.patients, tasksByPatient, state.evidence, evaluation.statuses, state.simulatedDay),
    [state.patients, tasksByPatient, state.evidence, evaluation.statuses, state.simulatedDay],
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
      confirmTask: (patientId, taskId, claim, note) =>
        dispatch({
          type: 'ADD_EVIDENCE',
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
        }),
      resolveGap: (gapId, action, note, by = DEMO_CLINICIAN) =>
        dispatch({
          type: 'RESOLVE_GAP',
          gapId,
          action,
          note,
          by,
          at: now(),
          // gap ids start with the patient id: resolutions live on the patient's timeline
          patientDay: patientToday(gapId.split(':')[0] ?? ''),
        }),
      addPatient: (patient, by = DEMO_CLINICIAN) => dispatch({ type: 'ADD_PATIENT', patient, by, at: now() }),
      recordAnswer: (patientId, evidence, meta) => dispatch({ type: 'RECORD_ANSWER', patientId, evidence, ...meta, at: now() }),
      completeCheckin: (patientId, actor, note) => dispatch({ type: 'COMPLETE_CHECKIN', patientId, actor, note, at: now() }),
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

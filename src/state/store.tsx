/**
 * The one demo store: React context + useReducer, persisted to localStorage.
 * Domain logic lives in src/domain; this file only wires it to React.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { planQuestions, type QuestionPlan } from '../domain/questionPlanner';
import type { CareTask, Day, Evidence, Patient, ResolutionAction } from '../domain/types';
import type { DemoState } from './demoState';
import { loadState, saveState } from './persistence';
import { demoReducer } from './reducer';
import { buildAllTasks, evaluateAll, type AllEvaluation } from './selectors';

/** Who the demo user is when acting in the care team console. */
export const DEMO_CLINICIAN = 'Care coordinator (demo)';

interface DemoStore {
  state: DemoState;
  tasksByPatient: Record<string, CareTask[]>;
  /** Evaluation at the current simulated day. */
  evaluation: AllEvaluation;
  tasksFor: (patientId: string) => CareTask[];
  evaluateAt: (today: Day) => AllEvaluation;
  setDay: (day: Day) => void;
  addEvidence: (evidence: Evidence, actor?: string) => void;
  resolveGap: (gapId: string, action: ResolutionAction, note?: string, by?: string) => void;
  addPatient: (patient: Patient, by?: string) => void;
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

  const store = useMemo<DemoStore>(
    () => ({
      state,
      tasksByPatient,
      evaluation,
      tasksFor: (id) => tasksByPatient[id] ?? [],
      evaluateAt: (today) => evaluateAll(state.patients, tasksByPatient, state.evidence, state.resolutions, today),
      setDay: (day) => dispatch({ type: 'SET_DAY', day }),
      addEvidence: (evidence, actor = 'Patient app') => dispatch({ type: 'ADD_EVIDENCE', evidence, actor, at: now() }),
      resolveGap: (gapId, action, note, by = DEMO_CLINICIAN) => dispatch({ type: 'RESOLVE_GAP', gapId, action, note, by, at: now() }),
      addPatient: (patient, by = DEMO_CLINICIAN) => dispatch({ type: 'ADD_PATIENT', patient, by, at: now() }),
      reset: () => dispatch({ type: 'RESET' }),
      replace: (s) => dispatch({ type: 'REPLACE', state: s }),
    }),
    [state, tasksByPatient, evaluation],
  );

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

/** Today's adaptive check-in questions for one patient. */
export function useQuestionPlan(patientId: string | undefined): QuestionPlan | undefined {
  const { state, tasksByPatient, evaluation } = useDemoStore();
  const patient = patientId ? state.patients.find((p) => p.id === patientId) : undefined;
  return useMemo(
    () =>
      patient
        ? planQuestions(patient, tasksByPatient[patient.id] ?? [], state.evidence, evaluation.statuses, state.simulatedDay)
        : undefined,
    [patient, tasksByPatient, state.evidence, evaluation.statuses, state.simulatedDay],
  );
}

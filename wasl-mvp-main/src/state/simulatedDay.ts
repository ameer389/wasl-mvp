import { useDemoStore } from './store';
import { simulationHorizon } from './selectors';

/** Simulated clock (days since discharge), backed by the persisted demo store. */
export function useSimulatedDay() {
  const { state, setDay, tasksByPatient } = useDemoStore();
  const day = state.simulatedDay;
  return {
    day,
    totalDays: simulationHorizon(state.patients, tasksByPatient),
    setDay,
    next: () => setDay(day + 1),
    prev: () => setDay(day - 1),
  };
}

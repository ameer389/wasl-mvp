/**
 * Guided demo: the story of Abu Mohammed in 8 steps (also the demo-video script).
 * Pure data + reducer; the TourPanel component performs navigation and highlighting.
 */
import { taskId } from './careGraph';
import { gapId } from './gapEngine';
import type { Day } from './types';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Hash-router path (may include a query string). */
  route: string;
  /** `data-tour` attribute of the element to highlight. */
  target: string;
  /** Simulated day this step is shown on. */
  day: Day;
  /** Optional line inviting the viewer to try something. */
  tryIt?: string;
}

export const TOUR_PATIENT_ID = 'demo-001';
export const TOUR_START_DAY: Day = 2;
const STOP_GAP = gapId(TOUR_PATIENT_ID, 'STOPPED_STILL_TAKEN', taskId(TOUR_PATIENT_ID, 'MED_STOP', 'clopidogrel', 1));
const DETAIL = `/clinician/patient/${TOUR_PATIENT_ID}`;

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'problem',
    title: 'The gap after discharge',
    body: 'After discharge, nobody checks what actually happens at home. WASL closes that loop.',
    route: '/',
    target: 'launcher',
    day: 2,
  },
  {
    id: 'plan',
    title: 'The plan becomes tasks',
    body: 'The discharge plan becomes executable tasks, each with an owner, a deadline and a risk level.',
    route: '/clinician/new?sample=1',
    target: 'task-preview',
    day: 2,
  },
  {
    id: 'graph',
    title: 'One patient, one timeline',
    body: 'Abu Mohammed was transferred between two hospitals. Here is his plan as a timeline.',
    route: `${DETAIL}?tab=care-graph`,
    target: 'care-graph',
    day: 2,
  },
  {
    id: 'checkin',
    title: 'A daily check-in at home',
    body: 'Every day, the patient or family answers a few questions, by voice in Saudi dialect or with big buttons. Only what is still uncertain is asked.',
    route: `/patient/${TOUR_PATIENT_ID}/checkin`,
    target: 'checkin',
    day: 2,
    tryIt: 'Try answering — or just press Next.',
  },
  {
    id: 'queue',
    title: 'Day 4: what needs a clinician',
    body: 'WASL compared expected vs actual: the family is still giving clopidogrel, which was stopped. It is ranked first because it is high-risk.',
    route: '/clinician',
    target: 'queue-top',
    day: 4,
  },
  {
    id: 'why',
    title: 'Every flag explains itself',
    body: "Every flag explains itself, with the family's exact words and the rule that fired. No black box.",
    route: `${DETAIL}?gap=${encodeURIComponent(STOP_GAP)}`,
    target: 'gap-reasons',
    day: 4,
  },
  {
    id: 'act',
    title: 'The clinician decides',
    body: 'The clinician decides. WASL never prescribes. Every action is written to the audit trail.',
    route: `${DETAIL}?gap=${encodeURIComponent(STOP_GAP)}`,
    target: 'gap-actions',
    day: 4,
    tryIt: 'Try "Confirm what happened" or "Mark resolved".',
  },
  {
    id: 'validation',
    title: 'How we tested it',
    body: 'How we tested it, and what is not tested yet.',
    route: '/validation',
    target: 'validation-summary',
    day: 4,
  },
];

export interface TourState {
  active: boolean;
  /** 0-based step; TOUR_STEPS.length means "finished" (the closing card). */
  step: number;
}

export const INITIAL_TOUR: TourState = { active: false, step: 0 };

export type TourEvent = { type: 'START' } | { type: 'NEXT' } | { type: 'BACK' } | { type: 'EXIT' } | { type: 'RESUME' } | { type: 'GOTO'; step: number };

const clampStep = (n: number) => Math.min(TOUR_STEPS.length, Math.max(0, Math.round(n)));

export function tourReducer(state: TourState, event: TourEvent): TourState {
  switch (event.type) {
    case 'START':
      return { active: true, step: 0 };
    case 'NEXT':
      return state.active ? { ...state, step: clampStep(state.step + 1) } : state;
    case 'BACK':
      return state.active ? { ...state, step: clampStep(state.step - 1) } : state;
    case 'GOTO':
      return state.active ? { ...state, step: clampStep(event.step) } : state;
    case 'EXIT':
      // Finishing forgets the position; exiting mid-way keeps it so the tour can be resumed.
      return { active: false, step: state.step >= TOUR_STEPS.length ? 0 : state.step };
    case 'RESUME':
      return { active: true, step: state.step };
  }
}

export const isTourFinished = (state: TourState) => state.active && state.step >= TOUR_STEPS.length;

/** Simulated day a tour state should be shown on (undefined when inactive or finished). */
export function tourDay(state: TourState): Day | undefined {
  return state.active ? TOUR_STEPS[state.step]?.day : undefined;
}

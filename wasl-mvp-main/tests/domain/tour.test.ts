/** Phase 6: guided tour, display helpers and the validation scenario generator. */
import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { GLOSSARY, PAGE_INTRO } from '../../src/content/glossary';
import { entityLabel, readableReason } from '../../src/domain/labels';
import { INITIAL_TOUR, TOUR_START_DAY, TOUR_STEPS, isTourFinished, tourDay, tourReducer } from '../../src/domain/tour';
import type { Patient } from '../../src/domain/types';
import { SAMPLE_PATIENTS } from '../../src/data/samplePatients';
import { CONSOLE_PAGES } from '../../src/routes';
import { seedState } from '../../src/state/demoState';
import { demoReducer } from '../../src/state/reducer';
import { CLEAN_CONTROLS, ORIGINAL_GAP_TYPES, INJECTED_SCENARIOS, generateScenarios, phase06Scenarios, runGapDetection, runQuestionReduction } from '../../validation/scenarios';

describe('tour reducer', () => {
  it('has 8 steps that each name a screen and an element to highlight', () => {
    expect(TOUR_STEPS).toHaveLength(8);
    for (const s of TOUR_STEPS) {
      expect(s.route.startsWith('/')).toBe(true);
      expect(s.target).toBeTruthy();
      expect(s.body.length).toBeGreaterThan(20);
    }
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(8);
  });

  it('START → NEXT … → finished card; BACK is bounded', () => {
    let t = tourReducer(INITIAL_TOUR, { type: 'START' });
    expect(t).toEqual({ active: true, step: 0 });
    expect(tourReducer(t, { type: 'BACK' }).step).toBe(0);
    for (let i = 0; i < 8; i++) t = tourReducer(t, { type: 'NEXT' });
    expect(t.step).toBe(8);
    expect(isTourFinished(t)).toBe(true);
    expect(tourReducer(t, { type: 'NEXT' }).step).toBe(8); // cannot run past the end
    expect(tourReducer(t, { type: 'BACK' }).step).toBe(7);
  });

  it('EXIT mid-way keeps the position for RESUME; EXIT after finishing forgets it', () => {
    let t = tourReducer(tourReducer(tourReducer(INITIAL_TOUR, { type: 'START' }), { type: 'NEXT' }), { type: 'NEXT' });
    t = tourReducer(t, { type: 'EXIT' });
    expect(t).toEqual({ active: false, step: 2 });
    expect(tourReducer(t, { type: 'NEXT' })).toBe(t); // inactive tours ignore steps
    expect(tourReducer(t, { type: 'RESUME' })).toEqual({ active: true, step: 2 });
    expect(tourReducer({ active: true, step: 8 }, { type: 'EXIT' })).toEqual({ active: false, step: 0 });
    expect(tourReducer({ active: true, step: 1 }, { type: 'GOTO', step: 99 }).step).toBe(8);
  });

  it('the simulated day follows the story: Day 2 for the first four steps, Day 4 after', () => {
    expect(TOUR_STEPS.map((s) => s.day)).toEqual([2, 2, 2, 2, 4, 4, 4, 4]);
    expect(tourDay({ active: true, step: 4 })).toBe(4);
    expect(tourDay({ active: false, step: 4 })).toBeUndefined();
    expect(tourDay({ active: true, step: 8 })).toBeUndefined();
  });

  it('in the store, starting the tour resets to the seed at Day 2 and steps move the day', () => {
    let s = demoReducer(seedState(), { type: 'SET_DAY', day: 9 });
    s = demoReducer(s, { type: 'RESOLVE_GAP', gapId: 'demo-001:STOPPED_STILL_TAKEN:demo-001/MED_STOP/clopidogrel@d1',
      action: 'RESOLVED', by: 'Dr', at: 't', disposition: 'ADMINISTRATIVE', reasonCode: 'HANDED_OFF', note: 'Handed off' });
    expect(s.resolutions).toHaveLength(1);
    s = demoReducer(s, { type: 'TOUR', event: { type: 'START' } });
    expect(s.simulatedDay).toBe(TOUR_START_DAY);
    expect(s.resolutions).toEqual([]);
    expect(s.tour).toEqual({ active: true, step: 0 });
    for (let i = 0; i < 4; i++) s = demoReducer(s, { type: 'TOUR', event: { type: 'NEXT' } });
    expect(s.simulatedDay).toBe(4);
    s = demoReducer(s, { type: 'TOUR', event: { type: 'BACK' } });
    expect(s.simulatedDay).toBe(2);
    // Answers given during the tour survive stepping.
    s = demoReducer(s, { type: 'SET_DAY', day: 2 });
    const kept = demoReducer(s, { type: 'TOUR', event: { type: 'EXIT' } });
    expect(kept.evidence).toBe(s.evidence);
    expect(demoReducer(kept, { type: 'RESET' }).tour).toEqual(INITIAL_TOUR);
  });
});

describe('plain-words display helpers', () => {
  it('readableReason turns codes into words without changing the facts', () => {
    expect(readableReason('Family report Day 2: «لا» → STILL_TAKING (confidence 0.90).')).toBe(
      'Family report Day 2: «لا» → understood as "Still taking" (confidence 90%).',
    );
    expect(readableReason('Rule STOPPED_STILL_TAKEN: a medicine marked STOP in the plan is reported as still in use.')).toBe(
      'Rule: a medicine marked "stop" in the plan is reported as still in use.',
    );
    expect(readableReason('Apixaban was prescribed as NEW (expected start by Day 1).')).toBe('Apixaban was prescribed as new (expected start by Day 1).');
    expect(readableReason('understood with confidence below 0.70 and')).toBe('understood with confidence below 70% and');
  });

  it('entityLabel names the thing without the action', () => {
    const p = SAMPLE_PATIENTS[0] as Patient;
    const labels = Object.fromEntries(buildCareGraph(p).map((t) => [t.type, entityLabel(t, p)]));
    expect(labels).toMatchObject({ MED_START: 'Apixaban', MED_STOP: 'Clopidogrel', LAB_DONE: 'CBC', FOLLOWUP_BOOKED: 'Cardiology', FOLLOWUP_ATTENDED: 'Cardiology' });
  });

  it('every console page has an intro line; every glossary entry has text', () => {
    for (const page of CONSOLE_PAGES) expect(PAGE_INTRO[page.path], page.path).toBeTruthy();
    for (const entry of Object.values(GLOSSARY)) expect(entry.text.length).toBeGreaterThan(30);
  });
});

describe('validation scenario generator', () => {
  it('reports Phase 06 focused outcomes separately from historical cases', () => {
    const report = runGapDetection(phase06Scenarios());
    expect(report).toMatchObject({
      scenarios: 7, controls: 1, expectedGaps: 7, truePositives: 7,
      falsePositives: 0, falseNegatives: 0, highRiskGaps: 1, highRiskRoutedNow: 1,
    });
    expect(report.perType.TASK_NOT_COMPLETED.expected).toBe(3);
    expect(report.perType.FOLLOWUP_ATTENDANCE_UNCONFIRMED.expected).toBe(2);
  });
  const scenarios = generateScenarios();

  it('is deterministic for a seed and different for another seed', () => {
    expect(generateScenarios()).toEqual(scenarios);
    expect(generateScenarios(7)).not.toEqual(scenarios);
  });

  it('builds 50 injected cases plus 10 controls and routes the nine weak medication reports to review', () => {
    expect(scenarios.filter((s) => s.kind === 'injected')).toHaveLength(INJECTED_SCENARIOS);
    expect(scenarios.filter((s) => s.kind === 'control')).toHaveLength(CLEAN_CONTROLS);
    for (const type of ORIGINAL_GAP_TYPES) {
      const n = scenarios.flatMap((s) => s.expected).filter((e) => e.type === type).length;
      if (type === 'DUPLICATE_THERAPY') expect(n).toBe(3); // Two of the five reports are below the confidence floor.
      else expect(n, type).toBeGreaterThanOrEqual(4);
    }
    const openReviews = scenarios.flatMap((s) => s.expected).filter((g) => g.type === 'LOW_CONFIDENCE' && !g.key.includes('/'));
    expect(openReviews).toHaveLength(9);
    for (const s of scenarios.filter((x) => x.kind === 'control')) expect(s.expected).toEqual([]);
  });

  it('the engine finds every injected gap and stays quiet on clean controls', () => {
    const r = runGapDetection(scenarios);
    expect(r.falseNegatives).toBe(0);
    expect(r.falsePositives).toBe(0);
    expect(r.falsePositivesOnControls).toBe(0);
    expect(r.highRiskRoutedNowPct).toBe(100);
  });

  it('the adaptive check-in never asks more than the full script', () => {
    const q = runQuestionReduction(scenarios);
    expect(q.patientDays).toBe(60 * 15);
    expect(q.adaptiveQuestions).toBeLessThan(q.fullScriptQuestions);
  });
});

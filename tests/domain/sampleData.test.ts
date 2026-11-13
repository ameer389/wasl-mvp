import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { getDrug } from '../../src/domain/drugs';
import { evaluate } from '../../src/domain/gapEngine';
import { planQuestions } from '../../src/domain/questionPlanner';
import type { GapType } from '../../src/domain/types';
import { DEMO_PATIENT_ID, SAMPLE_EVIDENCE, SAMPLE_PATIENTS, SEED_DAY } from '../../src/data/samplePatients';

const INTENDED_AT_DAY_4: Record<string, GapType[]> = {
  'demo-001': ['LOW_CONFIDENCE', 'STOPPED_STILL_TAKEN'],
  'demo-002': ['DUPLICATE_THERAPY'],
  'demo-003': ['WRONG_DOSE'],
  'demo-004': ['LAB_MISSED'],
  'demo-005': ['NO_RESPONSE'],
  'demo-006': [],
};

describe('synthetic sample data', () => {
  it('is internally consistent (known drugs, evidence points at real tasks)', () => {
    expect(SAMPLE_PATIENTS).toHaveLength(6);
    const allTaskIds = new Set(SAMPLE_PATIENTS.flatMap((p) => buildCareGraph(p).map((t) => t.id)));
    for (const p of SAMPLE_PATIENTS) {
      expect(p.plan.patientId).toBe(p.id);
      for (const m of p.plan.meds) expect(getDrug(m.drugId), m.drugId).toBeDefined();
    }
    for (const e of SAMPLE_EVIDENCE) {
      if (e.taskId) expect(allTaskIds.has(e.taskId), e.id).toBe(true);
      expect(e.day).toBeGreaterThanOrEqual(0);
      expect(e.day).toBeLessThanOrEqual(4);
    }
    expect(new Set(SAMPLE_EVIDENCE.map((e) => e.id)).size).toBe(SAMPLE_EVIDENCE.length);
  });

  it('at Day 4 each patient produces exactly its intended gap types', () => {
    for (const p of SAMPLE_PATIENTS) {
      const { gaps } = evaluate(p, buildCareGraph(p), SAMPLE_EVIDENCE, [], 4);
      const types = [...new Set(gaps.map((g) => g.type))].sort();
      expect(types, p.id).toEqual(INTENDED_AT_DAY_4[p.id]);
    }
  });

  it('patient 6 stays quiet: zero gaps on every day of the window', () => {
    const p = SAMPLE_PATIENTS.find((x) => x.id === 'demo-006');
    if (!p) throw new Error('demo-006 missing');
    for (let day = 0; day <= 4; day++) expect(evaluate(p, buildCareGraph(p), SAMPLE_EVIDENCE, [], day).gaps).toEqual([]);
  });

  it('demo opens on Day 4 and demo-001 asks 3 questions there («٠ من ٣»)', () => {
    expect(SEED_DAY).toBe(4);
    const p = SAMPLE_PATIENTS.find((x) => x.id === DEMO_PATIENT_ID);
    if (!p) throw new Error('demo-001 missing');
    const tasks = buildCareGraph(p);
    const { taskStatus } = evaluate(p, tasks, SAMPLE_EVIDENCE, [], SEED_DAY);
    expect(planQuestions(p, tasks, SAMPLE_EVIDENCE, taskStatus, SEED_DAY).questions).toHaveLength(3);
  });
});

import { describe, expect, it } from 'vitest';
import { buildCareGraph } from '../../src/domain/careGraph';
import { findDuplicates, getDrug, DRUGS } from '../../src/domain/drugs';
import { makePatient, T, tasksOfType } from './fixtures';

const tasks = buildCareGraph(makePatient());
const byId = (id: string) => {
  const t = tasks.find((x) => x.id === id);
  if (!t) throw new Error(`missing task ${id}`);
  return t;
};

describe('buildCareGraph', () => {
  it('NEW med → start (Day 1) + continuation checks (Day 3, Day 7)', () => {
    const apixaban = tasks.filter((t) => t.refId === 'apixaban');
    expect(apixaban.map((t) => [t.type, t.deadlineDay])).toEqual([
      ['MED_START', 1],
      ['MED_CONTINUE', 3],
      ['MED_CONTINUE', 7],
    ]);
  });

  it('CHANGED → dose change Day 1, STOP → stop Day 1, CONTINUE → continue Day 3', () => {
    expect(byId(T.insulinDose).deadlineDay).toBe(1);
    expect(byId(T.clopidogrelStop).deadlineDay).toBe(1);
    expect(byId(T.metforminCont).deadlineDay).toBe(3);
  });

  it('applies the medication risk rules', () => {
    expect(byId(T.apixabanStart).risk).toBe('high'); // NEW high-alert
    expect(byId(T.furosemideStart).risk).toBe('medium'); // NEW not high-alert
    expect(byId(T.insulinDose).risk).toBe('high'); // CHANGED high-alert
    expect(byId(T.clopidogrelStop).risk).toBe('high'); // STOP antiplatelet
    expect(byId(T.metforminCont).risk).toBe('low'); // CONTINUE not high-alert

    const p = makePatient();
    p.plan.meds = [
      { drugId: 'warfarin', dose: '3 mg', frequency: 'once daily', action: 'CONTINUE', prescriber: 'X' },
      { drugId: 'omeprazole', dose: '20 mg', frequency: 'once daily', action: 'STOP', prescriber: 'X' },
    ];
    const g = buildCareGraph(p);
    expect(g.find((t) => t.refId === 'warfarin')?.risk).toBe('medium'); // CONTINUE high-alert
    expect(g.find((t) => t.refId === 'omeprazole')?.risk).toBe('medium'); // STOP ordinary
  });

  it('lab risk follows the linked drug; follow-up + wound are medium', () => {
    expect(byId(T.cbc)).toMatchObject({ type: 'LAB_DONE', deadlineDay: 3, risk: 'high' });
    expect(byId(T.booked)).toMatchObject({ owner: 'family', deadlineDay: 2, risk: 'medium' });
    expect(byId(T.attended)).toMatchObject({ deadlineDay: 7, risk: 'medium' });
    expect(byId(T.wound)).toMatchObject({ deadlineDay: 3, risk: 'medium' });
  });

  it('attendance depends on booking and on labs due before the visit', () => {
    expect(byId(T.attended).dependsOn).toEqual([T.booked, T.cbc]);
    expect(byId(T.apixabanCont3).dependsOn).toEqual([T.apixabanStart]);
  });

  it('is deterministic with unique ids', () => {
    const again = buildCareGraph(makePatient());
    expect(again).toEqual(tasks);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(tasksOfType(tasks, 'MED_CONTINUE')).toHaveLength(5); // apixaban ×2, furosemide ×2, metformin ×1
  });

  it('Arabic labels contain no doses', () => {
    for (const t of tasks) expect(t.labelAr).not.toMatch(/\d/);
  });
});

describe('drug dictionary', () => {
  it('has ~25+ drugs with unique ids and the required high-alert flags', () => {
    expect(DRUGS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(DRUGS.map((d) => d.id)).size).toBe(DRUGS.length);
    for (const id of ['warfarin', 'apixaban', 'rivaroxaban', 'enoxaparin', 'insulin-glargine', 'insulin-aspart', 'tramadol', 'morphine', 'gliclazide', 'digoxin']) {
      expect(getDrug(id)?.highAlert, id).toBe(true);
    }
    expect(getDrug('paracetamol')?.highAlert).toBe(false);
  });

  it('findDuplicates: shared ingredient, flagged class, or nothing', () => {
    expect(findDuplicates('paracetamol', 'paracetamol-codeine')).toEqual({ kind: 'INGREDIENT', ingredient: 'paracetamol' });
    expect(findDuplicates('apixaban', 'rivaroxaban')).toEqual({ kind: 'CLASS', therapeuticClass: 'anticoagulant' });
    expect(findDuplicates('omeprazole', 'esomeprazole')).toEqual({ kind: 'CLASS', therapeuticClass: 'PPI' });
    expect(findDuplicates('amlodipine', 'losartan')).toBeNull(); // different classes
    expect(findDuplicates('bisoprolol', 'bisoprolol')).not.toBeNull(); // same drug = same ingredient
    expect(findDuplicates('apixaban', 'unknown')).toBeNull();
  });
});

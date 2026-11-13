/** Pure helpers behind the care team console (Phase 4). */
import { describe, expect, it } from 'vitest';
import { auditKind, patientAuditTrail, targetsPatient } from '../../src/domain/auditTrail';
import { buildCareGraph, taskId } from '../../src/domain/careGraph';
import { claimOptionsFor, confirmationHint } from '../../src/domain/claimOptions';
import { evaluate } from '../../src/domain/gapEngine';
import { DEFAULT_GRAPH_METRICS, LANES, layoutCareGraph } from '../../src/domain/graphLayout';
import { GAP_TYPE_LABEL, gapSubject, shortTaskLabel } from '../../src/domain/labels';
import { daysOpen, highestRisk, lastCheckIn, questionSavings, verificationSummary } from '../../src/domain/metrics';
import { emptyForm, formToPatient, nextPatientId, sampleForm, validatePlanForm } from '../../src/domain/planForm';
import { buildQueueRows, DEFAULT_FILTERS, filterGaps } from '../../src/domain/queue';
import { patientDay } from '../../src/domain/time';
import type { Gap, GapType, TaskType } from '../../src/domain/types';
import { SAMPLE_EVIDENCE, SAMPLE_PATIENTS, SEED_AUDIT } from '../../src/data/samplePatients';
import { seedState } from '../../src/state/demoState';
import { demoReducer } from '../../src/state/reducer';
import { buildAllTasks, evaluateAll, planAll } from '../../src/state/selectors';

const PROHIBITED = /\b(increase|decrease|take|give|stop taking|double|reduce)\b/i;
const gap = (fields: Partial<Gap> & Pick<Gap, 'id' | 'patientId' | 'type'>): Gap => ({
  risk: 'medium',
  priority: 5,
  reasons: ['r'],
  evidenceIds: [],
  detectedDay: 1,
  route: 'CLINICIAN_24H',
  ...fields,
});

describe('plain-English gap labels', () => {
  it('cover every gap type and stay descriptive', () => {
    const types: GapType[] = ['NOT_STARTED', 'STOPPED_STILL_TAKEN', 'WRONG_DOSE', 'DUPLICATE_THERAPY', 'UNLISTED_MED', 'LAB_MISSED', 'FOLLOWUP_NOT_BOOKED', 'FOLLOWUP_MISSED', 'NO_RESPONSE', 'LOW_CONFIDENCE'];
    for (const t of types) {
      expect(GAP_TYPE_LABEL[t]).toBeTruthy();
      expect(GAP_TYPE_LABEL[t]).not.toMatch(PROHIBITED);
    }
    expect(GAP_TYPE_LABEL.STOPPED_STILL_TAKEN).toBe('Stopped medicine still being taken');
    expect(GAP_TYPE_LABEL.LOW_CONFIDENCE).toBe('Low-confidence answer: needs a human');
  });

  it('name the subject of a gap (task, medicine or unknown)', () => {
    const p = SAMPLE_PATIENTS[0]!;
    const tasks = buildCareGraph(p);
    const stop = tasks.find((t) => t.type === 'MED_STOP')!;
    expect(shortTaskLabel(stop, p)).toBe('Stop Clopidogrel');
    expect(gapSubject(gap({ id: 'a', patientId: p.id, type: 'STOPPED_STILL_TAKEN', taskId: stop.id }), tasks, p)).toBe('Stop Clopidogrel');
    expect(gapSubject(gap({ id: 'b', patientId: p.id, type: 'DUPLICATE_THERAPY', drugId: 'paracetamol' }), tasks, p)).toBe('Paracetamol');
    expect(gapSubject(gap({ id: 'c', patientId: p.id, type: 'UNLISTED_MED' }), tasks, p)).toBe('Unidentified medicine');
  });
});

describe('claim options per task type', () => {
  it('offers only claims the gap engine understands, matching the task', () => {
    expect(claimOptionsFor('MED_START').map((o) => o.claim)).toEqual(['DONE', 'NOT_DONE']);
    expect(claimOptionsFor('MED_STOP').map((o) => o.label)).toEqual(['Stopped', 'Still taking']);
    expect(claimOptionsFor('MED_DOSE_CHANGE').map((o) => o.claim)).toEqual(['DONE', 'OLD_DOSE']);
  });

  it('feed-verified tasks have no clinician claims, with an explanation', () => {
    for (const t of ['LAB_DONE', 'FOLLOWUP_BOOKED', 'FOLLOWUP_ATTENDED'] as TaskType[]) {
      expect(claimOptionsFor(t)).toEqual([]);
      expect(confirmationHint(t)).toMatch(/feed/);
    }
    expect(confirmationHint('MED_START')).toBeUndefined();
  });

  it('a clinician confirmation closes the gap it addresses', () => {
    const p = SAMPLE_PATIENTS[0]!;
    const tasks = buildCareGraph(p);
    const stopId = taskId(p.id, 'MED_STOP', 'clopidogrel', 1);
    const confirmed = {
      id: 'c1',
      patientId: p.id,
      taskId: stopId,
      source: 'clinician' as const,
      day: 4,
      claim: claimOptionsFor('MED_STOP')[0]!.claim,
      confidence: 1,
      confirmedByHuman: true,
    };
    const { gaps, taskStatus } = evaluate(p, tasks, [...SAMPLE_EVIDENCE, confirmed], [], 4);
    expect(gaps.map((g) => g.type)).not.toContain('STOPPED_STILL_TAKEN');
    expect(taskStatus[stopId]).toBe('VERIFIED');
  });
});

describe('queue grouping and filters', () => {
  const gaps = [
    gap({ id: 'p1:A', patientId: 'p1', type: 'STOPPED_STILL_TAKEN', risk: 'high', route: 'CLINICIAN_NOW', priority: 30 }),
    gap({ id: 'p2:NR1', patientId: 'p2', type: 'NO_RESPONSE', priority: 9.1, detectedDay: 3 }),
    gap({ id: 'p3:NR', patientId: 'p3', type: 'NO_RESPONSE', priority: 9.0 }),
    gap({ id: 'p2:NR2', patientId: 'p2', type: 'NO_RESPONSE', risk: 'high', route: 'CLINICIAN_NOW', priority: 8, detectedDay: 2 }),
  ];

  it('groups ≥2 NO_RESPONSE gaps per patient into one row; a single one stays a row', () => {
    const rows = buildQueueRows(gaps);
    expect(rows.map((r) => r.key)).toEqual(['p1:A', 'p2:NO_RESPONSE:group', 'p3:NR']);
    const group = rows[1]!;
    expect(group.kind).toBe('group');
    if (group.kind === 'group') {
      expect(group.gaps.map((g) => g.id)).toEqual(['p2:NR1', 'p2:NR2']);
      expect(group).toMatchObject({ risk: 'high', route: 'CLINICIAN_NOW', priority: 9.1, detectedDay: 2 });
    }
  });

  it('filters by risk, route, type and patient name (English or Arabic)', () => {
    const patients = SAMPLE_PATIENTS.map((p, i) => ({ ...p, id: `p${i + 1}` }));
    expect(filterGaps(gaps, { ...DEFAULT_FILTERS, risk: 'high' }, patients)).toHaveLength(2);
    expect(filterGaps(gaps, { ...DEFAULT_FILTERS, route: '24h' }, patients).map((g) => g.id)).toEqual(['p2:NR1', 'p3:NR']);
    expect(filterGaps(gaps, { ...DEFAULT_FILTERS, type: 'NO_RESPONSE' }, patients)).toHaveLength(3);
    expect(filterGaps(gaps, { ...DEFAULT_FILTERS, search: 'mohammed' }, patients).map((g) => g.id)).toEqual(['p1:A']);
    expect(filterGaps(gaps, { ...DEFAULT_FILTERS, search: 'أم خالد' }, patients).map((g) => g.patientId)).toEqual(['p2', 'p2']);
  });
});

describe('metrics', () => {
  const s = seedState();
  const tasks = buildAllTasks(s.patients);
  const { statuses, gaps } = evaluateAll(s.patients, tasks, s.evidence, s.resolutions, 4);

  it('verification counts only tasks due so far', () => {
    const v = verificationSummary(tasks['demo-006']!, statuses, 4);
    expect(v.verified).toBe(v.due);
    expect(v.pct).toBe(100);
    expect(verificationSummary(tasks['demo-006']!, statuses, -1)).toEqual({ verified: 0, due: 0, pct: 0 });
  });

  it('question savings: adaptive vs full script across patients', () => {
    const savings = questionSavings(Object.values(planAll(s.patients, tasks, s.evidence, statuses, 4)));
    expect(savings.adaptive).toBeLessThan(savings.baseline);
    expect(savings.reductionPct).toBe(Math.round((100 * (savings.baseline - savings.adaptive)) / savings.baseline));
    expect(questionSavings([])).toEqual({ adaptive: 0, baseline: 0, reductionPct: 0 });
  });

  it('last check-in, highest risk and days open', () => {
    expect(lastCheckIn(s.evidence, 'demo-001', 4)).toMatchObject({ source: 'patient_app', day: 3 });
    expect(lastCheckIn(s.evidence, 'demo-005', 4)).toBeUndefined(); // feeds are not check-ins
    expect(highestRisk(gaps.filter((g) => g.patientId === 'demo-004'))).toBe('medium');
    expect(highestRisk([])).toBeUndefined();
    expect(daysOpen(gap({ id: 'x', patientId: 'p', type: 'LAB_MISSED', detectedDay: 2 }), 4)).toBe(2);
  });
});

describe('care graph layout', () => {
  const tasks = buildCareGraph(SAMPLE_PATIENTS[0]!);
  const layout = layoutCareGraph(tasks);
  const m = DEFAULT_GRAPH_METRICS;

  it('puts every task at its deadline day in its lane, without overlaps', () => {
    expect(layout.nodes).toHaveLength(tasks.length);
    for (const n of layout.nodes) expect(n.x).toBe(m.laneLabelWidth + n.task.deadlineDay * m.dayWidth + 4);
    const keys = layout.nodes.map((n) => `${n.x}:${n.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(layout.lanes.map((l) => l.lane)).toEqual(LANES);
  });

  it('stacks same-day tasks and draws dependency edges', () => {
    const day3Meds = layout.nodes.filter((n) => n.lane === 'Medications' && n.task.deadlineDay === 3);
    expect(day3Meds.map((n) => n.row).sort()).toEqual([0, 1, 2]);
    const attend = tasks.find((t) => t.type === 'FOLLOWUP_ATTENDED')!;
    expect(layout.edges.filter((e) => e.to === attend.id)).toHaveLength(2); // booking + CBC
    expect(layout.width).toBe(m.laneLabelWidth + 15 * m.dayWidth + 8); // Day 0–14
    expect(layout.dayCenter(4)).toBe(m.laneLabelWidth + 4.5 * m.dayWidth);
  });
});

describe('new discharge form', () => {
  it('requires the basics and at least one medicine or lab', () => {
    const f = emptyForm();
    f.meds = [];
    const e = validatePlanForm(f);
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['nameEn', 'nameAr', 'age', 'sex', 'hospital', 'diagnosisLabel', 'plan']));
  });

  it('rejects a visit before the book-by day, duplicate medicines and a missing previous dose', () => {
    const f = sampleForm();
    f.followUps[0]!.bookByDay = '5';
    f.followUps[0]!.visitDay = '3';
    f.meds.push({ ...f.meds[0]!, key: 'dup' });
    f.meds[1]!.action = 'CHANGED';
    const e = validatePlanForm(f);
    expect(e['followUps.0.visitDay']).toMatch(/before the book-by day/);
    expect(e['meds.5.drugId']).toMatch(/already listed/);
    expect(e['meds.1.previousDose']).toBeDefined();
  });

  it('requires both transfer hospitals or neither', () => {
    const f = sampleForm();
    f.transferTo = '';
    expect(validatePlanForm(f).transferTo).toBeDefined();
  });

  it('the sample case is valid and becomes a patient with tasks in every lane', () => {
    const f = sampleForm();
    expect(validatePlanForm(f)).toEqual({});
    const p = formToPatient(f, 'pt-007', 4);
    expect(p).toMatchObject({ id: 'pt-007', dischargeDay: 4, transfer: { fromHospital: 'Demo General Hospital' } });
    const lanes = new Set(buildCareGraph(p).map((t) => t.type));
    expect(lanes).toEqual(new Set(['MED_START', 'MED_CONTINUE', 'MED_STOP', 'LAB_DONE', 'FOLLOWUP_BOOKED', 'FOLLOWUP_ATTENDED', 'WOUND_CHECK']));
  });

  it('lenient preview skips incomplete rows instead of failing', () => {
    const f = emptyForm(); // one empty medicine row
    f.labs = [{ key: 'l', test: 'CBC', dueDay: '', linkedDrugId: '' }];
    const p = formToPatient(f, 'preview', 0, true);
    expect(p.plan.meds).toEqual([]);
    expect(p.plan.labs).toEqual([]);
    expect(() => buildCareGraph(p)).not.toThrow();
  });

  it('allocates the next free patient id', () => {
    expect(nextPatientId([{ id: 'demo-001' }, { id: 'pt-002' }])).toBe('pt-003');
    expect(nextPatientId([{ id: 'pt-002' }, { id: 'x' }])).toBe('pt-003');
  });
});

describe('per-patient timelines (patient added mid-demo)', () => {
  it('a patient discharged on Day 4 is on their own Day 0, with no gaps yet', () => {
    const s = seedState();
    const p = formToPatient(sampleForm(), 'pt-007', 4);
    const patients = [...s.patients, p];
    const tasks = buildAllTasks(patients);
    expect(patientDay(4, p.dischargeDay)).toBe(0);
    expect(evaluateAll(patients, tasks, s.evidence, [], 4).gapsByPatient['pt-007']).toEqual([]);
    expect(evaluateAll(patients, tasks, s.evidence, [], 2).gapsByPatient['pt-007']).toEqual([]); // not yet discharged
    const later = evaluateAll(patients, tasks, s.evidence, [], 7).gapsByPatient['pt-007']!;
    expect(later.some((g) => g.type === 'NO_RESPONSE')).toBe(true); // their Day 3
  });

  it('resolutions are stored on the patient timeline', () => {
    const s = demoReducer(seedState(), { type: 'RESOLVE_GAP', gapId: 'pt-007:X:y', action: 'RESOLVED', by: 'Dr', at: 't', patientDay: 1 });
    expect(s.resolutions[0]?.day).toBe(1);
    expect(s.audit.at(-1)?.day).toBe(s.simulatedDay); // the audit keeps global time
  });
});

describe('audit trail', () => {
  const s = seedState();
  const p = SAMPLE_PATIENTS[0]!;
  const tasks = buildCareGraph(p);

  it('matches targets to the right patient only', () => {
    expect(targetsPatient('demo-001', 'demo-001')).toBe(true);
    expect(targetsPatient('demo-001/MED_STOP/clopidogrel@d1', 'demo-001')).toBe(true);
    expect(targetsPatient('demo-001:LOW_CONFIDENCE:x', 'demo-001')).toBe(true);
    expect(targetsPatient('demo-0010', 'demo-001')).toBe(false);
  });

  it('seeds an audit entry per piece of evidence (provenance from Day 0)', () => {
    expect(SEED_AUDIT.filter((a) => a.action === 'EVIDENCE_ADDED')).toHaveLength(SAMPLE_EVIDENCE.length);
  });

  it('merges stored entries with engine-detected gaps, newest first, and classifies them', () => {
    let state = s;
    const gapId = `demo-001:STOPPED_STILL_TAKEN:${taskId('demo-001', 'MED_STOP', 'clopidogrel', 1)}`;
    state = demoReducer(state, { type: 'RESOLVE_GAP', gapId, action: 'CALLED', by: 'Dr Test', note: 'Reached', at: '2026-11-13T08:00:00.000Z' });
    const rows = patientAuditTrail({
      patient: p,
      tasks,
      audit: state.audit,
      detectedGaps: evaluate(p, tasks, state.evidence, [], 4).gaps,
      globalDay: 4,
    });
    expect(rows[0]).toMatchObject({ action: 'Call logged', kind: 'clinician', actor: 'Dr Test' });
    expect(rows[0]?.target).toBe('Stopped medicine still being taken · Stop Clopidogrel');
    expect(rows.some((r) => r.action === 'Gap detected' && r.kind === 'system')).toBe(true);
    expect(rows.at(-1)?.action).toBe('Discharge plan received');
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.day).toBeGreaterThanOrEqual(rows[i]!.day);
    expect(auditKind({ id: 'a', day: 1, at: '', actor: 'x', action: 'EVIDENCE_ADDED', target: 't', note: 'clinician: DONE' })).toBe('clinician');
  });

  it('hides entries from the future when the simulated day moves back', () => {
    const rows = patientAuditTrail({ patient: p, tasks, audit: s.audit, detectedGaps: [], globalDay: 1 });
    expect(rows.every((r) => r.day <= 1)).toBe(true);
  });
});

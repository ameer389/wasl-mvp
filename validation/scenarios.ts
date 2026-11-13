/**
 * Synthetic validation scenarios for the gap engine.
 *
 * A seeded generator (SCENARIO_SEED, mulberry32) builds 50 fictional discharge
 * cases with deliberately injected, known ("ground-truth") gaps — 5 per gap type,
 * some cases with a second gap — plus 10 clean controls where everything goes to
 * plan. The real engine is then run and its output compared with the ground truth.
 *
 * What this proves: the rules cover every gap type and do not fire on clean cases.
 * What it does NOT prove: real-world accuracy. The rules are deterministic and the
 * scenarios were written by the same team, so high scores are expected.
 */
import { buildCareGraph } from '../src/domain/careGraph';
import { DRUGS, findDuplicates } from '../src/domain/drugs';
import { evaluate } from '../src/domain/gapEngine';
import { planQuestions } from '../src/domain/questionPlanner';
import { FOLLOW_UP_DAYS } from '../src/domain/time';
import type { CareTask, Evidence, Gap, GapType, MedAction, Patient, PlanMedication } from '../src/domain/types';

export const SCENARIO_SEED = 20261114;
export const INJECTED_SCENARIOS = 50;
export const CLEAN_CONTROLS = 10;
/** Assumption used for "minutes saved": one check-in question takes about this long by phone. */
export const MINUTES_PER_QUESTION = 1.5;

export const GAP_TYPES: GapType[] = [
  'NOT_STARTED',
  'STOPPED_STILL_TAKEN',
  'WRONG_DOSE',
  'DUPLICATE_THERAPY',
  'UNLISTED_MED',
  'LAB_MISSED',
  'FOLLOWUP_NOT_BOOKED',
  'FOLLOWUP_MISSED',
  'NO_RESPONSE',
  'LOW_CONFIDENCE',
];

export interface ExpectedGap {
  type: GapType;
  /** Task id, or drug id for medication-level gaps. */
  key: string;
}

export interface Scenario {
  id: string;
  kind: 'injected' | 'control';
  patient: Patient;
  evidence: Evidence[];
  expected: ExpectedGap[];
  /** Day on which the injected gaps must be visible. */
  evalDay: number;
}

// ── seeded randomness ───────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── generator ───────────────────────────────────────────────────────────────

const EVAL_DAY = 4;

export function generateScenarios(seed: number = SCENARIO_SEED): Scenario[] {
  const rand = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
  const chance = (p: number) => rand() < p;
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;

  const scenarios: Scenario[] = [];

  const build = (index: number, kind: Scenario['kind'], types: GapType[]): Scenario => {
    const id = `${kind === 'control' ? 'ctl' : 'scn'}-${String(index + 1).padStart(3, '0')}`;
    const used = new Set<string>();
    const drug = () => {
      let d = pick(DRUGS);
      while (used.has(d.id)) d = pick(DRUGS);
      used.add(d.id);
      return d.id;
    };
    const med = (action: MedAction, drugId = drug()): PlanMedication => ({
      drugId,
      action,
      dose: '1 unit',
      frequency: 'as written',
      prescriber: 'Synthetic prescriber',
      ...(action === 'CHANGED' ? { previousDose: '2 units' } : {}),
    });

    // Base plan
    const meds: PlanMedication[] = [med('NEW')];
    if (chance(0.5)) meds.push(med('NEW'));
    meds.push(med('CONTINUE'));
    if (chance(0.5)) meds.push(med('CONTINUE'));
    if (chance(0.5) || types.includes('STOPPED_STILL_TAKEN')) meds.push(med('STOP'));
    if (chance(0.3) || types.includes('WRONG_DOSE')) meds.push(med('CHANGED'));

    const needEarlyLab = types.includes('LAB_MISSED');
    const labs = needEarlyLab || chance(0.6) ? [{ id: 'lab-1', test: 'Synthetic lab', dueDay: needEarlyLab ? int(2, 3) : int(2, 9), linkedDrugId: meds[0]!.drugId }] : [];
    const missed = types.includes('FOLLOWUP_MISSED');
    const followUps = [{ id: 'fu-1', clinic: 'Synthetic clinic', bookByDay: missed ? 1 : int(1, 3), visitDay: missed ? 3 : int(6, 12) }];
    const woundCare = chance(0.3) ? { woundCare: { instructions: 'synthetic wound check', checkDay: int(2, 5) } } : {};

    // Medication-level injections need a medicine that is not in the plan.
    const active = () => meds.filter((m) => m.action !== 'STOP');
    const notInPlan = DRUGS.filter((d) => !used.has(d.id));
    let duplicateDrug: string | undefined;
    let unlistedDrug: string | undefined;
    if (types.includes('DUPLICATE_THERAPY')) {
      const pairs = active().flatMap((m) => notInPlan.filter((d) => findDuplicates(m.drugId, d.id)).map((d) => d.id));
      if (pairs.length === 0) {
        // No plan medicine has a possible duplicate: add one that does.
        const [x, y] = (
          [
            ['apixaban', 'rivaroxaban'],
            ['omeprazole', 'esomeprazole'],
            ['tramadol', 'morphine'],
          ] as const
        ).find(([a, b]) => !used.has(a) && !used.has(b)) ?? ['aspirin', 'clopidogrel'];
        meds.push(med('CONTINUE', x));
        used.add(x);
        duplicateDrug = y;
      } else {
        duplicateDrug = pick(pairs);
      }
      used.add(duplicateDrug);
    }
    if (types.includes('UNLISTED_MED')) {
      const free = DRUGS.filter((d) => !used.has(d.id) && !active().some((m) => findDuplicates(m.drugId, d.id)));
      unlistedDrug = pick(free).id;
      used.add(unlistedDrug);
    }

    const patient: Patient = {
      id,
      nameEn: `Synthetic ${id}`,
      nameAr: 'مريض افتراضي',
      age: int(45, 85),
      sex: chance(0.5) ? 'M' : 'F',
      plan: { patientId: id, hospital: 'Synthetic hospital', diagnosisLabel: 'Synthetic case', meds, labs, followUps, ...woundCare },
    };
    const tasks = buildCareGraph(patient);

    // Clean evidence: every task is confirmed on its deadline day by the right source.
    let n = 0;
    const ev = (fields: Partial<Evidence> & Pick<Evidence, 'source' | 'day' | 'claim'>): Evidence => ({
      id: `${id}-e${++n}`,
      patientId: id,
      confidence: 1,
      confirmedByHuman: false,
      ...fields,
    });
    const clean = (t: CareTask): Evidence => {
      if (t.type === 'LAB_DONE') return ev({ taskId: t.id, source: 'lab_system', day: t.deadlineDay, claim: 'DONE' });
      if (t.type === 'FOLLOWUP_BOOKED' || t.type === 'FOLLOWUP_ATTENDED') return ev({ taskId: t.id, source: 'appointment_system', day: t.deadlineDay, claim: 'DONE' });
      return ev({ taskId: t.id, source: 'patient_app', day: t.deadlineDay, claim: t.type === 'MED_STOP' ? 'STOPPED' : 'DONE', confidence: 0.95 });
    };
    const evidence = new Map(tasks.map((t) => [t.id, [clean(t)]]));
    const extra: Evidence[] = [];
    const expected: ExpectedGap[] = [];
    const taskOf = (type: CareTask['type']) => tasks.find((t) => t.type === type) as CareTask;

    for (const type of types) {
      switch (type) {
        case 'NOT_STARTED': {
          const t = taskOf('MED_START');
          evidence.set(t.id, [ev({ taskId: t.id, source: 'patient_voice', day: 1, claim: 'NOT_DONE', confidence: between(0.75, 0.98) })]);
          // A medicine that was never started has no "still taking it" answers either.
          for (const c of tasks.filter((x) => x.type === 'MED_CONTINUE' && x.refId === t.refId)) evidence.delete(c.id);
          expected.push({ type, key: t.id });
          break;
        }
        case 'LOW_CONFIDENCE': {
          const t = taskOf('MED_START');
          evidence.set(t.id, [ev({ taskId: t.id, source: 'patient_voice', day: 1, claim: 'DONE', confidence: between(0.3, 0.69) })]);
          expected.push({ type, key: t.id });
          break;
        }
        case 'NO_RESPONSE': {
          const t = taskOf('MED_START');
          evidence.delete(t.id);
          expected.push({ type, key: t.id });
          break;
        }
        case 'STOPPED_STILL_TAKEN': {
          const t = taskOf('MED_STOP');
          evidence.set(t.id, [ev({ taskId: t.id, source: chance(0.5) ? 'family' : 'patient_voice', day: int(1, 2), claim: 'STILL_TAKING', confidence: between(0.75, 0.98) })]);
          expected.push({ type, key: t.id });
          break;
        }
        case 'WRONG_DOSE': {
          const t = taskOf('MED_DOSE_CHANGE');
          evidence.set(t.id, [ev({ taskId: t.id, source: 'patient_voice', day: 1, claim: 'OLD_DOSE', confidence: between(0.75, 0.98) })]);
          expected.push({ type, key: t.id });
          break;
        }
        case 'DUPLICATE_THERAPY':
          extra.push(ev({ source: 'patient_voice', day: int(1, 3), claim: 'TAKING_UNLISTED', drugId: duplicateDrug as string, confidence: between(0.5, 0.95) }));
          expected.push({ type, key: duplicateDrug as string });
          break;
        case 'UNLISTED_MED':
          extra.push(ev({ source: 'patient_voice', day: int(1, 3), claim: 'TAKING_UNLISTED', drugId: unlistedDrug as string, confidence: between(0.5, 0.95) }));
          expected.push({ type, key: unlistedDrug as string });
          break;
        case 'LAB_MISSED': {
          const t = taskOf('LAB_DONE');
          // Sometimes the patient says it was done, but no result ever arrives from the lab.
          evidence.set(t.id, chance(0.5) ? [ev({ taskId: t.id, source: 'patient_app', day: t.deadlineDay, claim: 'DONE', confidence: 0.95 })] : []);
          expected.push({ type, key: t.id });
          break;
        }
        case 'FOLLOWUP_NOT_BOOKED': {
          const t = taskOf('FOLLOWUP_BOOKED');
          evidence.set(t.id, chance(0.5) ? [ev({ taskId: t.id, source: 'family', day: t.deadlineDay, claim: 'DONE', confidence: 0.9 })] : []);
          expected.push({ type, key: t.id });
          break;
        }
        case 'FOLLOWUP_MISSED': {
          const t = taskOf('FOLLOWUP_ATTENDED');
          evidence.set(t.id, [ev({ taskId: t.id, source: 'appointment_system', day: t.deadlineDay, claim: 'NOT_DONE' })]);
          expected.push({ type, key: t.id });
          break;
        }
      }
    }

    return { id, kind, patient, evidence: [...[...evidence.values()].flat(), ...extra], expected, evalDay: EVAL_DAY };
  };

  // 5 scenarios per gap type; about a third get a second, independent gap.
  const SECOND: GapType[] = ['UNLISTED_MED', 'LAB_MISSED', 'FOLLOWUP_NOT_BOOKED'];
  for (let i = 0; i < INJECTED_SCENARIOS; i++) {
    const primary = GAP_TYPES[i % GAP_TYPES.length] as GapType;
    const types = [primary];
    if (chance(0.33)) {
      const second = pick(SECOND);
      // FOLLOWUP_NOT_BOOKED and FOLLOWUP_MISSED cannot be combined (a missed visit was booked).
      if (second !== primary && !(second === 'FOLLOWUP_NOT_BOOKED' && primary === 'FOLLOWUP_MISSED')) types.push(second);
    }
    scenarios.push(build(i, 'injected', types));
  }
  for (let i = 0; i < CLEAN_CONTROLS; i++) scenarios.push(build(i, 'control', []));
  return scenarios;
}

// ── evaluation ──────────────────────────────────────────────────────────────

const keyOf = (g: Gap) => g.taskId ?? g.drugId ?? g.id;
const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((1000 * n) / d) / 10);

export interface GapDetectionReport {
  seed: number;
  scenarios: number;
  controls: number;
  expectedGaps: number;
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  recallPct: number;
  precisionPct: number;
  perType: Record<GapType, { expected: number; detected: number; recallPct: number }>;
  controlDaysChecked: number;
  controlsWithFalsePositives: number;
  falsePositivesOnControls: number;
  highRiskGaps: number;
  highRiskRoutedNow: number;
  highRiskRoutedNowPct: number;
  misses: { scenario: string; type: GapType; key: string }[];
  unexpected: { scenario: string; type: GapType; key: string }[];
}

export function runGapDetection(scenarios: readonly Scenario[], seed: number = SCENARIO_SEED): GapDetectionReport {
  const perType = Object.fromEntries(GAP_TYPES.map((t) => [t, { expected: 0, detected: 0, recallPct: 0 }])) as GapDetectionReport['perType'];
  const misses: GapDetectionReport['misses'] = [];
  const unexpected: GapDetectionReport['unexpected'] = [];
  let tp = 0;
  let controlsWithFp = 0;
  let fpOnControls = 0;
  let controlDays = 0;
  const allGaps: Gap[] = [];

  for (const s of scenarios) {
    const tasks = buildCareGraph(s.patient);
    if (s.kind === 'control') {
      // A clean case must stay quiet on every day of the follow-up window.
      const seen = new Set<string>();
      for (let day = 0; day <= FOLLOW_UP_DAYS; day++) {
        controlDays++;
        for (const g of evaluate(s.patient, tasks, s.evidence, [], day).gaps) {
          if (!seen.has(g.id)) {
            seen.add(g.id);
            allGaps.push(g);
            unexpected.push({ scenario: s.id, type: g.type, key: keyOf(g) });
          }
        }
      }
      if (seen.size > 0) controlsWithFp++;
      fpOnControls += seen.size;
      continue;
    }

    const gaps = evaluate(s.patient, tasks, s.evidence, [], s.evalDay).gaps;
    allGaps.push(...gaps);
    for (const e of s.expected) {
      perType[e.type].expected++;
      if (gaps.some((g) => g.type === e.type && keyOf(g) === e.key)) {
        perType[e.type].detected++;
        tp++;
      } else {
        misses.push({ scenario: s.id, ...e });
      }
    }
    for (const g of gaps) {
      if (!s.expected.some((e) => e.type === g.type && e.key === keyOf(g))) unexpected.push({ scenario: s.id, type: g.type, key: keyOf(g) });
    }
  }

  for (const t of GAP_TYPES) perType[t].recallPct = pct(perType[t].detected, perType[t].expected);
  const expectedGaps = GAP_TYPES.reduce((n, t) => n + perType[t].expected, 0);
  const fp = unexpected.length;
  const high = allGaps.filter((g) => g.risk === 'high');
  const highNow = high.filter((g) => g.route === 'CLINICIAN_NOW').length;

  return {
    seed,
    scenarios: scenarios.filter((s) => s.kind === 'injected').length,
    controls: scenarios.filter((s) => s.kind === 'control').length,
    expectedGaps,
    truePositives: tp,
    falseNegatives: expectedGaps - tp,
    falsePositives: fp,
    recallPct: pct(tp, expectedGaps),
    precisionPct: pct(tp, tp + fp),
    perType,
    controlDaysChecked: controlDays,
    controlsWithFalsePositives: controlsWithFp,
    falsePositivesOnControls: fpOnControls,
    highRiskGaps: high.length,
    highRiskRoutedNow: highNow,
    highRiskRoutedNowPct: pct(highNow, high.length),
    misses,
    unexpected,
  };
}

export interface QuestionReductionReport {
  patientDays: number;
  adaptiveQuestions: number;
  fullScriptQuestions: number;
  reductionPct: number;
  adaptivePerPatientDay: number;
  fullScriptPerPatientDay: number;
  minutesPerQuestionAssumed: number;
  minutesSavedPerPatientDay: number;
}

/** Adaptive check-in vs the full phone script, over every scenario and every day 0–14. */
export function runQuestionReduction(scenarios: readonly Scenario[]): QuestionReductionReport {
  let adaptive = 0;
  let baseline = 0;
  let patientDays = 0;
  for (const s of scenarios) {
    const tasks = buildCareGraph(s.patient);
    for (let day = 0; day <= FOLLOW_UP_DAYS; day++) {
      const { taskStatus } = evaluate(s.patient, tasks, s.evidence, [], day);
      const plan = planQuestions(s.patient, tasks, s.evidence, taskStatus, day);
      adaptive += plan.questions.length;
      baseline += plan.baseline.length;
      patientDays++;
    }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    patientDays,
    adaptiveQuestions: adaptive,
    fullScriptQuestions: baseline,
    reductionPct: pct(baseline - adaptive, baseline),
    adaptivePerPatientDay: r1(adaptive / patientDays),
    fullScriptPerPatientDay: r1(baseline / patientDays),
    minutesPerQuestionAssumed: MINUTES_PER_QUESTION,
    minutesSavedPerPatientDay: r1(((baseline - adaptive) / patientDays) * MINUTES_PER_QUESTION),
  };
}




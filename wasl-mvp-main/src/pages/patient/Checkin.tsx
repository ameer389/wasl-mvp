import { Keyboard, Loader2, Mic, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFamilyMode } from '../../components/patient/familyMode';
import HumainVoice from '../../components/patient/HumainVoice';
import { Button, Card, focusRing, textareaClasses } from '../../components/ui';
import { parseAnswer, type ParseResult } from '../../domain/arabicParser';
import { VERIFY_THRESHOLD } from '../../domain/medicationEvidence';
import { confirmTranscript, interpretSpeech } from '../../domain/speechAnswer';
import {
  QUICK_OPTIONS,
  VOICE_ERROR_AR,
  answerAuditNote,
  checkinReducer,
  evidenceForAnswer,
  gapsFromAnswers,
  initialCheckin,
  needsHuman,
  openMedsOutcome,
  quickParse,
  withKeptMeds,
  type AnswerMode,
  type CheckinRecord,
} from '../../domain/checkin';
import { echoAr, medNameAr } from '../../domain/patientPhrasing';
import type { Patient, Question } from '../../domain/types';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { toArabicDigits } from '../../lib/arabicDigits';
import { cn } from '../../lib/cn';
import { patientCheckinFlowPath, patientCheckinPath } from '../../routes';
import { DEMO_STORAGE_KEY } from '../../state/persistence';
import { useDemoStore, usePatient, useQuestionPlan } from '../../state/store';
import { readStored } from '../../lib/storage';
import { createHybridCheckin, type HybridProposal } from '../../voice/hybridCheckin';
import { voiceExperimentEnabled } from '../../voice/humain';

const NURSE_LINE = 'الجواب يحتاج مراجعة داخل العرض التجريبي';

function QuestionHeader({ q, index, total, family }: { q: Question; index: number; total: number; family: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">
          سؤال {toArabicDigits(index + 1)} من {toArabicDigits(total)}
        </span>
        {/* Full-width track; the fill is pinned to the start edge (right in RTL) and grows towards the end. */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-label="تقدّم الأسئلة"
          className="relative h-2 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>
      <h1 className="text-2xl leading-snug font-bold">{family ? q.familyTextAr : q.textAr}</h1>
      {q.helperAr && <p className="text-sm text-muted">{q.helperAr}</p>}
      {q.doseAsWritten && (
        <p className="text-sm text-muted">
          الجرعة الجديدة في ورقة الخروج:{' '}
          <bdi dir="ltr" className="font-sans text-ink-2">
            {q.doseAsWritten}
          </bdi>
        </p>
      )}
    </div>
  );
}

function MedChips({
  meds,
  ambiguous,
  onRemoveMed,
  onRemoveMention,
}: {
  meds: string[];
  ambiguous: { text: string }[];
  onRemoveMed?: (id: string) => void;
  onRemoveMention?: (i: number) => void;
}) {
  if (meds.length === 0 && ambiguous.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="الأدوية اللي فهمناها">
      {meds.map((m) => (
        <li key={m} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong bg-surface-2 ps-4 pe-2 text-lg">
          {medNameAr(m)}
          {onRemoveMed && (
            <button type="button" aria-label={`شيل ${medNameAr(m)}`} onClick={() => onRemoveMed(m)} className={cn('rounded-full p-2 text-muted hover:text-ink', focusRing)}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
      {ambiguous.map((m, i) => (
        <li key={m.text + i} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface-2 ps-4 pe-2 text-lg">
          {m.text}؟
          {onRemoveMention && (
            <button type="button" aria-label={`شيل ${m.text}`} onClick={() => onRemoveMention(i)} className={cn('rounded-full p-2 text-muted hover:text-ink', focusRing)}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function DoneView({ records, patient, gapCount, moreToday, onHome }: { records: CheckinRecord[]; patient: Patient; gapCount: number; moreToday: boolean; onHome: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 px-5 py-8 text-center">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" className="text-success">
        <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="6" />
        <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray="277" style={{ '--draw-length': 277 } as CSSProperties} className="motion-safe:animate-[draw_700ms_ease-out_both]" />
        <path d="M30 50 l12 12 l24 -26" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" style={{ '--draw-length': 60 } as CSSProperties} className="motion-safe:animate-[draw_500ms_300ms_ease-out_both]" />
      </svg>
      <h1 className="text-2xl font-bold">شكراً، خلّصنا ✔</h1>
      {records.length > 0 && (
        <Card className="w-full text-start">
          <h2 className="mb-2 text-sm text-muted">اللي سجّلناه اليوم</h2>
          <ul className="flex flex-col gap-2 text-lg">
            {records.map((r) => (
              <li key={r.questionId} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 text-success">
                  ✓
                </span>
                <span>
                  {r.summaryAr}
                  {r.needsHuman && <span className="block text-sm text-muted">{NURSE_LINE}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {gapCount > 0 && <p className="text-lg leading-relaxed text-ink-2">فيه نقطة تحتاج مراجعة الفريق الطبي</p>}
      <p className="text-base text-muted">{moreToday ? 'فيه أسئلة إضافية تقدر تجاوب عليها اليوم' : 'التشييك الجاي بكرة إن شاء الله'}</p>
      <Button variant="primary" size="lg" fullWidth onClick={onHome}>
        رجوع للرئيسية
      </Button>
      <p className="sr-only">{patient.nameAr}</p>
    </div>
  );
}

export default function Checkin() {
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const patient = usePatient(id);
  const { state } = useDemoStore();
  const { family } = useFamilyMode();
  const hybrid = params.get('voice') === 'humain' && voiceExperimentEnabled(import.meta.env.VITE_HUMAIN_VOICE_ENABLED, window.location);
  const patientInstance = useMemo(() => (hybrid && patient ? crypto.randomUUID() : ''), [hybrid, patient]);
  const key = hybrid ? `${patientInstance}:${state.simulatedDay}:${family}` : id;
  return <PatientCheckin key={key} id={id} hybrid={hybrid} />;
}

function PatientCheckin({ id, hybrid }: { id: string; hybrid: boolean }) {
  const navigate = useNavigate();
  const patient = usePatient(id);
  const store = useDemoStore();
  const plan = useQuestionPlan(id);
  const { family } = useFamilyMode();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Snapshot today's questions: the live plan shrinks as answers come in.
  const [questions] = useState<Question[]>(() => plan?.questions ?? []);
  const [state, dispatch] = useReducer(checkinReducer, questions.length, initialCheckin);
  const [text, setText] = useState('');
  const q = questions[state.index];
  const qRef = useRef(q);
  qRef.current = q;
  const submitted = useRef(new Set<string>());
  const presented = useRef(new Set<string>());
  const presentationStart = useRef(new Map<string, number>());
  const day = store.patientToday(id);
  const voice = family ? 'family' : 'patient';
  const actor = family ? 'Family (patient app)' : 'Patient app';
  const latest = useRef({ state, q, store });
  latest.current = { state, q, store };
  const active = useRef<ReturnType<typeof createHybridCheckin> | undefined>(undefined);
  const proposal = useRef<HybridProposal | undefined>(undefined);
  const [clarify, setClarify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const pendingWrite = useRef<{
    at: string; auditStart: number; target: string; globalDay: number;
    record: CheckinRecord; proposal: HybridProposal; session: ReturnType<typeof createHybridCheckin>;
  } | undefined>(undefined);

  const speech = useSpeechRecognition({
    onInterim: (t) => dispatch({ type: 'LISTEN_INTERIM', text: t }),
    onFinal: (alternatives) => {
      const cur = qRef.current;
      const understood = cur ? interpretSpeech(alternatives, { questionKind: cur.kind, drugId: cur.drugId, taskType: cur.taskType }) : undefined;
      dispatch({ type: 'LISTEN_FINAL', text: understood?.text ?? '', parse: understood?.parse });
    },
    onError: (error) => dispatch({ type: 'LISTEN_ERROR', error }),
  });

  useEffect(() => {
    if (state.phase !== 'question' || !q || presented.current.has(q.id)) return;
    presented.current.add(q.id);
    presentationStart.current.set(q.id, store.state.audit.length);
    store.recordPresentation(id, q.taskId ?? id, actor);
  }, [state.phase, q, store, id, actor]);

  // understanding → echo (brief, so the person sees we are working on it)
  useEffect(() => {
    if (state.phase !== 'understanding' || !state.answer || !q) return;
    const answer = state.answer;
    const t = setTimeout(
      () => dispatch({ type: 'PARSED', parse: answer.recognitionParse ?? parseAnswer(answer.text, { questionKind: q.kind, drugId: q.drugId, taskType: q.taskType }) }),
      reduceMotion ? 0 : 450,
    );
    return () => clearTimeout(t);
  }, [state.phase, state.answer, q, reduceMotion]);

  // saved → next question
  useEffect(() => {
    if (state.phase !== 'saved') return;
    const t = setTimeout(() => dispatch({ type: 'NEXT' }), state.records.at(-1)?.needsHuman ? 1600 : 900);
    return () => clearTimeout(t);
  }, [state.phase, state.records]);

  // done → record completion once
  const completed = useRef(false);
  useEffect(() => {
    if (state.phase !== 'done' || completed.current || !patient) return;
    completed.current = true;
    store.completeCheckin(patient.id, actor, `${state.records.length} answers`);
  }, [state.phase, state.records.length, patient, actor, store]);

  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => {
      const write = pendingWrite.current;
      if (!write) return;
      const rows = latest.current.store.state.audit.slice(write.auditStart);
      const row = rows.find((entry) => entry.action === 'CHECKIN_ANSWER' && entry.day === write.globalDay &&
        entry.target === write.target && entry.at === write.at);
      const stored = readStored<Pick<typeof store.state, 'audit'> | null>(DEMO_STORAGE_KEY, null);
      const persisted = row && Array.isArray(stored?.audit) && stored.audit.some(
        (entry) => entry.id === row.id && entry.at === row.at && entry.target === row.target,
      );
      write.session.finish(write.proposal, !!persisted);
      pendingWrite.current = undefined;
      proposal.current = undefined;
      setSaving(false);
      if (row) dispatch({ type: 'SAVED', record: write.record });
      else {
        submitted.current.delete(write.record.questionId);
        dispatch({ type: 'RETRY' });
      }
      setRecordingError(persisted ? '' : 'ما قدرنا نؤكد حفظ الجواب في المتصفح.');
    }, 0);
    return () => clearTimeout(timer);
  }, [saving, store.state.audit]);

  function currentPresentation() {
    const view = latest.current;
    if (!view.q || (view.state.phase !== 'question' && view.state.phase !== 'echo')) return;
    const from = presentationStart.current.get(view.q.id);
    if (from === undefined) return;
    const entry = view.store.state.audit.slice(from).filter((a) => a.day === view.store.state.simulatedDay &&
      a.target === (view.q?.taskId ?? id) && (a.action === 'CHECKIN_PRESENTED' || a.action === 'CHECKIN_ANSWER')).at(-1);
    if (entry?.action === 'CHECKIN_PRESENTED') return entry;
  }

  function beginConversation() {
    const session = createHybridCheckin(
      () => {
        const question = latest.current.q;
        const entry = currentPresentation();
        return question && entry ? { question, day, family, presentationId: entry.id } : undefined;
      },
      (answer) => {
        proposal.current = answer;
        setClarify(false);
        dispatch({ type: 'PROPOSE_VOICE', text: answer.transcript, parse: answer.parse });
      },
      () => setClarify(true),
    );
    active.current = session;
    return {
      context: { tools: session.tools },
      message: session.transcript,
      connected: () => {
        if (active.current === session && latest.current.state.phase === 'intro') dispatch({ type: 'START' });
      },
      ended: () => {
        session.close();
        if (active.current !== session) return;
        active.current = undefined;
        setClarify(false);
        if (proposal.current && !pendingWrite.current) {
          proposal.current = undefined;
          dispatch({ type: 'RETRY' });
        }
      },
    };
  }

  function retry() {
    if (saving) return;
    if (proposal.current) active.current?.reject(proposal.current);
    proposal.current = undefined;
    dispatch({ type: 'RETRY' });
  }

  if (!patient) return <p className="p-6 text-lg text-muted">ما لقينا هالمريض في العرض التجريبي.</p>;

  const sayBack = (parse: ParseResult) => {
    if (!q) return '';
    if (parse.extractionDiscarded) return 'صحّحت الأسماء اللي فهمناها';
    if (q.kind === 'OPEN_MEDS' && parse.statements?.length) {
      return parse.statements.map((s) => {
        const name = s.drugIds.length === 1 ? medNameAr(s.drugIds[0]!) : s.text;
        if (s.use === 'current') return `ذكرت استخدام ${name}`;
        if (s.use === 'not_current') return `ذكرت إن ${name} مو مستخدم الحين`;
        if (s.use === 'historical') return `ذكرت استخدام سابق لـ${name}`;
        return `الاستخدام مو واضح لـ${name}`;
      }).join('، ');
    }
    return echoAr(q.kind, parse.intent, q.medNameAr, patient, voice);
  };

  const save = (parse: ParseResult, mode: AnswerMode, rawText: string, transcriptConfirmed = false) => {
    if (!q || submitted.current.has(q.id)) return;
    const answer = proposal.current;
    const session = active.current;
    const presentation = answer ? currentPresentation() : undefined;
    if (hybrid && (!answer || !session || !presentation || state.answer !== latest.current.state.answer ||
        presentation.id !== answer.bound.presentationId || !session.confirm(answer))) return;
    submitted.current.add(q.id);
    const evidence = evidenceForAnswer({ question: q, parse, rawText, mode, family, patientId: patient.id, day, transcriptConfirmed, idPrefix: `ans-${patient.id}-${hybrid ? crypto.randomUUID() : Date.now().toString(36)}` });
    const record = { questionId: q.id, ...(q.taskId ? { taskId: q.taskId } : {}), summaryAr: sayBack(parse), evidenceIds: evidence.map((e) => e.id), needsHuman: needsHuman(transcriptConfirmed ? confirmTranscript(parse) : parse) };
    const target = q.taskId ?? patient.id;
    const at = store.recordAnswer(patient.id, evidence, {
      actor,
      target,
      note: answerAuditNote(evidence, mode, family, parse.extractionDiscarded ? rawText : undefined),
      ...(presentation ? { presentation } : {}),
      ...(q.kind === 'OPEN_MEDS' ? { openMedsOutcome: openMedsOutcome(parse, evidence) } : {}),
    });
    if (hybrid && answer && session) {
      pendingWrite.current = { at, auditStart: store.state.audit.length, target, globalDay: store.state.simulatedDay, record, proposal: answer, session };
      setSaving(true);
    } else dispatch({ type: 'SAVED', record });
    setText('');
  };

  const renderCheckin = () => {
  // ── intro ──
  if (state.phase === 'intro') {
    if (!questions.length) return (
      <div className="flex flex-col gap-6 px-5 py-8">
        <h1 className="text-2xl leading-snug font-bold">ما فيه أسئلة إضافية اليوم</h1>
        <Button variant="primary" size="lg" fullWidth onClick={() => navigate(patientCheckinPath(id))}>رجوع للرئيسية</Button>
      </div>
    );
    return (
      <div className="flex flex-col gap-6 px-5 py-8">
        <h1 className="text-2xl leading-snug font-bold">
          عندنا {toArabicDigits(questions.length)} أسئلة بسيطة، تقدر تجاوب بصوتك أو بالأزرار
        </h1>
        {family && <p className="text-lg text-muted">الأسئلة عن {patient.nameAr}، وأجوبتك تنحفظ إنها من الأهل.</p>}
        {!hybrid && <Button variant="primary" size="lg" fullWidth onClick={() => dispatch({ type: 'START' })}>
          ابدأ
        </Button>}
        <Button variant="ghost" size="lg" fullWidth onClick={() => navigate(patientCheckinPath(id))}>
          بعدين
        </Button>
      </div>
    );
  }

  // ── done ──
  if (state.phase === 'done') {
    const evidenceIds = state.records.flatMap((r) => r.evidenceIds);
    const taskIds = state.records.flatMap((r) => (r.taskId ? [r.taskId] : []));
    const gapCount = gapsFromAnswers(store.evaluation.gapsByPatient[patient.id] ?? [], evidenceIds, taskIds).length;
    return <DoneView records={state.records} patient={patient} gapCount={gapCount} moreToday={!!plan?.questions.length} onHome={() => navigate(patientCheckinPath(id))} />;
  }

  if (!q) return null;
  const quick = QUICK_OPTIONS[q.kind];

  // ── saved ──
  if (state.phase === 'saved') {
    const last = state.records.at(-1);
    return (
      <div role="status" className="flex flex-col items-center gap-4 px-5 py-16 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-4xl text-success" aria-hidden="true">
          ✓
        </span>
        <p className="text-2xl font-bold">{recordingError ? 'الحفظ غير مؤكد' : 'تم'}</p>
        {last?.needsHuman && <p className="text-lg text-muted">{NURSE_LINE}</p>}
      </div>
    );
  }

  // ── echo ──
  if (state.phase === 'echo' && state.answer?.parse) {
    const { parse, keptMeds, keptAmbiguous, text: said, mode } = state.answer;
    const effective = q.kind === 'OPEN_MEDS' ? withKeptMeds(parse, keptMeds, keptAmbiguous) : parse;
    const unsure = parse.intent === 'UNSURE' && !parse.speech?.conflict;
    const understood = effective.extractionDiscarded || (!unsure && parse.intent !== 'UNKNOWN' && confirmTranscript(effective).confidence >= VERIFY_THRESHOLD);
    const chips = q.kind === 'OPEN_MEDS' && (
      <MedChips
        meds={keptMeds}
        ambiguous={keptAmbiguous}
        onRemoveMed={saving ? undefined : (drugId) => dispatch({ type: 'REMOVE_MED', drugId })}
        onRemoveMention={saving ? undefined : (i) => dispatch({ type: 'REMOVE_MED', mention: keptAmbiguous[i] })}
      />
    );
    return (
      <div className="flex flex-col gap-5 px-5 py-6">
        <QuestionHeader q={q} index={state.index} total={state.total} family={family} />
        <Card padding="lg" className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            قلت: <span className="text-ink-2">«{said}»</span>
          </p>
          {understood ? (
            <>
              <p className="text-2xl leading-snug font-bold">فهمت إنك: {sayBack(effective)}</p>
              {mode === 'voice' && parse.speech?.recognitionConfidence === undefined && <p className="text-sm text-muted">تأكد إن النص فوق يطابق كلامك.</p>}
              {chips}
              <Button variant="primary" size="lg" fullWidth disabled={saving} onClick={() => save(effective, mode, said, mode === 'voice')}>
                إيه صح
              </Button>
              <Button size="lg" fullWidth disabled={saving} icon={<RotateCcw size={20} aria-hidden="true" />} onClick={retry}>
                لا، أعيد
              </Button>
            </>
          ) : unsure ? (
            <>
              <p className="text-2xl leading-snug font-bold">فهمت إنك {echoAr(q.kind, 'UNSURE', undefined, patient, voice)}، ما يخالف</p>
              <p className="text-lg text-muted">{NURSE_LINE}</p>
              {chips}
              <Button variant="primary" size="lg" fullWidth disabled={saving} onClick={() => save(effective, mode, said)}>
                إيه صح
              </Button>
              <Button size="lg" fullWidth disabled={saving} icon={<RotateCcw size={20} aria-hidden="true" />} onClick={retry}>
                لا، أعيد
              </Button>
            </>
          ) : (
            <>
              <p className="text-2xl leading-snug font-bold">{parse.speech?.conflict ? 'طلع لنا أكثر من معنى لكلامك. عِد الجواب أو اختر من الأزرار.' : 'ما فهمت عليك زين 🙏'}</p>
              {chips}
              <Button variant="primary" size="lg" fullWidth disabled={saving} icon={<RotateCcw size={20} aria-hidden="true" />} onClick={retry}>
                أعيد
              </Button>
              <div className="flex flex-col gap-3">
                {!hybrid && quick.map((o) => (
                  <Button key={o.id} size="lg" fullWidth onClick={() => save(quickParse(o), 'button', o.labelAr)}>
                    {o.labelAr}
                  </Button>
                ))}
              </div>
              <button type="button" disabled={saving} onClick={() => save(effective, mode, said)} className={cn('min-h-12 rounded-lg text-lg text-muted underline underline-offset-4 hover:text-ink', focusRing)}>
                خلّه كذا
              </button>
              <p className="text-sm text-faint">لو خليته كذا، {NURSE_LINE}.</p>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (hybrid) return (
    <div className="flex flex-col gap-3 px-5 py-6">
      <QuestionHeader q={q} index={state.index} total={state.total} family={family} />
      {clarify && <p role="status" className="text-sm text-medium">الجواب يحتاج توضيح. وضّح قصدك أو قل إنك مو متأكد.</p>}
    </div>
  );

  // ── question / listening / understanding ──
  const listening = state.phase === 'listening';
  const understanding = state.phase === 'understanding';
  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <QuestionHeader q={q} index={state.index} total={state.total} family={family} />

      {understanding ? (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-5 text-lg">
          <Loader2 size={22} aria-hidden="true" className="motion-safe:animate-spin" />
          لحظة… قاعد أفهم جوابك
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {quick.map((o) => (
              <Button key={o.id} size="lg" fullWidth onClick={() => {
                if (listening) { speech.cancel(); dispatch({ type: 'LISTEN_CANCEL' }); }
                save(quickParse(o), 'button', o.labelAr);
              }}>
                {o.labelAr}
              </Button>
            ))}
          </div>

          {speech.supported ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                aria-pressed={listening}
                aria-label={listening ? 'وقّف التسجيل' : 'اضغط وتكلم'}
                onClick={() => {
                  if (listening) speech.stop();
                  else {
                    dispatch({ type: 'LISTEN_START' });
                    speech.start();
                  }
                }}
                className={cn(
                  'relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-colors duration-150',
                  focusRing,
                  listening ? 'border-accent bg-accent text-bg' : 'border-accent/60 bg-surface-2 text-accent hover:bg-surface-3',
                )}
              >
                {listening && <span aria-hidden="true" className="absolute inset-0 rounded-full ring-4 ring-accent/40 motion-safe:animate-ping" />}
                {listening ? <Square size={30} aria-hidden="true" /> : <Mic size={36} aria-hidden="true" />}
              </button>
              <span className="text-lg">{listening ? 'أسمعك… اضغط لما تخلص' : 'اضغط وتكلم'}</span>
              {listening && <Button variant="ghost" size="lg" onClick={() => { speech.cancel(); dispatch({ type: 'LISTEN_CANCEL' }); }}>ألغي التسجيل</Button>}
              {listening && (
                <p aria-live="polite" className="min-h-8 text-center text-xl text-ink-2">
                  {state.transcript || '…'}
                </p>
              )}
            </div>
          ) : null}

          {(state.error || !speech.supported) && (
            <p role="status" className="rounded-xl border border-line bg-surface-1 p-4 text-lg text-ink-2">
              {VOICE_ERROR_AR[state.error ?? 'unsupported']}
            </p>
          )}

          {(
            <div className="flex flex-col gap-3">
              <button
                type="button"
                aria-expanded={state.textOpen}
                onClick={() => {
                  if (listening) { speech.cancel(); dispatch({ type: 'LISTEN_CANCEL' }); }
                  dispatch({ type: 'TOGGLE_TEXT' });
                }}
                className={cn('inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-lg text-muted underline-offset-4 hover:text-ink hover:underline', focusRing)}
              >
                <Keyboard size={20} aria-hidden="true" />
                أو اكتب جوابك
              </button>
              {state.textOpen && !listening && (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    dispatch({ type: 'SUBMIT_TEXT', text });
                  }}
                >
                  <label htmlFor="answer-text" className="sr-only">
                    جوابك
                  </label>
                  <textarea
                    id="answer-text"
                    dir="rtl"
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="اكتب جوابك هنا"
                    className={cn(textareaClasses, 'font-arabic text-lg')}
                  />
                  <Button type="submit" variant="primary" size="lg" fullWidth disabled={!text.trim()}>
                    أرسل
                  </Button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
  };

  if (!hybrid) return renderCheckin();
  return (
    <>
      {renderCheckin()}
      <div className="flex flex-col gap-3 px-5 pb-6">
        {recordingError && <p role="alert" className="text-sm text-medium">{recordingError}</p>}
        {questions.length > 0 && <HumainVoice begin={beginConversation} finished={state.phase === 'done'} />}
        <Link className="underline text-muted" to={patientCheckinFlowPath(id)}>استخدم التشييك المعتاد</Link>
      </div>
    </>
  );
}

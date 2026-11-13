import { Keyboard, Loader2, Mic, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFamilyMode } from '../../components/patient/familyMode';
import { Button, Card, focusRing, textareaClasses } from '../../components/ui';
import { parseAnswer, type ParseResult } from '../../domain/arabicParser';
import {
  QUICK_OPTIONS,
  VOICE_ERROR_AR,
  answerAuditNote,
  checkinReducer,
  evidenceForAnswer,
  gapsFromAnswers,
  initialCheckin,
  needsHuman,
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
import { patientCheckinPath } from '../../routes';
import { useDemoStore, usePatient, useQuestionPlan } from '../../state/store';

const NURSE_LINE = 'بنخلي الممرضة تتأكد منك';

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

function DoneView({ records, patient, gapCount, onHome }: { records: CheckinRecord[]; patient: Patient; gapCount: number; onHome: () => void }) {
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
      {gapCount > 0 && <p className="text-lg leading-relaxed text-ink-2">فيه نقطة بيتواصل معك الفريق الطبي بخصوصها</p>}
      <p className="text-base text-muted">التشييك الجاي بكرة إن شاء الله</p>
      <Button variant="primary" size="lg" fullWidth onClick={onHome}>
        رجوع للرئيسية
      </Button>
      <p className="sr-only">{patient.nameAr}</p>
    </div>
  );
}

export default function Checkin() {
  const { id = '' } = useParams<{ id: string }>();
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
  const day = store.patientToday(id);
  const voice = family ? 'family' : 'patient';

  const speech = useSpeechRecognition({
    onInterim: (t) => dispatch({ type: 'LISTEN_INTERIM', text: t }),
    onFinal: (alternatives) => {
      // Of the recogniser's alternatives, keep the one the parser understands best.
      const cur = qRef.current;
      const best = alternatives
        .map((a) => ({ a, conf: cur ? parseAnswer(a.transcript, { questionKind: cur.kind, drugId: cur.drugId, asrConfidence: a.confidence }).confidence : 0 }))
        .sort((x, y) => y.conf - x.conf)[0]?.a;
      dispatch({ type: 'LISTEN_FINAL', text: best?.transcript ?? '', ...(best?.confidence !== undefined ? { asrConfidence: best.confidence } : {}) });
    },
    onError: (error) => dispatch({ type: 'LISTEN_ERROR', error }),
  });

  // understanding → echo (brief, so the person sees we are working on it)
  useEffect(() => {
    if (state.phase !== 'understanding' || !state.answer || !q) return;
    const answer = state.answer;
    const t = setTimeout(
      () => dispatch({ type: 'PARSED', parse: parseAnswer(answer.text, { questionKind: q.kind, drugId: q.drugId, asrConfidence: answer.asrConfidence }) }),
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
    store.completeCheckin(patient.id, family ? 'Family (patient app)' : 'Patient app', `${state.records.length} answers`);
  }, [state.phase, state.records.length, patient, family, store]);

  if (!patient) return <p className="p-6 text-lg text-muted">ما لقينا هالمريض في العرض التجريبي.</p>;

  const save = (parse: ParseResult, mode: AnswerMode, rawText: string) => {
    if (!q) return;
    const evidence = evidenceForAnswer({ question: q, parse, rawText, mode, family, patientId: patient.id, day, idPrefix: `ans-${patient.id}-${Date.now().toString(36)}` });
    store.recordAnswer(patient.id, evidence, {
      actor: family ? 'Family (patient app)' : 'Patient app',
      target: q.taskId ?? patient.id,
      note: answerAuditNote(evidence, mode, family),
    });
    const names = [...parse.meds.map(medNameAr), ...parse.ambiguousMeds.map((m) => m.text)];
    const summary = echoAr(q.kind, parse.intent, q.medNameAr, patient, voice) + (q.kind === 'OPEN_MEDS' && names.length ? `: ${names.join('، ')}` : '');
    dispatch({
      type: 'SAVED',
      record: { questionId: q.id, ...(q.taskId ? { taskId: q.taskId } : {}), summaryAr: summary, evidenceIds: evidence.map((e) => e.id), needsHuman: needsHuman(parse) },
    });
    setText('');
  };

  // ── intro ──
  if (state.phase === 'intro') {
    return (
      <div className="flex flex-col gap-6 px-5 py-8">
        <h1 className="text-2xl leading-snug font-bold">
          عندنا {toArabicDigits(questions.length)} أسئلة بسيطة، تقدر تجاوب بصوتك أو بالأزرار
        </h1>
        {family && <p className="text-lg text-muted">الأسئلة عن {patient.nameAr}، وأجوبتك تنحفظ إنها من الأهل.</p>}
        <Button variant="primary" size="lg" fullWidth onClick={() => dispatch({ type: 'START' })}>
          ابدأ
        </Button>
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
    return <DoneView records={state.records} patient={patient} gapCount={gapCount} onHome={() => navigate(patientCheckinPath(id))} />;
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
        <p className="text-2xl font-bold">تم</p>
        {last?.needsHuman && <p className="text-lg text-muted">{NURSE_LINE}</p>}
      </div>
    );
  }

  // ── echo ──
  if (state.phase === 'echo' && state.answer?.parse) {
    const { parse, keptMeds, keptAmbiguous, text: said, mode } = state.answer;
    const effective = q.kind === 'OPEN_MEDS' ? withKeptMeds(parse, keptMeds, keptAmbiguous) : parse;
    const unsure = parse.intent === 'UNSURE';
    const understood = !unsure && parse.intent !== 'UNKNOWN' && parse.confidence >= 0.7;
    return (
      <div className="flex flex-col gap-5 px-5 py-6">
        <QuestionHeader q={q} index={state.index} total={state.total} family={family} />
        <Card padding="lg" className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            قلت: <span className="text-ink-2">«{said}»</span>
          </p>
          {understood ? (
            <>
              <p className="text-2xl leading-snug font-bold">فهمت إنك: {echoAr(q.kind, parse.intent, q.medNameAr, patient, voice)}</p>
              {q.kind === 'OPEN_MEDS' && (
                <MedChips
                  meds={keptMeds}
                  ambiguous={keptAmbiguous}
                  onRemoveMed={(drugId) => dispatch({ type: 'REMOVE_MED', drugId })}
                  onRemoveMention={(i) => dispatch({ type: 'REMOVE_MED', mention: keptAmbiguous[i] })}
                />
              )}
              <Button variant="primary" size="lg" fullWidth onClick={() => save(effective, mode, said)}>
                إيه صح
              </Button>
              <Button size="lg" fullWidth icon={<RotateCcw size={20} aria-hidden="true" />} onClick={() => dispatch({ type: 'RETRY' })}>
                لا، أعيد
              </Button>
            </>
          ) : unsure ? (
            <>
              <p className="text-2xl leading-snug font-bold">فهمت إنك {echoAr(q.kind, 'UNSURE', undefined, patient, voice)}، ما يخالف</p>
              <p className="text-lg text-muted">{NURSE_LINE}</p>
              <Button variant="primary" size="lg" fullWidth onClick={() => save(effective, mode, said)}>
                إيه صح
              </Button>
              <Button size="lg" fullWidth icon={<RotateCcw size={20} aria-hidden="true" />} onClick={() => dispatch({ type: 'RETRY' })}>
                لا، أعيد
              </Button>
            </>
          ) : (
            <>
              <p className="text-2xl leading-snug font-bold">ما فهمت عليك زين 🙏</p>
              <Button variant="primary" size="lg" fullWidth icon={<RotateCcw size={20} aria-hidden="true" />} onClick={() => dispatch({ type: 'RETRY' })}>
                أعيد
              </Button>
              <div className="flex flex-col gap-3">
                {quick.map((o) => (
                  <Button key={o.id} size="lg" fullWidth onClick={() => save(quickParse(o), 'button', o.labelAr)}>
                    {o.labelAr}
                  </Button>
                ))}
              </div>
              <button type="button" onClick={() => save(effective, mode, said)} className={cn('min-h-12 rounded-lg text-lg text-muted underline underline-offset-4 hover:text-ink', focusRing)}>
                خلّه كذا
              </button>
              <p className="text-sm text-faint">لو خليته كذا، {NURSE_LINE}.</p>
            </>
          )}
        </Card>
      </div>
    );
  }

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
              <Button key={o.id} size="lg" fullWidth disabled={listening} onClick={() => save(quickParse(o), 'button', o.labelAr)}>
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

          {!listening && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                aria-expanded={state.textOpen}
                onClick={() => dispatch({ type: 'TOGGLE_TEXT' })}
                className={cn('inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-lg text-muted underline-offset-4 hover:text-ink hover:underline', focusRing)}
              >
                <Keyboard size={20} aria-hidden="true" />
                أو اكتب جوابك
              </button>
              {state.textOpen && (
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
}

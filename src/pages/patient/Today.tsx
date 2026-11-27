import { CheckCircle2, HeartHandshake, Mic } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useFamilyMode } from '../../components/patient/familyMode';
import ProgressRing from '../../components/patient/ProgressRing';
import { Card, buttonClasses } from '../../components/ui';
import { TODAY_INTRO_AR } from '../../content/glossary';
import { toArabicDigits } from '../../lib/arabicDigits';
import { patientCheckinFlowPath } from '../../routes';
import { useCheckinToday, useQuestionPlan } from '../../state/store';
import { voiceExperimentEnabled } from '../../voice/humain';

export default function Today() {
  const { id = '' } = useParams<{ id: string }>();
  const plan = useQuestionPlan(id);
  const { answered, completed } = useCheckinToday(id);
  const { family } = useFamilyMode();
  const remaining = plan?.questions.length ?? 0;

  if (!plan) {
    return <p className="px-5 py-8 text-lg text-muted">ما فيه تشييك اليوم.</p>;
  }

  const total = answered + remaining;

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <p className="text-base leading-relaxed text-muted">{TODAY_INTRO_AR}</p>
      <section className="flex justify-center">
        <ProgressRing done={answered} total={total} caption="تشييك اليوم" />
      </section>

      {completed || remaining === 0 ? (
        <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={40} aria-hidden="true" className="text-success" />
          <h1 className="text-2xl font-bold">{completed ? 'خلّصت التشييك ✔' : 'ما فيه أسئلة إضافية اليوم'}</h1>
          {remaining > 0 ? (
            <Link to={patientCheckinFlowPath(id)} className="min-h-12 py-2 text-lg text-muted underline underline-offset-4 hover:text-ink">
              جاوب على الأسئلة الباقية
            </Link>
          ) : <p className="text-lg text-muted">التشييك الجاي بكرة إن شاء الله</p>}
        </Card>
      ) : (
        <Card padding="lg" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl leading-snug font-bold">تشييك اليوم</h1>
            <p className="text-lg leading-relaxed text-muted">
              {toArabicDigits(remaining)} أسئلة، {family ? 'جاوبوا' : 'جاوب'} بالصوت أو بالكتابة أو بالأزرار.
            </p>
          </div>
          <Link to={patientCheckinFlowPath(id)} className={buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true })}>
            <Mic size={24} aria-hidden="true" />
            ابدأ
          </Link>
        </Card>
      )}

      {remaining > 0 && voiceExperimentEnabled(import.meta.env.VITE_HUMAIN_VOICE_ENABLED, window.location) && (
        <Link to={`${patientCheckinFlowPath(id)}?voice=humain`} className={buttonClasses({ size: 'lg', fullWidth: true })}>
          تشييك بالمحادثة عبر HUMAIN
        </Link>
      )}

      <p className="flex items-start gap-3 text-lg leading-relaxed text-ink-2">
        <HeartHandshake size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
        إذا فيه شي يحتاج متابعة، يطلع في قائمة المراجعة داخل العرض التجريبي
      </p>
    </div>
  );
}

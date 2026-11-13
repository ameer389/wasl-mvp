import { CheckCircle2, HeartHandshake, Mic } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useFamilyMode } from '../../components/patient/familyMode';
import ProgressRing from '../../components/patient/ProgressRing';
import { Card, buttonClasses } from '../../components/ui';
import { toArabicDigits } from '../../lib/arabicDigits';
import { patientCheckinFlowPath } from '../../routes';
import { useCheckinToday, useQuestionPlan } from '../../state/store';

export default function Today() {
  const { id = '' } = useParams<{ id: string }>();
  const plan = useQuestionPlan(id);
  const { answered, completed } = useCheckinToday(id);
  const { family } = useFamilyMode();
  const remaining = plan?.questions.length ?? 0;

  if (!plan) {
    return <p className="px-5 py-8 text-lg text-muted">ما فيه تشييك اليوم.</p>;
  }

  const total = completed ? Math.max(answered, 1) : answered + remaining;
  const done = completed ? total : answered;

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <section className="flex justify-center">
        <ProgressRing done={done} total={total} caption="تشييك اليوم" />
      </section>

      {completed ? (
        <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={40} aria-hidden="true" className="text-success" />
          <h1 className="text-2xl font-bold">خلّصت تشييك اليوم ✔</h1>
          <p className="text-lg text-muted">التشييك الجاي بكرة إن شاء الله</p>
          <Link to={patientCheckinFlowPath(id)} className="min-h-12 py-2 text-lg text-muted underline underline-offset-4 hover:text-ink">
            تبي تجاوب مرة ثانية؟
          </Link>
        </Card>
      ) : (
        <Card padding="lg" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl leading-snug font-bold">تشييك اليوم · دقيقة وحدة</h1>
            <p className="text-lg leading-relaxed text-muted">
              {toArabicDigits(remaining)} أسئلة بس، {family ? 'جاوبوا' : 'جاوب'} بالصوت أو بالأزرار.
            </p>
          </div>
          <Link to={patientCheckinFlowPath(id)} className={buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true })}>
            <Mic size={24} aria-hidden="true" />
            ابدأ
          </Link>
        </Card>
      )}

      <p className="flex items-start gap-3 text-lg leading-relaxed text-ink-2">
        <HeartHandshake size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
        إذا فيه شي مهم، الفريق الطبي بيتواصل معك
      </p>
    </div>
  );
}

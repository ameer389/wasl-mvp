import { HeartHandshake, Mic } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProgressRing from '../../components/patient/ProgressRing';
import { Button, Card, useToast } from '../../components/ui';
import { toArabicDigits } from '../../lib/arabicDigits';
import { useQuestionPlan } from '../../state/store';

export default function Today() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  // Adaptive plan: only what is still uncertain today (+ the open medicines question).
  const QUESTIONS_TODAY = useQuestionPlan(id)?.questions.length ?? 0;

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <section className="flex justify-center">
        <ProgressRing done={0} total={QUESTIONS_TODAY} caption="تشييك اليوم" />
      </section>

      <Card padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl leading-snug font-bold">تشييك اليوم · دقيقة وحدة</h1>
          <p className="text-lg leading-relaxed text-muted">
            {toArabicDigits(QUESTIONS_TODAY)} أسئلة بس، جاوب بصوتك أو بالأزرار.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<Mic size={24} aria-hidden="true" />}
          onClick={() => toast.show({ message: 'هذي نسخة تجريبية — التشييك الصوتي ينضاف قريب.' })}
        >
          ابدأ
        </Button>
      </Card>

      <p className="flex items-start gap-3 text-lg leading-relaxed text-ink-2">
        <HeartHandshake size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
        إذا فيه شي مهم، الفريق الطبي بيتواصل معك
      </p>
    </div>
  );
}

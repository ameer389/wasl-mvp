import { LifeBuoy, Lock, MessageCircle, Siren } from 'lucide-react';
import { Button, Card, useToast } from '../../components/ui';
import { toArabicDigits } from '../../lib/arabicDigits';

export default function Help() {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <LifeBuoy size={26} aria-hidden="true" className="text-muted" />
        إحنا معك
      </h1>

      <Card padding="lg" className="flex flex-col gap-2 border-high/40">
        <p className="flex items-center gap-2 text-xl font-bold">
          <Siren size={24} aria-hidden="true" className="text-high" />
          إذا فيه شي طارئ
        </p>
        <p className="text-lg leading-relaxed">
          اتصل على طول على {toArabicDigits(997)} (الإسعاف) أو {toArabicDigits(911)}.
        </p>
      </Card>

      <Button
        size="lg"
        fullWidth
        icon={<MessageCircle size={22} aria-hidden="true" />}
        onClick={() => toast.show({ message: 'هذي نسخة تجريبية — في النسخة الحقيقية يوصل طلبك للفريق الطبي.' })}
      >
        تواصل مع الفريق الطبي
      </Button>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">وش يسوي وصل بأجوبتك؟</h2>
        <ul className="flex list-disc flex-col gap-1 ps-5 text-lg leading-relaxed text-ink-2">
          <li>يقارن أجوبتك بخطة خروجك من المستشفى.</li>
          <li>إذا فيه شي مو واضح أو ناقص، يوصل للفريق الطبي.</li>
          <li>الفريق الطبي هو اللي يقرر ويتواصل معك.</li>
        </ul>
      </Card>

      <p className="flex items-start gap-2 text-base leading-relaxed text-muted">
        <Lock size={20} aria-hidden="true" className="mt-1 shrink-0" />
        هذي نسخة تجريبية ببيانات وهمية. أجوبتك تنحفظ في هذا الجهاز بس، وما تنرسل لأي جهة.
      </p>
    </div>
  );
}

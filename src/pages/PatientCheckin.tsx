import { useParams } from 'react-router-dom';

/** Patient side: Arabic (Saudi dialect), RTL, Arabic font, large type for elderly users. */
export default function PatientCheckin() {
  const { id = '' } = useParams<{ id: string }>();
  return (
    <section dir="rtl" lang="ar" className="mx-auto max-w-2xl space-y-5 font-arabic">
      <h1 className="text-4xl leading-snug font-bold">المتابعة اليومية</h1>
      <p className="text-xl leading-relaxed text-muted">
        طمّنا عليك بعد ما طلعت من المستشفى — تكلّم بصوتك أو اضغط الأزرار.
      </p>
      <p className="inline-block rounded-xl border border-line bg-panel px-4 py-2 text-base text-muted">
        نسخة تجريبية · تنبني في المرحلة ٥
      </p>
      <p className="text-sm text-muted" dir="ltr" lang="en">
        Synthetic patient: {id}
      </p>
    </section>
  );
}

import { LifeBuoy } from 'lucide-react';
import { EmptyState } from '../../components/ui';
import { toArabicDigits } from '../../lib/arabicDigits';

export default function Help() {
  return (
    <EmptyState
      size="large"
      icon={LifeBuoy}
      title="إحنا معك"
      text={`إذا عندك سؤال عن خطتك، الفريق الطبي يتابع معك من خلال وصل. وإذا حسّيت بشي طارئ، اتصل على طول على ${toArabicDigits(997)} (الإسعاف) أو ${toArabicDigits(911)}.`}
    />
  );
}

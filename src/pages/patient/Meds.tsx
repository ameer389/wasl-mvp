import { Pill } from 'lucide-react';
import { EmptyState } from '../../components/ui';

export default function Meds() {
  return (
    <EmptyState
      size="large"
      icon={Pill}
      title="ما فيه أدوية للحين"
      text="أول ما يرسل لك الفريق الطبي خطة خروجك، بتشوف أدويتك هنا: وش تبدأ، ووش توقف، ووش يتغيّر."
    />
  );
}

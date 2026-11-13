import { CalendarDays } from 'lucide-react';
import { EmptyState } from '../../components/ui';

export default function Appointments() {
  return (
    <EmptyState
      size="large"
      icon={CalendarDays}
      title="ما عندك مواعيد للحين"
      text="مواعيد المتابعة والتحاليل بتطلع هنا أول ما تنحجز لك."
    />
  );
}

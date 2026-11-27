import { FlaskConical } from 'lucide-react';
import { cn } from '../lib/cn';

const LABELS = {
  en: 'DEMO · synthetic data',
  ar: 'تجريبي · بيانات وهمية',
  compact: 'DEMO',
} as const;

/**
 * Rule 1 (CLAUDE.md): every screen shows that the data is synthetic.
 * Neutral styling on purpose — amber/red/green are reserved for risk and status.
 */
export default function DemoBadge({ variant = 'en', className }: { variant?: keyof typeof LABELS; className?: string }) {
  const compact = variant === 'compact';
  return (
    <span
      lang={variant === 'ar' ? 'ar' : 'en'}
      title="All patients, plans and feeds in this app are synthetic. No real patient data."
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 py-0.5 text-xs font-medium text-muted',
        compact ? 'px-1.5' : 'px-2.5',
        className,
      )}
    >
      {!compact && <FlaskConical size={12} aria-hidden="true" />}
      {LABELS[variant]}
    </span>
  );
}

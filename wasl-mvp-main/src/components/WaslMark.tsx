import { cn } from '../lib/cn';

/** WASL logo mark (matches the favicon). */
export function WaslMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="#0f2a3a" stroke="#1d4a60" />
      <path
        d="M7 11l4 11 5-9 5 9 4-11"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

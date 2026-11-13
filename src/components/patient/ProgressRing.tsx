import { toArabicDigits } from '../../lib/arabicDigits';

interface ProgressRingProps {
  done: number;
  total: number;
  caption: string;
  size?: number;
}

/** Circular progress with an Arabic-Indic "X من Y" label in the centre. */
export default function ProgressRing({ done, total, caption, size = 168 }: ProgressRingProps) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const label = `${toArabicDigits(done)} من ${toArabicDigits(total)}`;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${label} ${caption}`}
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-2xl font-bold">{label}</span>
        <span className="text-sm text-muted">{caption}</span>
      </div>
    </div>
  );
}

import { FlaskConical } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from './Badge';
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Rule 3 (CLAUDE.md): label anything computed from simulated data. */
  simulated?: boolean;
}

export function StatCard({ label, value, hint, simulated }: StatCardProps) {
  return (
    <Card className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {simulated && (
          <Badge variant="neutral" icon={<FlaskConical size={11} aria-hidden="true" />} title="Computed from simulated data">
            Simulated
          </Badge>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </Card>
  );
}

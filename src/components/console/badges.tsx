import { ArrowRightLeft } from 'lucide-react';
import { RISK_LABEL, TASK_STATUS_LABEL } from '../../domain/labels';
import type { Patient, Risk, TaskStatus } from '../../domain/types';
import { Badge, type BadgeVariant } from '../ui';

export const RISK_VARIANT: Record<Risk, BadgeVariant> = { high: 'high', medium: 'medium', low: 'low' };

export function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <Badge variant={RISK_VARIANT[risk]} dot>
      {RISK_LABEL[risk]}
    </Badge>
  );
}

/** Status badge; gaps take the colour of the task's risk. */
export function StatusBadge({ status, risk }: { status: TaskStatus; risk: Risk }) {
  const variant: BadgeVariant =
    status === 'VERIFIED' ? 'verified' : status === 'GAP' || status === 'ESCALATED' ? (risk === 'high' ? 'high' : 'medium') : 'neutral';
  return (
    <Badge variant={variant} dot={status !== 'CLOSED'} title={status === 'VERIFIED'
      ? 'Sufficient evidence under the demo policy'
      : status === 'CLOSED' ? 'Gap closed administratively' : undefined}>
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

export function TransferChip({ patient, detailed }: { patient: Patient; detailed?: boolean }) {
  if (!patient.transfer) return null;
  return (
    <Badge
      variant="neutral"
      icon={<ArrowRightLeft size={11} aria-hidden="true" />}
      title={`Transferred from ${patient.transfer.fromHospital} to ${patient.transfer.toHospital}`}
    >
      {detailed ? `${patient.transfer.fromHospital} → ${patient.transfer.toHospital}` : 'Transfer'}
    </Badge>
  );
}

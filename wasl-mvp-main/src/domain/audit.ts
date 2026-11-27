import type { AuditAction, AuditEntry, Day } from './types';

export interface AuditInput {
  /** Position in the audit log; makes the id deterministic. */
  seq: number;
  day: Day;
  /** ISO timestamp, supplied by the caller (keeps this function pure). */
  at: string;
  actor: string;
  action: AuditAction;
  target: string;
  note?: string;
}

export function makeAudit({ seq, day, at, actor, action, target, note }: AuditInput): AuditEntry {
  return {
    id: `audit-${String(seq).padStart(4, '0')}`,
    day,
    at,
    actor,
    action,
    target,
    ...(note ? { note } : {}),
  };
}

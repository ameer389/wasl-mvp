/**
 * What a clinician can record after checking with the patient ("Confirm what
 * happened"). Each option is a claim the gap engine already understands.
 */
import { FEED_SOURCE_FOR } from './gapEngine';
import type { EvidenceClaim, TaskType } from './types';

export interface ClaimOption {
  claim: EvidenceClaim;
  label: string;
}

const OPTIONS: Record<TaskType, ClaimOption[]> = {
  MED_START: [
    { claim: 'DONE', label: 'Started' },
    { claim: 'NOT_DONE', label: 'Not started' },
  ],
  MED_CONTINUE: [
    { claim: 'DONE', label: 'Taking as planned' },
    { claim: 'NOT_DONE', label: 'Not taking' },
  ],
  MED_DOSE_CHANGE: [
    { claim: 'DONE', label: 'On the new dose' },
    { claim: 'OLD_DOSE', label: 'Still on the previous dose' },
  ],
  MED_STOP: [
    { claim: 'STOPPED', label: 'Stopped' },
    { claim: 'STILL_TAKING', label: 'Still taking' },
  ],
  WOUND_CHECK: [
    { claim: 'DONE', label: 'Wound checked' },
    { claim: 'NOT_DONE', label: 'Not checked' },
  ],
  // Verified by system feeds only (lab system / appointment system).
  LAB_DONE: [],
  FOLLOWUP_BOOKED: [],
  FOLLOWUP_ATTENDED: [],
};

/** Claim options valid for a task type. Empty for feed-verified tasks. */
export function claimOptionsFor(type: TaskType): ClaimOption[] {
  return OPTIONS[type];
}

/** Why a task cannot be confirmed by a clinician note (feed-verified), or undefined. */
export function confirmationHint(type: TaskType): string | undefined {
  const feed = FEED_SOURCE_FOR[type];
  if (!feed) return undefined;
  const system = feed === 'lab_system' ? 'lab system' : 'appointment system';
  return `Verified by the ${system} feed. Check the record, then mark the gap resolved with a note.`;
}

/**
 * Shared interaction-state classes. Every interactive element uses these so
 * hover / focus-visible / active / disabled behave identically app-wide.
 */
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

export const interactive = [
  'transition-[color,background-color,border-color,transform] duration-150 ease-out',
  'active:scale-[0.98] motion-reduce:active:scale-100',
  'disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40',
  focusRing,
].join(' ');

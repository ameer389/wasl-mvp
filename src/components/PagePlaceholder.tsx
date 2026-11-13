import type { ReactNode } from 'react';

interface PagePlaceholderProps {
  title: string;
  description: string;
  /** Short note about which build phase fills this page in. */
  note?: string;
  children?: ReactNode;
}

/** Temporary page body used by the Phase 1 shell. */
export default function PagePlaceholder({ title, description, note, children }: PagePlaceholderProps) {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-2xl text-lg text-muted">{description}</p>
      {note && (
        <p className="inline-block rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted">{note}</p>
      )}
      {children}
    </section>
  );
}

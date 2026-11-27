import { Lightbulb, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PAGE_INTRO } from '../../content/glossary';
import { readStored, writeStored } from '../../lib/storage';
import { findConsolePage } from '../../routes';
import { IconButton } from '../ui';

const key = (path: string) => `wasl.ui.introDismissed.${path}`;

/** One plain line under the top bar saying what this page is for. Dismissible, remembered per page. */
export default function PageIntro() {
  const { pathname } = useLocation();
  const path = findConsolePage(pathname)?.path;
  const text = path ? PAGE_INTRO[path] : undefined;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(path ? readStored(key(path), false) : false), [path]);

  if (!path || !text || dismissed) return null;
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface-1 px-6 py-2 text-sm text-ink-2" role="note">
      <Lightbulb size={15} aria-hidden="true" className="shrink-0 text-muted" />
      <p className="min-w-0 flex-1">{text}</p>
      <IconButton
        label="Hide this tip"
        size="sm"
        icon={<X size={14} aria-hidden="true" />}
        onClick={() => {
          writeStored(key(path), true);
          setDismissed(true);
        }}
      />
    </div>
  );
}

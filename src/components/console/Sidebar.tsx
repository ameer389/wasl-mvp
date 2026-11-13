import {
  BookOpen,
  FilePlus2,
  FlaskConical,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { readStored, STORAGE_KEYS, writeStored } from '../../lib/storage';
import { DEMO_PATIENT_ID, ROUTES, patientCheckinPath } from '../../routes';
import { clinicianGaps } from '../../state/selectors';
import { useDemoStore } from '../../state/store';
import DemoBadge from '../DemoBadge';
import { Badge, Tooltip, focusRing, useToast } from '../ui';
import { WaslMark } from '../WaslMark';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Route patterns that mark this item active. */
  match: string[];
  /** Show the open clinician gap count on this item. */
  showGapCount?: boolean;
}

const NAV: NavItem[] = [
  { to: ROUTES.careGaps, label: 'Care gaps', icon: Inbox, match: [ROUTES.careGaps], showGapCount: true },
  { to: ROUTES.patients, label: 'Patients', icon: Users, match: [ROUTES.patients, ROUTES.clinicianPatient] },
  { to: ROUTES.newDischarge, label: 'New discharge', icon: FilePlus2, match: [ROUTES.newDischarge] },
  { to: ROUTES.validation, label: 'Validation', icon: FlaskConical, match: [ROUTES.validation] },
  { to: ROUTES.about, label: 'How it works', icon: BookOpen, match: [ROUTES.about] },
];

const itemBase = cn(
  'relative flex h-9 w-full items-center gap-3 rounded-lg text-sm transition-colors duration-150 ease-out',
  'active:scale-[0.98] motion-reduce:active:scale-100',
  focusRing,
);

export default function Sidebar() {
  const { pathname } = useLocation();
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [userCollapsed, setUserCollapsed] = useState(() => readStored(STORAGE_KEYS.sidebarCollapsed, false));
  const collapsed = !isWide || userCollapsed;

  const store = useDemoStore();
  const gapCount = clinicianGaps(store.evaluation.gaps).length;
  const toast = useToast();

  const toggleCollapsed = () => {
    setUserCollapsed((c) => {
      writeStored(STORAGE_KEYS.sidebarCollapsed, !c);
      return !c;
    });
  };

  const resetDemo = () => {
    const snapshot = store.state;
    store.reset();
    toast.show({
      message: 'Demo reset to the starting synthetic scenario.',
      action: { label: 'Undo', onClick: () => store.replace(snapshot) },
    });
  };

  const itemLayout = collapsed ? 'justify-center px-0' : 'px-3';

  return (
    <aside
      aria-label="Care team console"
      className={cn(
        'relative z-30 flex shrink-0 flex-col border-r border-line bg-surface-1 transition-[width] duration-150 ease-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center' : 'px-4')}>
        <Link to={ROUTES.launcher} aria-label="WASL — switch app" className={cn('flex items-center gap-2.5 rounded-lg', focusRing)}>
          <WaslMark size={28} />
          {!collapsed && (
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-[0.18em]">WASL</span>
              <span className="text-xs text-faint">Care team</span>
            </span>
          )}
        </Link>
      </div>

      {/* Primary nav */}
      {/* Rail mode keeps overflow visible so right-side tooltips aren't clipped. */}
      <nav aria-label="Main" className={cn('flex-1 p-3', collapsed ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden')}>
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match.some((p) => matchPath({ path: p, end: true }, pathname));
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex">
                <Tooltip content={item.label} side="right" enabled={collapsed}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? (item.showGapCount ? `${item.label}, ${gapCount} open` : item.label) : undefined}
                    className={cn(
                      itemBase,
                      itemLayout,
                      collapsed && 'w-10',
                      active ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                    )}
                  >
                    {active && (
                      <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" />
                    )}
                    <Icon size={18} aria-hidden="true" className={active ? 'text-accent' : undefined} />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.showGapCount && (
                      <Badge variant="neutral" aria-label={`${gapCount} open gaps`}>
                        {gapCount}
                      </Badge>
                    )}
                    {collapsed && item.showGapCount && gapCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 min-w-4 rounded-full border border-line bg-surface-3 px-1 text-center text-[10px] leading-4 font-semibold text-ink tabular-nums"
                      >
                        {gapCount}
                      </span>
                    )}
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer actions */}
      <div className="flex flex-col gap-1 border-t border-line p-3">
        <Tooltip content="Open patient app" side="right" enabled={collapsed}>
          <Link
            to={patientCheckinPath(DEMO_PATIENT_ID)}
            aria-label={collapsed ? 'Open patient app' : undefined}
            className={cn(itemBase, itemLayout, collapsed && 'w-10', 'text-muted hover:bg-surface-2/60 hover:text-ink')}
          >
            <Smartphone size={18} aria-hidden="true" />
            {!collapsed && <span className="truncate">Open patient app</span>}
          </Link>
        </Tooltip>
        <Tooltip content="Reset demo" side="right" enabled={collapsed}>
          <button
            type="button"
            onClick={resetDemo}
            aria-label={collapsed ? 'Reset demo' : undefined}
            className={cn(itemBase, itemLayout, collapsed && 'w-10', 'text-muted hover:bg-surface-2/60 hover:text-ink')}
          >
            <RotateCcw size={18} aria-hidden="true" />
            {!collapsed && <span className="truncate">Reset demo</span>}
          </button>
        </Tooltip>
        {isWide && (
          <Tooltip content="Expand sidebar" side="right" enabled={collapsed}>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className={cn(itemBase, itemLayout, collapsed && 'w-10', 'text-muted hover:bg-surface-2/60 hover:text-ink')}
            >
              {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
              {!collapsed && <span className="truncate">Collapse</span>}
            </button>
          </Tooltip>
        )}
        <div className={cn('pt-2', collapsed ? 'flex justify-center' : 'px-1')}>
          <DemoBadge variant={collapsed ? 'compact' : 'en'} />
        </div>
      </div>
    </aside>
  );
}

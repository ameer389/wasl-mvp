import { ArrowLeft } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { ROUTES } from '../../routes';
import DemoBadge from '../DemoBadge';
import { ToastProvider, focusRing } from '../ui';
import PatientHeader from './PatientHeader';
import PatientTabBar from './PatientTabBar';

/**
 * Patient app (AR, RTL), mobile-first.
 * ≥640px: shown inside a 390×844 phone frame on a dimmed backdrop (preview for demos).
 * <640px: full screen, no frame.
 */
export default function PatientShell() {
  return (
    <div className="min-h-dvh bg-bg sm:flex sm:flex-col sm:items-center sm:justify-center sm:gap-5 sm:bg-[#03090d] sm:py-8">
      <div
        dir="rtl"
        lang="ar"
        className={[
          'relative flex h-dvh w-full flex-col overflow-hidden bg-bg font-arabic text-lg',
          'sm:box-content sm:h-[844px] sm:w-[390px] sm:rounded-[44px] sm:border-[12px] sm:border-[#010507]',
          'sm:shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9),0_0_0_1px_#12384a]',
        ].join(' ')}
      >
        <ToastProvider viewportClassName="pointer-events-auto absolute inset-x-4 bottom-24" dismissLabel="إغلاق">
          <PatientHeader />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
          <PatientTabBar />
        </ToastProvider>
      </div>

      {/* Desktop-only caption under the frame */}
      <div lang="en" dir="ltr" className="hidden items-center gap-3 text-xs text-muted sm:flex">
        <span>Patient app · mobile preview</span>
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
        <DemoBadge />
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
        <Link to={ROUTES.careGaps} className={`inline-flex items-center gap-1 rounded-md hover:text-ink ${focusRing}`}>
          <ArrowLeft size={12} aria-hidden="true" />
          Back to care team console
        </Link>
      </div>
    </div>
  );
}

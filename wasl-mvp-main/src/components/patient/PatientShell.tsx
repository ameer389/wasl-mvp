import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DEMO_PATIENT_ID, ROUTES, clinicianPatientPath, patientCheckinPath } from '../../routes';
import { useDemoStore } from '../../state/store';
import DemoBadge from '../DemoBadge';
import { ToastProvider, buttonClasses, compactControlClasses, focusRing } from '../ui';
import { FamilyModeProvider } from './familyMode';
import PatientHeader from './PatientHeader';
import PatientTabBar from './PatientTabBar';
import { cn } from '../../lib/cn';

/**
 * Patient app (AR, RTL), mobile-first.
 * ≥640px: shown inside a phone frame (390 wide, up to 844 tall, shrinks to fit the
 * viewport) on a dimmed backdrop, with demo controls underneath. <640px: full screen.
 */
export default function PatientShell() {
  const { id = DEMO_PATIENT_ID } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state } = useDemoStore();
  const inCheckin = pathname.endsWith('/checkin');

  return (
    <FamilyModeProvider patientId={id}>
      <div className="min-h-dvh bg-bg sm:flex sm:flex-col sm:items-center sm:justify-center sm:gap-4 sm:bg-[#03090d] sm:py-5">
        <div
          dir="rtl"
          lang="ar"
          data-tour="checkin"
          className={cn(
            'relative flex h-dvh w-full flex-col overflow-hidden bg-bg font-arabic text-lg',
            'sm:box-content sm:h-[min(844px,calc(100dvh-7.5rem))] sm:w-[390px] sm:rounded-[44px] sm:border-[12px] sm:border-[#010507]',
            'sm:shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9),0_0_0_1px_#12384a]',
          )}
        >
          <ToastProvider viewportClassName="pointer-events-auto absolute inset-x-4 bottom-24" dismissLabel="إغلاق">
            <PatientHeader />
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              <Outlet />
            </main>
            {!inCheckin && <PatientTabBar />}
          </ToastProvider>
        </div>

        {/* Demo controls — desktop only, outside the phone */}
        <div lang="en" dir="ltr" className="hidden flex-wrap items-center justify-center gap-3 text-xs text-muted sm:flex">
          <span>Patient app · mobile preview</span>
          <DemoBadge />
          <label className="flex items-center gap-2">
            <span>Patient</span>
            <select
              value={id}
              onChange={(e) => navigate(patientCheckinPath(e.target.value))}
              className={cn(compactControlClasses, 'w-48 pe-8')}
              aria-label="Switch demo patient"
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameEn}
                </option>
              ))}
            </select>
          </label>
          <Link
            to={clinicianPatientPath(id)}
            lang="ar"
            dir="rtl"
            className={cn(buttonClasses({ variant: 'secondary', size: 'sm' }), 'font-arabic')}
          >
            شوف النتيجة في لوحة الفريق ←
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
          <Link to={ROUTES.careGaps} className={`inline-flex items-center gap-1 rounded-md hover:text-ink ${focusRing}`}>
            <ArrowLeft size={12} aria-hidden="true" />
            Care team console
          </Link>
        </div>
      </div>
    </FamilyModeProvider>
  );
}

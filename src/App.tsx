import { Route, Routes } from 'react-router-dom';
import ConsoleShell from './components/console/ConsoleShell';
import PatientShell from './components/patient/PatientShell';
import { ROUTES } from './routes';
import { DemoStoreProvider } from './state/store';
import NotFound from './pages/NotFound';
import RoleLauncher from './pages/RoleLauncher';
import About from './pages/console/About';
import CareGaps from './pages/console/CareGaps';
import NewDischarge from './pages/console/NewDischarge';
import PatientDetail from './pages/console/PatientDetail';
import Patients from './pages/console/Patients';
import Validation from './pages/console/Validation';
import Appointments from './pages/patient/Appointments';
import Help from './pages/patient/Help';
import Meds from './pages/patient/Meds';
import Checkin from './pages/patient/Checkin';
import Today from './pages/patient/Today';

export default function App() {
  return (
    <DemoStoreProvider>
      <Routes>
        <Route path={ROUTES.launcher} element={<RoleLauncher />} />

        {/* Care team console — EN, LTR, desktop */}
        <Route element={<ConsoleShell />}>
          <Route path={ROUTES.careGaps} element={<CareGaps />} />
          <Route path={ROUTES.patients} element={<Patients />} />
          <Route path={ROUTES.newDischarge} element={<NewDischarge />} />
          <Route path={ROUTES.clinicianPatient} element={<PatientDetail />} />
          <Route path={ROUTES.validation} element={<Validation />} />
          <Route path={ROUTES.about} element={<About />} />
        </Route>

        {/* Patient app — AR, RTL, mobile */}
        <Route path={ROUTES.patientToday} element={<PatientShell />}>
          <Route index element={<Today />} />
          <Route path="meds" element={<Meds />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="help" element={<Help />} />
          <Route path="checkin" element={<Checkin />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </DemoStoreProvider>
  );
}

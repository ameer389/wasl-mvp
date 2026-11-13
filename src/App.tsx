import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ROUTES } from './routes';
import Landing from './pages/Landing';
import ClinicianQueue from './pages/ClinicianQueue';
import PatientDetail from './pages/PatientDetail';
import NewDischargePlan from './pages/NewDischargePlan';
import PatientCheckin from './pages/PatientCheckin';
import Validation from './pages/Validation';
import About from './pages/About';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path={ROUTES.landing} element={<Landing />} />
        <Route path={ROUTES.clinicianQueue} element={<ClinicianQueue />} />
        <Route path={ROUTES.clinicianNew} element={<NewDischargePlan />} />
        <Route path={ROUTES.clinicianPatient} element={<PatientDetail />} />
        <Route path={ROUTES.patientCheckin} element={<PatientCheckin />} />
        <Route path={ROUTES.validation} element={<Validation />} />
        <Route path={ROUTES.about} element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

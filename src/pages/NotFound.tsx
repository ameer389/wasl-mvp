import { Link } from 'react-router-dom';
import PagePlaceholder from '../components/PagePlaceholder';
import { ROUTES } from '../routes';

export default function NotFound() {
  return (
    <PagePlaceholder title="Page not found" description="This page does not exist in the WASL demo.">
      <Link to={ROUTES.landing} className="text-accent underline-offset-4 hover:underline">
        Back to start
      </Link>
    </PagePlaceholder>
  );
}

import HomePage from './pages/HomePage';
import PredictPage from './pages/PredictPage';
import HistoricalPage from './pages/HistoricalPage';
import InsightsPage from './pages/InsightsPage';
import MathsPage from './pages/MathsPage';
import SeriesRoute from './pages/SeriesRoute';
import SeriesResultRoute from './pages/SeriesResultRoute';
import SeriesIdRoute from './pages/SeriesIdRoute';
import type { ComponentType, ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';

/**
 * Remounts a series route per series (Story 4.3; per `:year/:slug` or `:id`
 * since Story 6.1): its fetch state is local, so without the key an
 * `/series/A` → `/series/B` navigation would paint A's page for a frame before
 * B's fetch resets it.
 */
function KeyedById({ page: Page }: { page: ComponentType }) {
  const { id = '', year = '', slug = '' } = useParams();
  return <Page key={`${id}|${year}|${slug}`} />;
}

const UuidPage = () => <SeriesIdRoute variant="page" />;
const UuidResult = () => <SeriesIdRoute variant="result" />;

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. Has no effect when RouteGuard is not in use. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: 'Home',
    path: '/',
    element: <HomePage />,
    public: true,
  },
  {
    name: 'Predict',
    path: '/predict',
    element: <PredictPage />,
    public: true,
  },
  {
    name: 'Historical',
    path: '/historical',
    element: <HistoricalPage />,
    public: true,
  },
  {
    name: 'Insights',
    path: '/insights',
    element: <InsightsPage />,
    public: true,
  },
  {
    name: 'Maths',
    path: '/maths',
    element: <MathsPage />,
    public: true,
  },
  {
    // Story 4.1: the share/deep-link entry point; Story 4.3: the series page
    // (preview or full record); Story 6.1: at its readable, canonical URL
    // `/series/<year>/<slug>` (`src/lib/series-slug.ts`). Not in the nav —
    // `Layouts` keeps its own list and never reads this array.
    name: 'Series',
    path: '/series/:year/:slug',
    element: <KeyedById page={SeriesRoute} />,
    public: true,
  },
  {
    // Story 4.3: a flagship's result page (the preview's reveal link). Every
    // other series — non-flagship, pending, unknown — renders the 404 here.
    name: 'Series result',
    path: '/series/:year/:slug/result',
    element: <KeyedById page={SeriesResultRoute} />,
    public: true,
  },
  {
    // Story 6.1: the legacy uuid URLs (shared and indexed since 0.2.9) forward
    // to the slug URL; a 4-digit segment is a year and goes to Historical.
    // The literal `result` segment outranks `:year/:slug`, which is safe: no
    // slug is "result".
    name: 'Series (uuid)',
    path: '/series/:id',
    element: <KeyedById page={UuidPage} />,
    public: true,
  },
  {
    name: 'Series result (uuid)',
    path: '/series/:id/result',
    element: <KeyedById page={UuidResult} />,
    public: true,
  },
  {
    // Story 6.1: `/series` itself lists nothing — the archive is Historical.
    name: 'Series index',
    path: '/series',
    element: <Navigate to="/historical" replace />,
    public: true,
  },
];

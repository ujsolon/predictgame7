import HomePage from './pages/HomePage';
import PredictPage from './pages/PredictPage';
import HistoricalPage from './pages/HistoricalPage';
import InsightsPage from './pages/InsightsPage';
import MathsPage from './pages/MathsPage';
import SeriesRoute from './pages/SeriesRoute';
import SeriesResultRoute from './pages/SeriesResultRoute';
import type { ComponentType, ReactNode } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Remounts a series route per `:id` (Story 4.3): its fetch state is local, so
 * without the key an `/series/A` → `/series/B` navigation would paint A's page
 * for a frame before B's fetch resets it.
 */
function KeyedById({ page: Page }: { page: ComponentType }) {
  const { id = '' } = useParams();
  return <Page key={id} />;
}

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
    // (preview or full record). Not in the nav — `Layouts`
    // keeps its own list and never reads this array.
    name: 'Series',
    path: '/series/:id',
    element: <KeyedById page={SeriesRoute} />,
    public: true,
  },
  {
    // Story 4.3: a flagship's result page (the preview's reveal link). Every
    // other id — non-flagship, pending, unknown — renders the 404 here.
    name: 'Series result',
    path: '/series/:id/result',
    element: <KeyedById page={SeriesResultRoute} />,
    public: true,
  },
];

import HomePage from './pages/HomePage';
import PredictPage from './pages/PredictPage';
import HistoricalPage from './pages/HistoricalPage';
import InsightsPage from './pages/InsightsPage';
import MathsPage from './pages/MathsPage';
import SeriesRoute from './pages/SeriesRoute';
import type { ReactNode } from 'react';

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
    // Story 4.1: the share/deep-link entry point. Not in the nav — `Layouts`
    // keeps its own list and never reads this array.
    name: 'Series',
    path: '/series/:id',
    element: <SeriesRoute />,
    public: true,
  },
];

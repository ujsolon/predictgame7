import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import Layout from '@/components/layouts/Layouts';

import { routes } from './routes';

/**
 * The shared app tree (Story 4.8, AD-7 "no fork"): the client mounts it inside
 * `BrowserRouter` (`App`), and the prerender wraps the very same tree in
 * `StaticRouter` (`src/prerender/entry-server.tsx`), so a prerendered page
 * hydrates against identical markup.
 */
export const AppRoutes: React.FC = () => (
  <>
    <IntersectObserver />
    <Layout>
      <Routes>
        {routes.map((route, index) => (
          <Route
            key={index}
            path={route.path}
            element={route.element}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    <Toaster />
  </>
);

const App: React.FC = () => {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </Router>
  );
};

export default App;

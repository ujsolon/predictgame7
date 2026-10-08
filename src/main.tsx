import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { AnalyticsProvider } from "@/lib/analytics/provider";
import { PRELOAD_ELEMENT_ID, PreloadContext, parsePreload, shouldHydrate } from "@/prerender/preload";

const root = document.getElementById("root")!;

// Story 4.8: a prerendered series page carries the row it was rendered from.
const preload = parsePreload(document.getElementById(PRELOAD_ELEMENT_ID)?.textContent);

const hydrate = shouldHydrate({
  hasChildren: root.hasChildNodes(),
  preload,
  pathname: window.location.pathname,
  search: window.location.search,
  base: import.meta.env.BASE_URL,
});

const app = (
  <AnalyticsProvider>
    <AppWrapper>
      <PreloadContext.Provider value={preload}>
        <App />
      </PreloadContext.Provider>
    </AppWrapper>
  </AnalyticsProvider>
);

if (hydrate) hydrateRoot(root, app);
else createRoot(root).render(app);

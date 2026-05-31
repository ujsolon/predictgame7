import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";

import posthog from "posthog-js";
import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  defaults: "2026-01-30",
});

createRoot(document.getElementById("root")!).render(
  <PostHogProvider client={posthog}>
    <PostHogErrorBoundary>
      <AppWrapper>
        <App />
      </AppWrapper>
    </PostHogErrorBoundary>
  </PostHogProvider>
);

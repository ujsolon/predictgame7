import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { AnalyticsProvider } from "@/lib/analytics/provider";

createRoot(document.getElementById("root")!).render(
  <AnalyticsProvider>
    <AppWrapper>
      <App />
    </AppWrapper>
  </AnalyticsProvider>
);

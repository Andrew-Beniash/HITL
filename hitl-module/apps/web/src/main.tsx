import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { onCLS, onLCP, onTTFB, onINP } from "web-vitals";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// §10 Web Vitals — report CLS, LCP, TTFB, INP to the platform metrics endpoint.
// Uses sendBeacon so reports are delivered even on page unload.
function reportWebVital(metric: { name: string; value: number }) {
  if (!navigator.sendBeacon) return;
  navigator.sendBeacon(
    "/api/metrics",
    JSON.stringify({ name: metric.name, value: metric.value })
  );
}

[onCLS, onLCP, onTTFB, onINP].forEach((fn) => fn(reportWebVital));

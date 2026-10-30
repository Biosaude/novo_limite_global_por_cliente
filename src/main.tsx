import React from "react";
import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import App from "./App";
const Access = lazy(() => import("./auth/Access").then(m => ({default:m.Access})));
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {import.meta.env.VITE_FINANCIAL_REMOTE_ENABLED === "true" ? <Suspense fallback={<p role="status">Carregando acesso…</p>}><Access /></Suspense> : <App />}
  </React.StrictMode>,
);

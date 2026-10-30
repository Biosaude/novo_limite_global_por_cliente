import React from "react";
import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import App from "./App";
import { consumeAccessReturn } from "./auth/recovery";
const Access = lazy(() => import("./auth/Access").then(m => ({default:m.Access})));
import "./styles.css";
const accessReturn = import.meta.env.VITE_FINANCIAL_REMOTE_ENABLED === "true" ? consumeAccessReturn() : null;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {accessReturn ? <Suspense fallback={<p role="status">Carregando acesso…</p>}><Access returned={accessReturn} /></Suspense> : <App />}
  </React.StrictMode>,
);

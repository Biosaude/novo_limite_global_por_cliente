import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serverBoundary } from "./build/server-boundary";
export default defineConfig({
  define: { "import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT": JSON.stringify(process.env.VERCEL_ENV ?? "development") },
  plugins: [serverBoundary(), react()],
  worker: { plugins: () => [serverBoundary()] },
  optimizeDeps: { include: ["exceljs", "fflate", "fast-xml-parser"] },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serverBoundary } from "./build/server-boundary";
export default defineConfig({
  plugins: [serverBoundary(), react()],
  worker: { plugins: () => [serverBoundary()] },
  optimizeDeps: { include: ["exceljs", "fflate", "fast-xml-parser"] },
});

import { resolve } from "node:path";
import { normalizePath, type Plugin } from "vite";
/** Falha no build se qualquer entrada do navegador alcançar servidor ou driver SQL. */
export function serverBoundary(root = process.cwd()): Plugin {
  const folders = ["server", "api", "migrations"].map(
    (p) => normalizePath(resolve(root, p)) + "/",
  );
  return {
    name: "biosaude-server-boundary",
    enforce: "pre",
    configResolved(config) {
      if (config.env.VITE_DATABASE_URL)
        throw new Error(
          "Variável pública de banco proibida; mantenha DATABASE_URL somente no servidor.",
        );
    },
    load(id) {
      const path = normalizePath(id.split("?")[0]);
      if (
        folders.some((folder) => path.startsWith(folder)) ||
        path.includes("/node_modules/@neondatabase/")
      )
        throw new Error(
          "Importação de código de servidor no bundle do navegador bloqueada.",
        );
    },
  };
}

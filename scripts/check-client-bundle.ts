import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
/** Saída de diagnóstico nunca inclui o conteúdo que causou falha. */
export async function inspectClientBundle(
  directory = "dist",
): Promise<string[]> {
  const invalid: string[] = [];
  async function scan(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (/\.(js|html|json|map)$/.test(entry.name)) {
        const body = await readFile(file, "utf8");
        if (/DATABASE_URL|@neondatabase|postgres(?:ql)?:\/\//i.test(body))
          invalid.push(relative(directory, file));
      } else if (entry.name.startsWith(".env"))
        invalid.push(relative(directory, file));
    }
  }
  await scan(directory);
  return invalid;
}
if (process.argv[1]?.endsWith("check-client-bundle.ts")) {
  const files = await inspectClientBundle();
  if (files.length) {
    console.error(
      JSON.stringify({ code: "CLIENT_SERVER_BOUNDARY_FAILED", files }),
    );
    process.exitCode = 1;
  } else
    console.log(
      "Bundle do navegador verificado: sem configuração ou driver de banco.",
    );
}

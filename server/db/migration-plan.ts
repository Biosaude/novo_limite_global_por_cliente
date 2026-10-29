import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
/** Planejamento offline: não importa cliente, não lê DATABASE_URL e não aplica SQL. */
export async function migrationPlan(
  directory = resolve(process.cwd(), "migrations"),
) {
  const files = (await readdir(directory))
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const seen = new Set<string>();
  return Promise.all(
    files.map(async (name) => {
      const version = name.slice(0, 4);
      if (seen.has(version)) throw new Error("Versão de migração duplicada.");
      seen.add(version);
      const sql = await readFile(resolve(directory, name), "utf8");
      return {
        version,
        name,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
  );
}

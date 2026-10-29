import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
/** Criado somente por comando explícito do operador; nunca em instalação/build/teste. */
export async function createDiagnosticKeyFile(path = ".env.neon-diagnostic") {
  await writeFile(
    path,
    `NEON_DIAGNOSTIC_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { flag: "wx", mode: 0o600 },
  );
}
if (process.argv[1]?.endsWith("diagnostic-key.ts")) {
  try {
    await createDiagnosticKeyFile();
    console.log(
      "Chave gravada no arquivo privado .env.neon-diagnostic, sem exibir o valor. Não versione nem compartilhe o arquivo.",
    );
  } catch {
    console.error(
      "Não foi possível criar o arquivo privado. Um arquivo existente não será sobrescrito.",
    );
    process.exitCode = 1;
  }
}

import { runPreviewProbe } from "./neon-preview-client";
// Recebe só a URL pública do Preview. Segredos nunca são argumentos nem são impressos.
const result = await runPreviewProbe(process.argv[2] ?? "", process.env);
console.log(JSON.stringify(result));
process.exitCode = result.success ? 0 : 1;

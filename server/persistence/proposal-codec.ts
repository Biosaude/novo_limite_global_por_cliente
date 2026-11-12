import type { PolicyProposal } from "../../src/credito/types.js";
import { validateConfig } from "../../src/credito/policy.js";
import { ServerError } from "../errors.js";
function shape(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error();
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(record, key))
  )
    throw Error();
  return record;
}
/** Estrutura completa antes da validação numérica existente; não define novas regras financeiras. */
export function validateProposal(value: unknown): PolicyProposal {
  try {
    const p = shape(value, [
      "id",
      "version",
      "createdAt",
      "reason",
      "config",
      "status",
    ]);
    if (
      typeof p.id !== "string" ||
      !p.id.trim() ||
      p.id.length > 200 ||
      !Number.isSafeInteger(p.version) ||
      Number(p.version) < 1 ||
      Number(p.version) > 2147483647 ||
      typeof p.createdAt !== "string" ||
      !Number.isFinite(Date.parse(p.createdAt)) ||
      typeof p.reason !== "string" ||
      !p.reason.trim() ||
      p.reason.length > 4000 ||
      p.status !== "draft"
    )
      throw Error();
    const config = shape(p.config, [
      "minimumReceipts",
      "minimumTitles",
      "minimumActiveMonths",
      "minimumWindowMonths",
      "minimumDateCoverage",
      "rules",
      "factorsBps",
      "maxRecommendationCents",
      "reviewOverdue",
    ]);
    const rules = shape(config.rules, ["Moderado", "Alto", "Crítico"]);
    for (const risk of ["Moderado", "Alto", "Crítico"])
      shape(rules[risk], [
        "overdueRatio",
        "delayDays",
        "lateFrequency",
        "severeConcentration",
        "exposureMonths",
      ]);
    shape(config.factorsBps, ["Baixo", "Moderado", "Alto", "Crítico"]);
    validateConfig(config as unknown as PolicyProposal["config"]);
    return structuredClone(value as PolicyProposal);
  } catch {
    throw new ServerError(
      "PROPOSAL_INVALID",
      "Proposta de crédito inválida; somente rascunhos completos são aceitos.",
      400,
    );
  }
}

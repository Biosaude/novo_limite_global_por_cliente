import type { CreditConfig, Risk } from "./types.js";
/** Proposta inicial para revisão: não é política oficial nem concede crédito. */
export const proposedConfig: CreditConfig = {
  minimumReceipts: 3,
  minimumTitles: 2,
  minimumActiveMonths: 2,
  minimumWindowMonths: 2,
  minimumDateCoverage: 0.8,
  rules: {
    Moderado: {
      overdueRatio: 0.01,
      delayDays: 1,
      lateFrequency: 0.2,
      severeConcentration: 0.1,
      exposureMonths: 2,
    },
    Alto: {
      overdueRatio: 0.2,
      delayDays: 61,
      lateFrequency: 0.5,
      severeConcentration: 0.3,
      exposureMonths: 4,
    },
    Crítico: {
      overdueRatio: 0.5,
      delayDays: 91,
      lateFrequency: 0.75,
      severeConcentration: 0.5,
      exposureMonths: 6,
    },
  },
  factorsBps: { Baixo: 10000, Moderado: 7500, Alto: 5000, Crítico: 0 },
  maxRecommendationCents: null,
  reviewOverdue: true,
};
export const riskOrder: Risk[] = ["Baixo", "Moderado", "Alto", "Crítico"];
export function validateConfig(config: CreditConfig): void {
  for (const key of [
    "minimumReceipts",
    "minimumTitles",
    "minimumActiveMonths",
  ] as const)
    if (
      !Number.isInteger(config[key]) ||
      config[key] < 1 ||
      config[key] > 100000
    )
      throw new Error("Mínimos de amostra devem ser inteiros positivos.");
  if (
    !Number.isFinite(config.minimumWindowMonths) ||
    config.minimumWindowMonths < 1 ||
    config.minimumWindowMonths > 120
  )
    throw new Error("Janela mínima deve estar entre 1 e 120 meses.");
  if (
    !Number.isFinite(config.minimumDateCoverage) ||
    config.minimumDateCoverage <= 0 ||
    config.minimumDateCoverage > 1
  )
    throw new Error(
      "Cobertura mínima de datas deve estar entre 0 e 100%, exclusiva de zero.",
    );
  const levels = ["Moderado", "Alto", "Crítico"] as const;
  for (let index = 0; index < levels.length; index++)
    for (const [key, value] of Object.entries(config.rules[levels[index]])) {
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        (["overdueRatio", "lateFrequency", "severeConcentration"].includes(key)
          ? value > 1
          : value > 3650)
      )
        throw new Error(
          "Os critérios de risco contêm valores fora da faixa permitida.",
        );
      if (
        index &&
        value <
          config.rules[levels[index - 1]][
            key as keyof CreditConfig["rules"]["Alto"]
          ]
      )
        throw new Error(
          "Os critérios devem crescer de Moderado para Alto e Crítico.",
        );
    }
  for (let index = 0; index < riskOrder.length; index++) {
    const value = config.factorsBps[riskOrder[index]];
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 10000 ||
      (index && value > config.factorsBps[riskOrder[index - 1]])
    )
      throw new Error(
        "Fatores devem ser de 0 a 100%, não crescentes conforme o risco aumenta.",
      );
  }
  if (
    config.maxRecommendationCents !== null &&
    (!Number.isSafeInteger(config.maxRecommendationCents) ||
      config.maxRecommendationCents < 0)
  )
    throw new Error(
      "O teto proposto deve ser um valor monetário não negativo.",
    );
  if (typeof config.reviewOverdue !== "boolean")
    throw new Error("Defina a revisão manual da inadimplência.");
}

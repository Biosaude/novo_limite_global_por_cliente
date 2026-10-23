import { daysBetween } from "./dates";
import type { FinancialRecord } from "./types";
export const agingBandNames = [
  "Sem atraso / divergente",
  "1–30 dias",
  "31–60 dias",
  "61–90 dias",
  "91–180 dias",
  "Acima de 180 dias",
  "Sem vencimento",
] as const;
export type AgingBandIndex = 1 | 2 | 3 | 4 | 5;
export const selectableBands: AgingBandIndex[] = [1, 2, 3, 4, 5];
/** Mesmos limites e mesma referência da posição; não reclassifica a categoria de origem. */
export function agingBandIndex(
  record: FinancialRecord,
  reference: string,
): number {
  const days = record.due ? daysBetween(reference, record.due) : null;
  return days === null
    ? 6
    : days <= 0
      ? 0
      : days <= 30
        ? 1
        : days <= 60
          ? 2
          : days <= 90
            ? 3
            : days <= 180
              ? 4
              : 5;
}

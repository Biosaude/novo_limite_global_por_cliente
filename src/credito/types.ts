import type { FinancialRecord } from "../domain/types";
export type Risk = "Baixo" | "Moderado" | "Alto" | "Crítico";
export type ObservedRisk = Risk | "Dados insuficientes";
export interface RiskRule {
  overdueRatio: number;
  delayDays: number;
  lateFrequency: number;
  severeConcentration: number;
  exposureMonths: number;
}
export interface CreditConfig {
  minimumReceipts: number;
  minimumTitles: number;
  minimumActiveMonths: number;
  minimumWindowMonths: number;
  minimumDateCoverage: number;
  rules: Record<Exclude<Risk, "Baixo">, RiskRule>;
  factorsBps: Record<Risk, number>;
  maxRecommendationCents: number | null;
  reviewOverdue: boolean;
}
export interface PolicyProposal {
  id: string;
  version: number;
  createdAt: string;
  reason: string;
  config: CreditConfig;
  status: "draft";
}
/** Futuro contrato: o backend deve autenticar e autorizar o aprovador. Nunca carregado de propostas locais. */
export interface ApprovedPolicy {
  id: string;
  version: number;
  config: CreditConfig;
  approvedBy: string;
  approvedAt: string;
  justification: string;
}
export interface ApprovedLimit {
  id: string;
  clientKey: string;
  cents: number;
  approvedBy: string;
  approvedAt: string;
  justification: string;
  previousId?: string;
}
export interface CreditGovernance {
  source: "authenticated-backend";
  policy?: ApprovedPolicy;
  limits?: ApprovedLimit[];
}
export interface CreditBand {
  name: string;
  cents: number;
  count: number;
}
export interface PaymentMetrics {
  records: number;
  validDateRecords: number;
  titleCount: number;
  datedTitleCount: number;
  titleAnyLateCount: number;
  repeatedTitleCount: number;
  unknownTitleRecords: number;
  onTimeCount: number;
  lateCount: number;
  onTimeRatio: number | null;
  lateRatio: number | null;
  meanLateDays: number | null;
  weightedLateDays: number | null;
  weightedPaymentDays: number | null;
  meanPerEntry: number | null;
  meanPerTitle: number | null;
  meanMonthly: number | null;
  activeMonths: number;
  firstReceipt: string | null;
  lastReceipt: string | null;
  months: { name: string; value: number }[];
}
export interface CreditClient {
  key: string;
  name: string;
  variants: string[];
  representatives: string[];
  records: FinancialRecord[];
  upcoming: number;
  overdue: number;
  exposure: number;
  delinquency: number | null;
  received: number;
  bands: CreditBand[];
  maxDelay: number;
  severeConcentration: number | null;
  payments: PaymentMetrics;
  windowStart: string | null;
  windowEnd: string;
  windowMonths: number;
  creditReceipts: number;
  creditTermDays: number | null;
  baseLimit: number | null;
  risk: ObservedRisk;
  sufficient: boolean;
  reasons: string[];
  warnings: string[];
  recommendation: number | null;
  factorBps: number | null;
  recommendationStatus: string;
  approvedLimit: number | null;
  availableRaw: number | null;
  availableOperational: number | null;
  exceeded: number | null;
  estimatedHeadroom: number | null;
}

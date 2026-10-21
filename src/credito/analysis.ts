import Decimal from "decimal.js";
import type {
  Dataset,
  FinancialRecord,
  Filters,
  RawCell,
} from "../domain/types";
import { dateValue, cutoff, daysBetween } from "../domain/dates";
import { sum } from "../domain/money";
import { scalar, normalized, cellText } from "../importacao/mapping";
import type {
  CreditClient,
  CreditConfig,
  CreditGovernance,
  ObservedRisk,
  Risk,
} from "./types";
import { proposedConfig, validateConfig } from "./policy";
export const clientKey = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
/** Recupera campos adicionados nesta versão sem exigir reimportação das bases locais antigas. */
export function enrichCreditRecords(dataset: Dataset): FinancialRecord[] {
  const sheets = new Map(
    dataset.source.sheets.map((sheet) => [sheet.name, sheet]),
  );
  const indexes = new Map<string, Record<string, number>>();
  for (const map of dataset.mappings) {
    const header = sheets
      .get(map.sheet)
      ?.rows.find((row) => row.number === map.header);
    const aliases = {
      issued: ["dtemissao", "dataemissao", "emissao"],
      document: ["duplicata", "numerodaduplicata"],
      installment: ["parcela", "numerodaparcela"],
    };
    const fields: Record<string, number> = {};
    for (const [field, names] of Object.entries(aliases)) {
      const explicit = map.fields[field as keyof typeof map.fields];
      const matches =
        header?.cells
          .map((cell, index) =>
            names.includes(normalized(cellText(cell))) ? index : -1,
          )
          .filter((index) => index >= 0) ?? [];
      fields[field] =
        explicit === undefined
          ? matches.length === 1
            ? matches[0]
            : -1
          : explicit;
    }
    indexes.set(map.sheet, fields);
  }
  const rows = new Map<string, RawCell[]>(
    dataset.source.sheets.flatMap((sheet) =>
      sheet.rows.map(
        (row) => [`${sheet.name}:${row.number}`, row.cells] as const,
      ),
    ),
  );
  return dataset.records.map((record) => {
    const cells = rows.get(record.id) ?? [],
      fields = indexes.get(record.sheet) ?? {};
    const get = (field: string) => scalar(cells[fields[field]] as RawCell);
    return {
      ...record,
      issued:
        record.issued === undefined
          ? dateValue(get("issued"), dataset.source.date1904)
          : record.issued,
      document: record.document ?? String(get("document") ?? "").trim(),
      installment:
        record.installment ?? String(get("installment") ?? "").trim(),
    };
  });
}
export function titleKey(record: FinancialRecord): string | null {
  // A parcela faz parte da chave; uma linha nunca é interpretada como quitação integral.
  if (record.document && record.installment)
    return `${record.document.trim()}\u0000${record.installment.trim()}`;
  return record.title.trim()
    ? record.title.trim().toLocaleUpperCase("pt-BR")
    : null;
}
export function observedMonths(start: string, end: string): Decimal {
  let cursor = start,
    result = new Decimal(0);
  while (cursor <= end) {
    const year = Number(cursor.slice(0, 4)),
      month = Number(cursor.slice(5, 7));
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const until = last < end ? last : end;
    result = result.plus(
      new Decimal(daysBetween(until, cursor) + 1).div(
        Number(last.slice(8, 10)),
      ),
    );
    cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }
  return result;
}
const roundedCents = (value: Decimal): number | null => {
  const result = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return Number.isSafeInteger(result) ? result : null;
};
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const weighted = (
  rows: FinancialRecord[],
  days: (row: FinancialRecord) => number,
): number | null => {
  const total = sum(rows.map((row) => row.cents ?? 0));
  if (total <= 0) return null;
  return rows
    .reduce(
      (value, row) => value.plus(new Decimal(row.cents ?? 0).times(days(row))),
      new Decimal(0),
    )
    .div(total)
    .toNumber();
};
export function analyzeCredit(
  dataset: Dataset,
  filters: Filters,
  config: CreditConfig = proposedConfig,
  governance?: CreditGovernance,
): CreditClient[] {
  validateConfig(config);
  const all = enrichCreditRecords(dataset),
    end = cutoff(dataset.reference, filters.year, filters.month),
    start = `${filters.year}-01-01`;
  const allReceipts = all.filter(
    (row) =>
      row.category === "received" &&
      row.received &&
      row.received >= start &&
      row.received <= end,
  );
  const windowStart = allReceipts.map((row) => row.received!).sort()[0] ?? null;
  const months = windowStart
    ? observedMonths(windowStart, end)
    : new Decimal(0);
  const grouped = new Map<string, FinancialRecord[]>();
  for (const row of all) {
    const key = clientKey(row.client) || `SEM-IDENTIFICACAO:${row.id}`;
    const entries = grouped.get(key) ?? [];
    entries.push(row);
    grouped.set(key, entries);
  }
  const portfolioOverdue = sum(
    all
      .filter((row) => row.category === "overdue")
      .map((row) => row.cents ?? 0),
  );
  return [...grouped]
    .filter(
      ([key, rows]) =>
        (!filters.client || key === clientKey(filters.client)) &&
        (!filters.representative ||
          rows.some(
            (row) =>
              (row.representative || "Sem representante") ===
              filters.representative,
          )) &&
        (!filters.category ||
          rows.some(
            (row) =>
              row.category === filters.category &&
              (row.category !== "received" ||
                (row.received && row.received >= start && row.received <= end)),
          )),
    )
    .map(([key, rows]) => {
      const receipt = rows.filter(
        (row) =>
          row.category === "received" &&
          row.received &&
          row.received >= start &&
          row.received <= end,
      );
      const financial = (category: FinancialRecord["category"]) =>
        sum(
          rows
            .filter((row) => row.category === category)
            .map((row) => row.cents ?? 0),
        );
      const upcoming = financial("upcoming"),
        overdue = financial("overdue"),
        exposure = sum([upcoming, overdue]),
        received = sum(receipt.map((row) => row.cents ?? 0));
      const positive = receipt.filter((row) => (row.cents ?? 0) > 0),
        dated = positive.filter((row) => row.due && row.received),
        late = dated.filter((row) => row.received! > row.due!),
        onTime = dated.length - late.length;
      const unique = new Map<string, FinancialRecord[]>();
      let unknownTitleRecords = 0;
      for (const row of receipt) {
        const title = titleKey(row);
        if (!title) {
          unknownTitleRecords++;
          continue;
        }
        unique.set(title, [...(unique.get(title) ?? []), row]);
      }
      const contracts = new Map<string, Set<number>>();
      for (const row of rows) {
        if (
          row.category === "received" &&
          (!row.received || row.received < start || row.received > end)
        )
          continue;
        const title = titleKey(row);
        if (title && row.issued && row.due) {
          const values = contracts.get(title) ?? new Set<number>();
          values.add(daysBetween(row.due, row.issued));
          contracts.set(title, values);
        }
      }
      const usableContracts = new Map(
        [...contracts].filter(
          ([, values]) => values.size === 1 && [...values][0] > 0,
        ),
      );
      const terms = [...usableContracts.values()]
        .map((values) => [...values][0])
        .sort((a, b) => a - b);
      const term = terms.length
        ? (terms[Math.floor((terms.length - 1) / 2)] +
            terms[Math.floor(terms.length / 2)]) /
          2
        : null;
      const creditReceipt = positive.filter((row) => {
        const title = titleKey(row);
        return (
          title &&
          usableContracts.has(title) &&
          row.issued &&
          row.received! >= row.issued
        );
      });
      const creditReceipts = sum(creditReceipt.map((row) => row.cents ?? 0));
      const activeMonths = new Set(
        positive.map((row) => row.received!.slice(0, 7)),
      ).size;
      const creditMonths = new Set(
        creditReceipt.map((row) => row.received!.slice(0, 7)),
      ).size;
      const creditTitles = new Set(creditReceipt.map((row) => titleKey(row)))
        .size;
      const bands = [
        "1–30 dias",
        "31–60 dias",
        "61–90 dias",
        "Acima de 90 dias",
        "Sem atraso / divergente",
        "Sem vencimento",
      ].map((name) => ({ name, cents: 0, count: 0 }));
      let maxDelay = 0;
      for (const row of rows.filter((row) => row.category === "overdue")) {
        const days = row.due ? daysBetween(dataset.reference, row.due) : null;
        const index =
          days === null
            ? 5
            : days <= 0
              ? 4
              : days <= 30
                ? 0
                : days <= 60
                  ? 1
                  : days <= 90
                    ? 2
                    : 3;
        bands[index].cents = sum([bands[index].cents, row.cents ?? 0]);
        bands[index].count++;
        if (days !== null) maxDelay = Math.max(maxDelay, days);
      }
      const reasons: string[] = [],
        warnings: string[] = [
          "Identificação apenas por nome: não há CNPJ ou código único. A correspondência exata não comprova identidade jurídica.",
          "Histórico de recebimentos não comprova faturamento completo, cobertura contínua ou quitação integral dos títulos.",
        ];
      const variants = [
        ...new Set(rows.map((row) => row.client).filter(Boolean)),
      ];
      if (variants.length > 1)
        warnings.push(
          `${variants.length} grafias foram consolidadas somente por espaços e capitalização; confira possíveis homônimos.`,
        );
      const badMoney =
        rows
          .filter(
            (row) =>
              row.category !== "received" ||
              (row.received && row.received >= start && row.received <= end),
          )
          .some((row) => row.cents === null || (row.cents ?? 0) < 0) ||
        exposure < 0;
      const dateCoverage = positive.length ? dated.length / positive.length : 0;
      const openRows = rows.filter(
        (row) => row.category !== "received" && (row.cents ?? 0) > 0,
      );
      const openDateCoverage = openRows.length
        ? openRows.filter((row) => row.due).length / openRows.length
        : 1;
      if (openDateCoverage < 1)
        warnings.push(
          "Há títulos em aberto sem vencimento válido; confira a cobertura dos dados de exposição.",
        );
      const ids = new Set(rows.map((row) => row.id));
      const auditIssues = dataset.issues.filter((issue) =>
        issue.records.some((id) => ids.has(id)),
      );
      if (auditIssues.length)
        warnings.push(
          `${auditIssues.length} ocorrências na auditoria da base para este cliente. Confira divergências de dias/categoria e sobreposições antes de decidir crédito.`,
        );
      const validPayment = positive.filter(
        (row) => row.issued && row.received! >= row.issued,
      );
      const negativeTerms = [...contracts.values()].filter((values) =>
        [...values].some((value) => value < 0),
      ).length;
      if (badMoney)
        warnings.push(
          "Valores negativos ou inválidos exigem revisão; estimativas numéricas e classificação foram suspensas.",
        );
      if (unknownTitleRecords)
        warnings.push(
          `${unknownTitleRecords} recebimentos sem título identificável; métricas por título têm cobertura parcial.`,
        );
      const conflicts = [...contracts.values()].filter(
        (values) => values.size > 1,
      ).length;
      if (conflicts)
        warnings.push(
          `${conflicts} títulos têm prazos contratuais divergentes e foram excluídos da estimativa de prazo.`,
        );
      if (negativeTerms)
        warnings.push(
          `${negativeTerms} títulos com vencimento anterior à emissão; revisar datas.`,
        );
      if (receipt.length !== dated.length)
        warnings.push(
          `Pontualidade calculada em ${dated.length} de ${receipt.length} lançamentos: somente valores positivos com datas válidas.`,
        );
      if (validPayment.length !== positive.length)
        warnings.push(
          "Prazo de pagamento usa somente valores positivos com emissão e recebimento válidos e em ordem cronológica.",
        );
      const sufficient =
        !!clientKey(rows[0].client) &&
        !badMoney &&
        positive.length >= config.minimumReceipts &&
        new Set(positive.map(titleKey).filter(Boolean)).size >=
          config.minimumTitles &&
        activeMonths >= config.minimumActiveMonths &&
        months.gte(config.minimumWindowMonths) &&
        dateCoverage >= config.minimumDateCoverage &&
        openDateCoverage >= config.minimumDateCoverage;
      if (!sufficient)
        reasons.push(
          "Dados insuficientes para classificar: confira identificação, amostra de recebimentos, títulos, meses e cobertura de datas nos critérios propostos.",
        );
      const baseEligible =
        sufficient &&
        creditReceipt.length >= config.minimumReceipts &&
        creditTitles >= config.minimumTitles &&
        creditMonths >= config.minimumActiveMonths &&
        term !== null;
      const baseLimit = baseEligible
        ? roundedCents(
            new Decimal(creditReceipts).div(months).times(term!).div(30),
          )
        : null;
      const meanMonthly = months.gt(0)
        ? roundedCents(new Decimal(received).div(months))
        : null;
      const delinquency = exposure > 0 ? overdue / exposure : null;
      const concentration = overdue > 0 ? bands[3].cents / overdue : null;
      const exposureMonths =
        meanMonthly !== null && meanMonthly > 0 ? exposure / meanMonthly : null;
      let risk: ObservedRisk = sufficient ? "Baixo" : "Dados insuficientes";
      if (sufficient)
        for (const level of ["Crítico", "Alto", "Moderado"] as const) {
          const rule = config.rules[level];
          const triggers = [
            delinquency !== null &&
            overdue > 0 &&
            delinquency >= rule.overdueRatio
              ? `inadimplência ≥ ${(rule.overdueRatio * 100).toFixed(0)}%`
              : null,
            maxDelay > 0 && maxDelay >= rule.delayDays
              ? `atraso atual ≥ ${rule.delayDays} dias`
              : null,
            dated.length && late.length / dated.length >= rule.lateFrequency
              ? `frequência de atrasos ≥ ${(rule.lateFrequency * 100).toFixed(0)}%`
              : null,
            concentration !== null &&
            bands[3].cents > 0 &&
            concentration >= rule.severeConcentration
              ? `concentração acima de 90 dias ≥ ${(rule.severeConcentration * 100).toFixed(0)}%`
              : null,
            exposureMonths !== null && exposureMonths >= rule.exposureMonths
              ? `exposição ≥ ${rule.exposureMonths} meses de recebimentos médios`
              : null,
          ].filter((value): value is string => !!value);
          if (triggers.length) {
            risk = level;
            reasons.push(
              `Risco observado ${level}: ${triggers.join("; ")}. Prevalece o critério mais severo.`,
            );
            break;
          }
        }
      if (risk === "Baixo")
        reasons.push(
          "Nenhum limiar proposto foi atingido na amostra disponível; isso não constitui análise completa de crédito.",
        );
      if (baseEligible && baseLimit === null)
        reasons.push(
          "Limite-base excede a precisão monetária suportada; nenhum valor foi apresentado.",
        );
      else if (baseLimit === null)
        reasons.push(
          "Limite-base indisponível: são necessários recebimentos a prazo identificáveis, emissão/vencimento consistentes e amostra suficiente.",
        );
      else
        reasons.push(
          "Limite-base provisório: recebimentos positivos de operações a prazo ÷ meses da janela observada × mediana do prazo emissão–vencimento por título ÷ 30. Não representa faturamento completo.",
        );
      let recommendation: number | null = null,
        factorBps: number | null = null,
        recommendationStatus = "Pendente de política de crédito";
      const policy =
        governance?.source === "authenticated-backend"
          ? governance.policy
          : undefined;
      if (
        policy &&
        policy.approvedBy &&
        policy.approvedAt &&
        policy.justification
      ) {
        validateConfig(policy.config);
        if (JSON.stringify(policy.config) !== JSON.stringify(config))
          recommendationStatus =
            "Política aprovada difere dos critérios usados; revisar versão.";
        else if (baseLimit === null || risk === "Dados insuficientes")
          recommendationStatus = "Dados insuficientes";
        else if (policy.config.reviewOverdue && overdue > 0)
          recommendationStatus = "Revisão manual obrigatória por inadimplência";
        else {
          factorBps = policy.config.factorsBps[risk as Risk];
          recommendation = roundedCents(
            new Decimal(baseLimit).times(factorBps).div(10000),
          );
          if (
            recommendation !== null &&
            policy.config.maxRecommendationCents !== null
          )
            recommendation = Math.min(
              recommendation,
              policy.config.maxRecommendationCents,
            );
          recommendationStatus =
            "Estimativa gerencial — não é crédito aprovado";
        }
      }
      const limit =
        governance?.source === "authenticated-backend"
          ? governance.limits?.find(
              (item) =>
                item.clientKey === key &&
                Number.isSafeInteger(item.cents) &&
                item.cents >= 0 &&
                item.approvedBy &&
                item.approvedAt &&
                item.justification,
            )
          : undefined;
      const availableRaw = limit
        ? roundedCents(new Decimal(limit.cents).minus(exposure))
        : null;
      const paymentDates = receipt.map((row) => row.received!).sort();
      const monthGroups = new Map<string, number[]>();
      for (const row of receipt) {
        const month = row.received!.slice(0, 7);
        monthGroups.set(month, [
          ...(monthGroups.get(month) ?? []),
          row.cents ?? 0,
        ]);
      }
      if (portfolioOverdue > 0 && overdue > 0)
        warnings.push(
          `Participação nos vencidos da carteira integral: ${((overdue / portfolioOverdue) * 100).toFixed(2)}%. Risco completo também depende de dados externos.`,
        );
      return {
        key,
        name: rows[0].client.trim().replace(/\s+/g, " ") || "Sem identificação",
        variants,
        representatives: [
          ...new Set(
            rows.map((row) => row.representative || "Sem representante"),
          ),
        ],
        records: rows.filter(
          (row) =>
            row.category !== "received" ||
            (row.received && row.received >= start && row.received <= end),
        ),
        upcoming,
        overdue,
        exposure,
        delinquency,
        received,
        bands,
        maxDelay,
        severeConcentration: concentration,
        windowStart,
        windowEnd: end,
        windowMonths: months.toNumber(),
        creditReceipts,
        creditTermDays: term,
        baseLimit,
        risk,
        sufficient,
        reasons,
        warnings,
        recommendation,
        factorBps,
        recommendationStatus,
        approvedLimit: limit?.cents ?? null,
        availableRaw,
        availableOperational:
          availableRaw === null ? null : Math.max(0, availableRaw),
        exceeded: availableRaw === null ? null : Math.max(0, -availableRaw),
        estimatedHeadroom:
          recommendation === null
            ? null
            : roundedCents(new Decimal(recommendation).minus(exposure)),
        payments: {
          records: receipt.length,
          validDateRecords: dated.length,
          titleCount: unique.size,
          datedTitleCount: [...unique.values()].filter((entries) =>
            entries.some(
              (row) => (row.cents ?? 0) > 0 && row.due && row.received,
            ),
          ).length,
          titleAnyLateCount: [...unique.values()].filter((entries) =>
            entries.some(
              (row) =>
                (row.cents ?? 0) > 0 &&
                row.due &&
                row.received &&
                row.received > row.due,
            ),
          ).length,
          repeatedTitleCount: [...unique.values()].filter(
            (entries) => entries.length > 1,
          ).length,
          unknownTitleRecords,
          onTimeCount: onTime,
          lateCount: late.length,
          onTimeRatio: dated.length ? onTime / dated.length : null,
          lateRatio: dated.length ? late.length / dated.length : null,
          meanLateDays: mean(
            late.map((row) => daysBetween(row.received!, row.due!)),
          ),
          weightedLateDays: weighted(late, (row) =>
            daysBetween(row.received!, row.due!),
          ),
          weightedPaymentDays: weighted(validPayment, (row) =>
            daysBetween(row.received!, row.issued!),
          ),
          meanPerEntry: receipt.length
            ? roundedCents(new Decimal(received).div(receipt.length))
            : null,
          meanPerTitle:
            unique.size && unknownTitleRecords === 0
              ? roundedCents(new Decimal(received).div(unique.size))
              : null,
          meanMonthly,
          activeMonths,
          firstReceipt: paymentDates[0] ?? null,
          lastReceipt: paymentDates.at(-1) ?? null,
          months: [...monthGroups]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, values]) => ({ name, value: sum(values) })),
        },
      };
    })
    .sort(
      (a, b) =>
        b.exposure - a.exposure || a.name.localeCompare(b.name, "pt-BR"),
    );
}

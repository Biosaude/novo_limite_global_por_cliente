import { useState } from "react";
import type { CreditConfig, PolicyProposal, RiskRule } from "./types";
import { riskOrder, validateConfig } from "./policy";
import { proposalRepository } from "../persistencia/repository";
import { cents, money } from "../domain/money";
export function PolicyEditor({
  config,
  versions,
  onSave,
}: {
  config: CreditConfig;
  versions: PolicyProposal[];
  onSave: (proposal: PolicyProposal) => void;
}) {
  const [draft, setDraft] = useState<CreditConfig>(() =>
      structuredClone(config),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cap, setCap] = useState(
      config.maxRecommendationCents === null
        ? ""
        : String(config.maxRecommendationCents / 100),
    );
  const labels: Record<keyof RiskRule, string> = {
    overdueRatio: "Inadimplência ≥ (%)",
    delayDays: "Atraso máximo ≥ (dias)",
    lateFrequency: "Lançamentos tardios ≥ (%)",
    severeConcentration: "Vencidos >90 dias ≥ (% dos vencidos)",
    exposureMonths: "Exposição ≥ (meses de recebimentos)",
  };
  return (
    <details className="panel policy-editor">
      <summary>Proposta de política de risco — configurar e revisar</summary>
      <div className="info-banner">
        <div>
          <strong>Proposta em revisão, sem política oficial ativa</strong>
          <p>
            Salvar estes parâmetros registra uma proposta local e atualiza
            apenas a prévia de risco observado. Não aprova política, limites ou
            vendas. A aprovação autenticada será integrada em uma etapa futura.
          </p>
        </div>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          try {
            const next = {
              ...draft,
              maxRecommendationCents: cap.trim() ? cents(cap) : null,
            };
            validateConfig(next);
            if (reason.trim().length < 5)
              throw new Error(
                "Descreva a justificativa da proposta (mínimo de cinco caracteres).",
              );
            const proposal: PolicyProposal = {
              id: crypto.randomUUID(),
              version:
                Math.max(0, ...versions.map((version) => version.version)) + 1,
              createdAt: new Date().toISOString(),
              reason: reason.trim(),
              config: structuredClone(next),
              status: "draft",
            };
            await proposalRepository.append(proposal);
            onSave(proposal);
            setReason("");
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Não foi possível salvar a proposta.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="policy-fields">
          {(
            [
              ["minimumReceipts", "Mínimo de recebimentos positivos"],
              ["minimumTitles", "Mínimo de títulos distintos"],
              ["minimumActiveMonths", "Mínimo de meses com recebimentos"],
              ["minimumWindowMonths", "Janela mínima observada (meses)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={1}
                step={key === "minimumWindowMonths" ? "0.1" : "1"}
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
          <label>
            Cobertura mínima das datas (%)
            <input
              type="number"
              min={1}
              max={100}
              value={draft.minimumDateCoverage * 100}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  minimumDateCoverage: Number(event.target.value) / 100,
                })
              }
            />
          </label>
          <label>
            Teto proposto (R$; opcional)
            <input
              aria-label="Teto proposto"
              inputMode="decimal"
              value={cap}
              onChange={(event) => setCap(event.target.value)}
            />
          </label>
        </div>
        <p className="helper">
          Prevalece o nível mais severo cujo critério seja atingido. A
          concentração refere-se à parcela dos saldos vencidos com mais de 90
          dias. A classificação é de risco observado e usa recebimentos como
          proxy, sem consulta externa.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Critério proposto</th>
                <th>Moderado</th>
                <th>Alto</th>
                <th>Crítico</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(labels).map(([field, label]) => (
                <tr key={field}>
                  <td>{label}</td>
                  {(["Moderado", "Alto", "Crítico"] as const).map((level) => {
                    const key = field as keyof RiskRule;
                    const percent = [
                      "overdueRatio",
                      "lateFrequency",
                      "severeConcentration",
                    ].includes(key);
                    return (
                      <td key={level}>
                        <input
                          aria-label={`${level}: ${label}`}
                          type="number"
                          min={0}
                          max={percent ? 100 : 3650}
                          step="0.1"
                          value={draft.rules[level][key] * (percent ? 100 : 1)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              rules: {
                                ...draft.rules,
                                [level]: {
                                  ...draft.rules[level],
                                  [key]:
                                    Number(event.target.value) /
                                    (percent ? 100 : 1),
                                },
                              },
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="policy-fields">
          {riskOrder.map((risk) => (
            <label key={risk}>
              Fator proposto — {risk} (%)
              <input
                aria-label={`Fator proposto ${risk}`}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={draft.factorsBps[risk] / 100}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    factorsBps: {
                      ...draft.factorsBps,
                      [risk]: Math.round(Number(event.target.value) * 100),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.reviewOverdue}
            onChange={(event) =>
              setDraft({ ...draft, reviewOverdue: event.target.checked })
            }
          />
          Exigir revisão manual quando houver saldo vencido
        </label>
        <label className="proposal-reason">
          Justificativa da proposta
          <textarea
            aria-label="Justificativa da proposta"
            value={reason}
            maxLength={3000}
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Salvando proposta…" : "Salvar proposta para revisão"}
        </button>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </form>
      <h3>Histórico de propostas (sem aprovação)</h3>
      {versions.length ? (
        <ul className="proposal-history">
          {versions.map((version) => (
            <li key={version.id}>
              <strong>
                Proposta v{version.version} ·{" "}
                {new Date(version.createdAt).toLocaleString("pt-BR")}
              </strong>
              <p>{version.reason}</p>
              <details>
                <summary>Parâmetros registrados</summary>
                <pre>{JSON.stringify(version.config, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="helper">
          Parâmetros iniciais propostos: fatores 100%, 75%, 50% e 0%; mínimos de
          3 recebimentos, 2 títulos e 2 meses. Nenhum deles é política oficial.
          Salve uma proposta com justificativa para iniciar o histórico de
          versões.
        </p>
      )}
      <p className="helper">
        Teto atual da proposta:{" "}
        {config.maxRecommendationCents === null
          ? "não definido"
          : money(config.maxRecommendationCents)}
        . Os registros são locais, não autenticados e não substituem aprovação
        administrativa.
      </p>
    </details>
  );
}

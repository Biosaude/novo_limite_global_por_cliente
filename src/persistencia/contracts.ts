import type { Dataset } from "../domain/types";
import type { PolicyProposal } from "../credito/types";
/** Contrato compartilhado, sem dependência de IndexedDB, rede ou driver SQL. */
export interface DatasetRepository {
  load(): Promise<Dataset | null>;
  save(dataset: Dataset): Promise<void>;
  clear(): Promise<void>;
  history(): Promise<Dataset[]>;
}
export interface ProposalRepository {
  list(): Promise<PolicyProposal[]>;
  append(proposal: PolicyProposal): Promise<void>;
}

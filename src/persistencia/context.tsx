import { createContext, useContext } from "react";
import type { DatasetRepository, ProposalRepository } from "./contracts";
import { localRepository, proposalRepository } from "./repository";
import type { HttpDatasetRepository } from "./http";
export interface Persistence {
  datasets: DatasetRepository;
  proposals: ProposalRepository;
  remote?: HttpDatasetRepository;
  mode: "local" | "remote";
}
export const localPersistence: Persistence = { datasets: localRepository, proposals: proposalRepository, mode: "local" };
export const PersistenceContext = createContext<Persistence>(localPersistence);
export const usePersistence = () => useContext(PersistenceContext);

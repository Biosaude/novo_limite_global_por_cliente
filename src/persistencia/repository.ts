import { refreshDayAnalysis } from "../importacao/dayAnalysis";
import type { Dataset } from "../domain/types";
import type { PolicyProposal } from "../credito/types";
import type {DatasetRepository,ProposalRepository} from "./contracts";
export type {DatasetRepository,ProposalRepository} from "./contracts";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("biosaude-financeiro", 2);
    request.onupgradeneeded = () => {
      for (const name of ["datasets", "versions", "credit-proposals"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("O navegador não permitiu abrir o armazenamento local."),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Feche outras abas antigas deste dashboard para atualizar o armazenamento local.",
        ),
      );
  });
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => () => T,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: () => T;
    try {
      result = action(tx);
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      try {
        resolve(result());
      } catch (error) {
        reject(error);
      }
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Falha no armazenamento local. A versão anterior foi preservada; verifique espaço e permissões.",
        ),
      );
    };
  });
}
function valid(dataset: Dataset | undefined): Dataset | null {
  if (!dataset) return null;
  if (
    dataset.version !== 1 ||
    !Array.isArray(dataset.records) ||
    !dataset.source ||
    !Array.isArray(dataset.issues)
  )
    throw new Error("A base local não é compatível. Reimporte a planilha.");
  return refreshDayAnalysis(dataset);
}
export const localRepository: DatasetRepository = {
  async load() {
    return transaction(["datasets"], "readonly", (tx) => {
      const req = tx.objectStore("datasets").get("active");
      return () => valid(req.result);
    });
  },
  async save(dataset) {
    await transaction(["datasets", "versions"], "readwrite", (tx) => {
      const active = tx.objectStore("datasets"),
        versions = tx.objectStore("versions");
      const previous = active.get("active");
      previous.onsuccess = () => {
        if (previous.result) versions.put(previous.result, previous.result.id);
        versions.put(dataset, dataset.id);
        active.put(dataset, "active");
      };
      return () => undefined;
    });
  },
  async clear() {
    await transaction(["datasets", "versions"], "readwrite", (tx) => {
      const store = tx.objectStore("datasets");
      const req = store.get("active");
      req.onsuccess = () => {
        if (req.result)
          tx.objectStore("versions").put(req.result, req.result.id);
        store.delete("active");
      };
      return () => undefined;
    });
  },
  async history() {
    return transaction(["versions", "datasets"], "readonly", (tx) => {
      const versions = tx.objectStore("versions").getAll(),
        active = tx.objectStore("datasets").get("active");
      return () => {
        const result = new Map<string, Dataset>();
        for (const item of [...versions.result, active.result].filter(
          Boolean,
        )) {
          const dataset = valid(item);
          if (dataset) result.set(dataset.id, dataset);
        }
        return [...result.values()].sort((a, b) =>
          (b.updatedAt ?? b.importedAt).localeCompare(
            a.updatedAt ?? a.importedAt,
          ),
        );
      };
    });
  },
};
export const proposalRepository: ProposalRepository = {
  async list(): Promise<PolicyProposal[]> {
    return transaction(["credit-proposals"], "readonly", (tx) => {
      const req = tx.objectStore("credit-proposals").getAll();
      return () =>
        req.result.sort((a: PolicyProposal, b: PolicyProposal) =>
          b.createdAt.localeCompare(a.createdAt),
        );
    });
  },
  async append(proposal: PolicyProposal): Promise<void> {
    await transaction(["credit-proposals"], "readwrite", (tx) => {
      tx.objectStore("credit-proposals").add(proposal, proposal.id);
      return () => undefined;
    });
  },
};

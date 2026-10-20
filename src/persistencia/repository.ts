import type { Dataset } from "../domain/types";
export interface DatasetRepository {
  load(): Promise<Dataset | null>;
  save(dataset: Dataset): Promise<void>;
  clear(): Promise<void>;
}
/** Contrato isolado: integração futura poderá substituir esta implementação após autorização. */
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("biosaude-financeiro", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("datasets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("O navegador não permitiu abrir o armazenamento local."),
      );
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("datasets", mode);
    const request = action(transaction.objectStore("datasets"));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result as T);
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        new Error(
          "Falha no armazenamento local. Verifique o espaço e as permissões do navegador.",
        ),
      );
    };
  });
}
export const localRepository: DatasetRepository = {
  async load() {
    const value = await transact<Dataset | undefined>("readonly", (store) =>
      store.get("active"),
    );
    if (!value) return null;
    if (
      value.version !== 1 ||
      !Array.isArray(value.records) ||
      !value.source ||
      !Array.isArray(value.issues)
    )
      throw new Error("A base local não é compatível. Reimporte a planilha.");
    return value;
  },
  async save(dataset) {
    await transact("readwrite", (store) => store.put(dataset, "active"));
  },
  async clear() {
    await transact("readwrite", (store) => store.delete("active"));
  },
};

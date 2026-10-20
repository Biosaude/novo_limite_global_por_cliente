import type { SourceWorkbook } from "../domain/types";
function requestWorker<T>(
  request: ArrayBuffer | { type: "template" },
  field: "workbook" | "template",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "O processamento excedeu 90 segundos. A base anterior foi preservada.",
        ),
      );
    }, 90000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event) => {
      finish();
      event.data.error
        ? reject(new Error(event.data.error))
        : resolve(event.data[field]);
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "O processamento do Excel falhou. Tente novamente ou confira se o arquivo está íntegro.",
        ),
      );
    };
    worker.postMessage(
      request,
      request instanceof ArrayBuffer ? [request] : [],
    );
  });
}
export async function readFile(file: File): Promise<SourceWorkbook> {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "Selecione uma planilha no formato .xlsx. Arquivos .xls e outros formatos não são aceitos.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      "O arquivo excede o limite de 20 MB. Nenhuma base foi substituída.",
    );
  return requestWorker(await file.arrayBuffer(), "workbook");
}
export async function downloadTemplate(): Promise<void> {
  const template = await requestWorker<ArrayBuffer>(
    { type: "template" },
    "template",
  );
  const url = URL.createObjectURL(
    new Blob([template], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "Modelo_Base_Limite_Global_Biosaude.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // O navegador precisa consumir a URL antes da liberação; não há envio a servidor.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

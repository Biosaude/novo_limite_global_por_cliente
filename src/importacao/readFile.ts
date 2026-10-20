import type { SourceWorkbook } from "../domain/types";
export async function readFile(file: File): Promise<SourceWorkbook> {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error(
      "Selecione uma planilha no formato .xlsx. Arquivos .xls e outros formatos não são aceitos.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      "O arquivo excede o limite de 20 MB. Nenhuma base foi substituída.",
    );
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "A leitura excedeu 90 segundos. A base anterior foi preservada.",
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
        : resolve(event.data.workbook);
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "O processamento da planilha falhou. Tente novamente ou confira se o arquivo está íntegro.",
        ),
      );
    };
    worker.postMessage(buffer, [buffer]);
  });
}

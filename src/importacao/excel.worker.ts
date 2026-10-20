import { readWorkbook } from "./workbook";
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ workbook: await readWorkbook(event.data) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível processar o arquivo.",
    });
  }
};

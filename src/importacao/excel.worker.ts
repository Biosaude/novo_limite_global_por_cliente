import { readWorkbook } from "./workbook";
import { createTemplate } from "./template";
self.onmessage = async (
  event: MessageEvent<ArrayBuffer | { type: "template" }>,
) => {
  try {
    if (
      !(event.data instanceof ArrayBuffer) &&
      event.data.type === "template"
    ) {
      const template = await createTemplate();
      self.postMessage({ template }, { transfer: [template] });
    } else {
      self.postMessage({
        workbook: await readWorkbook(event.data as ArrayBuffer),
      });
    }
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível processar o Excel.",
    });
  }
};

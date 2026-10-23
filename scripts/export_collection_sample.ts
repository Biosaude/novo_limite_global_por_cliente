/** Exemplo local: tsx scripts/export_collection_sample.ts base.xlsx 2026-10-23 /pasta/privada */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { readWorkbook } from "../src/importacao/workbook";
import { normalize } from "../src/importacao/normalize";
import { suggestMappings } from "../src/importacao/mapping";
import { initialFilters, selectRecords } from "../src/domain/finance";
import {
  buildCollectionView,
  initialCollectionQuery,
} from "../src/cobranca/query";
import { createCollectionExcel } from "../src/relatorios/excel";
import { createCollectionPdf } from "../src/relatorios/pdf";
const [file, reference, directory] = process.argv.slice(2);
if (!file || !reference || !directory)
  throw new Error(
    "Informe arquivo.xlsx, referência ISO e diretório privado de saída.",
  );
const source = await readWorkbook(Uint8Array.from(await readFile(file)).buffer);
const dataset = normalize(
  source,
  suggestMappings(source),
  reference,
  basename(file),
);
if (dataset.issues.some((issue) => issue.severity === "error"))
  throw new Error(
    "A base contém erros bloqueantes. Confira a importação antes de gerar relatórios.",
  );
const filters = initialFilters(dataset),
  view = buildCollectionView(
    dataset,
    selectRecords(dataset, filters),
    filters,
    { ...initialCollectionQuery, bands: [4, 5] },
  );
const stamp = new Date().toISOString(),
  font = await readFile(
    new URL("../src/relatorios/assets/DejaVuSans.ttf", import.meta.url),
    "base64",
  );
await mkdir(directory, { recursive: true });
await writeFile(
  join(directory, `Pendencias_Reais_${reference}.xlsx`),
  await createCollectionExcel(view, stamp),
);
await writeFile(
  join(directory, `Pendencias_Reais_${reference}.pdf`),
  createCollectionPdf(view, font, stamp),
);
console.log(
  JSON.stringify({
    reference,
    bands: ["91–180 dias", "Acima de 180 dias"],
    ...view.summary,
  }),
);

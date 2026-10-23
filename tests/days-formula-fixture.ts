import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
/** Só altera F2:F… das duas primeiras abas; preserva valores e caches financeiros. */
export function officialDaysFormulaFixture(buffer: Buffer): Buffer {
  const entries = unzipSync(new Uint8Array(buffer));
  for (const [index, path] of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].entries()) {
    let count = 0;
    const xml = strFromU8(entries[path]).replace(/<c\b([^>]*\br="F([1-9]\d*)"[^>]*)>([\s\S]*?)<\/c>/g,
      (original, attributes: string, row: string) => {
        if (Number(row) <= 1) return original;
        count++;
        const formula = index === 0 ? `E${row}-TODAY()` : `TODAY()-E${row}`;
        return `<c${attributes.replace(/\s+t="[^"]*"/g, '')}><f>${formula}</f></c>`;
      });
    if (!count) throw new Error('Fixture sem células F de dados para substituir.');
    entries[path] = strToU8(xml);
  }
  return Buffer.from(zipSync(entries));
}

export async function syntheticDaysFormulaFixture(invalidFormula = false): Promise<Buffer> {
  const {default: ExcelJS} = await import('exceljs');
  const {createTemplate} = await import('../src/importacao/template');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createTemplate());
  for (const [index, sheet] of workbook.worksheets.entries()) {
    const headers = sheet.getRow(1).values as string[];
    const put = (header: string, value: any) => sheet.getRow(2).getCell(headers.indexOf(header)).value = value;
    put('Nome cliente', 'CLIENTE SINTÉTICO FÓRMULAS');
    put('Nome representante', 'REPRESENTANTE SINTÉTICO');
    put('Duplicata', 100+index); put('Parcela',1); put('Numero do titulo completo', `${100+index}/01`);
    put('Dt.emissao', new Date('2026-10-01T00:00:00Z'));
    put('Dt.vencimento', new Date(index===0?'2026-10-25T00:00:00Z':'2026-10-21T00:00:00Z'));
    put('Vr.duplicata',9999);
    put(index===2?'Vr.recebido':'Vr.aberto',[100,50,30][index]);
    if(index===2) put('Dt.recebimento',new Date('2026-10-22T00:00:00Z'));
    if(index===0 && invalidFormula) sheet.getCell('F2').value={formula:'D2-TODAY()',result:2};
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
